// server/server.js

require('dotenv').config();
const express = require('express');
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const WebSocket = require('ws');
const { URL } = require('url');
const multer = require('multer');

// ===== Basics =====
const app = express();
const port = process.env.PORT || 8080;

const apiKey =
  process.env.GEMINI_API_KEY2 ||
  process.env.GEMINI_API_KEY ||
  process.env.API_KEY;


const externalApiBaseUrl = 'https://generativelanguage.googleapis.com';
const externalWsBaseUrl  = 'wss://generativelanguage.googleapis.com';

// Paths (Dockerfile copies dist/ & public/ into /app/server/)
const staticPath = path.join(__dirname, 'dist');
const publicPath = path.join(__dirname, 'public');

// Body parsing for JSON endpoints (not used by multer routes)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

if (!apiKey) {
  console.warn('⚠️  No GEMINI_API_KEY provided. Proxy/vision features will fail.');
}

// Small helper to log upstream errors cleanly
function logAxiosError(prefix, err) {
  const code   = err?.code;
  const status = err?.response?.status;
  const data   = err?.response?.data;
  const msg    = err?.message;
  console.error(`${prefix} code=${code || 'n/a'} status=${status || 'n/a'} msg=${msg || 'n/a'}`);
  if (data) {
    try {
      const text = typeof data === 'string' ? data : JSON.stringify(data);
      console.error(`${prefix} body=${text.slice(0, 4000)}`); // cap to avoid log spam
    } catch(_) { /* ignore stringify errors */ }
  }
}

// ----- CORS only for /api-proxy (frontend usage) -----
app.use('/api-proxy', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // tighten for prod
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// =======================
// ✅ ESP32 CAMERA ROUTES
// =======================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 }, // 6 MB
});

// Health check
app.get('/test', (_req, res) => res.json({ ok: true }));

// Dry run (no Gemini): confirms multipart + multer
app.post('/test-upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'no file' });
    const crypto = require('crypto');
    const sha1 = crypto.createHash('sha1').update(req.file.buffer).digest('hex');
    console.log(`[test-upload] ${req.file.originalname || 'snapshot'}`, req.file.mimetype, req.file.size, 'bytes');

    // (Optional) broadcast test result too
    const wsBroadcast = req.app.locals.wsBroadcast;
    if (wsBroadcast) {
      wsBroadcast({
        type: 'upload_ready',
        device: req.query.device || 'esp32',
        session: req.query.session || null,
        description: `Test upload OK (${req.file.mimetype}, ${req.file.size} bytes)`,
        imageUrl: null,
        ts: Date.now()
      });
    }

    res.json({ ok: true, mimetype: req.file.mimetype, bytes: req.file.size, sha1 });
  } catch (e) {
    console.error('[test-upload] unexpected error:', e?.message || e);
    res.status(500).json({ ok: false, error: 'processing_failed' });
  }
});

// Real endpoint: send JPEG to Gemini (match webapp: v1beta + gemini-2.5-flash)
app.post('/upload-esp32', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' });
    if (!apiKey)   return res.status(403).json({ error: 'server missing GEMINI_API_KEY' });

    console.log(
      `[upload-esp32] recv file: name=${req.file.originalname || 'snapshot.jpg'} ` +
      `type=${req.file.mimetype} bytes=${req.file.size}`
    );

    const base64 = req.file.buffer.toString('base64');

    // Keep payload shape identical to the webapp version (camelCase + v1beta)
    const payload = {
      contents: [
        {
          parts: [
            { text: 'Describe this photo briefly and factually. Avoid guessing.' },
            {
              inlineData: {
                mimeType: req.file.mimetype || 'image/jpeg',
                data: base64
              }
            }
          ]
        }
      ]
    };

    // Mirror the working path your webapp uses (v1beta + gemini-2.5-flash)
    const url = `${externalApiBaseUrl}/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    console.log('[upload-esp32] POST', url);

    const r = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 20000
    });

    const data = r.data;
    const text =
      data?.candidates?.[0]?.content?.parts?.map(p => p.text).join(' ').trim() ||
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      'No description produced.';

    console.log('[upload-esp32] success ->', text.slice(0, 200));

    // 🔔 Broadcast to any open frontend tabs listening on /ws
    const device  = req.query.device  || 'esp32';
    const session = req.query.session || null;
    const imageUrl = null; // set to a real URL if/when you store the image
    const wsBroadcast = req.app.locals.wsBroadcast;
    if (wsBroadcast) {
      wsBroadcast({
        type: 'upload_ready',
        device,
        session,
        description: text,
        imageUrl,
        ts: Date.now()
      });
    }

    return res.json({ description: text, device, session, imageUrl });
  } catch (e) {
    // Verbose debugging
    const code   = e?.code;
    const status = e?.response?.status;
    const body   = e?.response?.data;
    const msg    = e?.message;
    console.error('[upload-esp32] error', { code, status, msg });
    if (body) {
      try {
        console.error('[upload-esp32] body=',
          typeof body === 'string' ? body : JSON.stringify(body).slice(0, 4000)
        );
      } catch (_) {}
    }
    return res.status(500).json({ error: 'gemini_failed', detail: body?.error?.message || msg });
  }
});


// =======================
// ✅ Gemini HTTP Proxy (used by your web app)
// =======================
app.all('/api-proxy/*', async (req, res) => {
  if (!apiKey) return res.status(403).json({ error: 'API key not set on server' });

  const targetPath = req.url.replace(/^\/api-proxy\//, '');
  const targetUrl  = `${externalApiBaseUrl}/${targetPath}`;
  console.log(`[proxy] ${req.method} -> ${targetUrl}`);

  try {
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        'X-Goog-Api-Key': apiKey,
        ...(req.headers['content-type'] && { 'Content-Type': req.headers['content-type'] }),
        Accept: '*/*',
      },
      data: req.body,
      responseType: 'stream',
      timeout: 20000,
    });

    res.status(response.status);
    for (const [k, v] of Object.entries(response.headers)) res.setHeader(k, v);
    response.data.pipe(res);
  } catch (err) {
    logAxiosError('[proxy]', err);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// =======================
// ✅ Start HTTP server
// =======================
const server = app.listen(port, () => {
  console.log(`✅ Server listening on port ${port}`);
});

// =======================
// ✅ Local WebSocket at /ws (captions → frontend)
// =======================
const localWss = new WebSocket.Server({ server, path: '/ws' });

// Keep-alive so idle sockets don’t die behind proxies
function heartbeat() { this.isAlive = true; }
localWss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', heartbeat);
});
setInterval(() => {
  localWss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

// Expose broadcast helper to routes
function wsBroadcast(obj) {
  const msg = JSON.stringify(obj);
  localWss.clients.forEach((c) => { try { c.send(msg); } catch {} });
}
app.locals.wsBroadcast = wsBroadcast;

// =======================
// ✅ WebSocket Proxy (Gemini streaming) — fixed
// =======================
const wss = new WebSocket.Server({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;

  // IMPORTANT: do NOT destroy non-/api-proxy upgrades; /ws is handled by localWss
  if (!pathname.startsWith('/api-proxy/')) return;

  const geminiPath = pathname.replace('/api-proxy', '');
  reqUrl.searchParams.set('key', apiKey);

  const targetWsUrl = `${externalWsBaseUrl}${geminiPath}?${reqUrl.searchParams.toString()}`;
  const targetWs = new WebSocket(targetWsUrl, { headers: { 'X-Goog-Api-Key': apiKey } });

  wss.handleUpgrade(req, socket, head, (client) => {
    client.on('message', (msg) => { if (targetWs.readyState === WebSocket.OPEN) targetWs.send(msg); });
    targetWs.on('message', (msg) => { if (client.readyState === WebSocket.OPEN) client.send(msg); });
    client.on('close', () => targetWs.close());
    targetWs.on('close', () => client.close());
  });
});

// =======================
// ✅ Serve frontend with injection
// =======================
const wsScript = `<script src="/public/websocket-interceptor.js" defer></script>`;
const swScript = `
<script>
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/service-worker.js').then(reg => {
    console.log('✅ Service worker registered:', reg.scope);
  }).catch(err => {
    console.error('❌ Service worker registration failed:', err);
  });
}
</script>`;

app.get('/', (req, res) => {
  const indexPath = path.join(staticPath, 'index.html');
  const placeholder = path.join(publicPath, 'placeholder.html');

  fs.readFile(indexPath, 'utf8', (err, html) => {
    if (err || !apiKey) {
      console.log('⚠️  index.html not found or API key missing — serving placeholder.');
      return res.sendFile(placeholder);
    }
    let injected = html.includes('<head>')
      ? html.replace('<head>', `<head>${wsScript}${swScript}`)
      : `${wsScript}${swScript}${html}`;
    res.send(injected);
  });
});

// Static files
app.use('/public', express.static(publicPath));
app.get('/service-worker.js', (_, res) => res.sendFile(path.join(publicPath, 'service-worker.js')));
app.use(express.static(staticPath));
