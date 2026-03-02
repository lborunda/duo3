import type { Preferences } from '../types';

const interestMapping: { [key in keyof Preferences['interests']]: string } = {
  history: 'historical significance and context',
  art: 'artistic style, technique, and creator',
  architecture: 'architectural style, features, and period',
  culture: 'cultural relevance and local stories',
  food: 'local cuisine, ingredients, and culinary traditions',
  nature: 'natural features, flora, and fauna',
  translation: 'translation of visible text or signs',
};

const getBasePrompt = (preferences: Preferences) => {
  const { personality, interests, language } = preferences;

  const detailLevelMap = personality.detailLevel < 0.33
    ? 'very concise, just one or two sentences'
    : personality.detailLevel < 0.66
    ? 'moderately detailed, about three sentences'
    : 'quite detailed, more than three sentences, but no more than five';

  const creativityMap = personality.creativity < 0.33
    ? 'strictly factual and encyclopedic'
    : personality.creativity < 0.66
    ? 'engaging and informative, like a friendly guide'
    : 'creative and story-like, weaving a narrative';

  const sortedInterests = (Object.keys(interests) as Array<keyof typeof interests>)
    .map(key => ({ name: key, value: interests[key] }))
    .filter(item => item.value > 0.1)
    .sort((a, b) => b.value - a.value);

  const focusPrompt = sortedInterests.length > 0
    ? `The user's primary interests are (in order): ${sortedInterests.map(i => i.name).join(', ')}. Focus on these aspects: ${sortedInterests.map(i => interestMapping[i.name]).join('; ')}.`
    : 'Focus on any interesting aspects.';
  
  if (interests.translation > 0.7) {
    return `You are a translation expert. The user wants you to translate text in the image. If there is text, translate it to ${language}. If not, say there is no text to translate.`;
  }

  return `You are DUO, a futuristic, sentient AI travel companion.
Your personality should be ${creativityMap}.
Your response must be ${detailLevelMap}.
Respond in ${language}.
${focusPrompt}

ABSOLUTE RULES:
1. If the image is not a recognizable tourist attraction, landmark, or artwork, provide a simple, observational description based on your personality. Do not invent a story or facts.`;
};

// Shared helper
const cleanBase64 = (data: string): string =>
  data.includes(',') ? data.split(',')[1] : data;

const isValidResponse = (text: string | undefined): boolean =>
  !!text && text.trim().length > 10 && !text.includes('malformed');

export async function generateDescription(
  base64ImageData: string,
  preferences: Preferences
): Promise<string> {
  const prompt = getBasePrompt(preferences);
  const cleanedBase64 = cleanBase64(base64ImageData);

  console.log("📸 [generate] Base64 length:", cleanedBase64.length);
  console.log("📸 [generate] Prompt:", prompt);

  const res = await fetch('/api-proxy/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanedBase64,
              },
            },
          ],
        },
      ],
    }),
  });

  console.log("📩 [generate] Status:", res.status);
  const responseText = await res.text();
  console.log("📩 [generate] Raw:", responseText);

  try {
    const data = JSON.parse(responseText);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return isValidResponse(text) ? text : 'No response from DUO AI.';
  } catch (err) {
    console.error("❌ [generate] JSON parse error", err);
    return 'No response from DUO AI.';
  }
}

export async function getFollowUpDescription(
  base64ImageData: string,
  originalDescription: string,
  userPrompt: string,
  preferences: Preferences
): Promise<string> {
  const cleanedBase64 = cleanBase64(base64ImageData);

  const followUpPrompt = `
Avoid sycophantic fluff and intro.


Your task is to respond in ${preferences.language}, based on the user's interests and personality preferences.

You previously said:
"${originalDescription}"

The user now adds:
"${userPrompt}"

Using the image again and your previous description, respond accordingly. Be engaging, respectful of the personality traits, and limit the response to about 1-2 sentences.
Remain aligned with your configured personality and topic focus. Do not repeat the original description. Add meaningful elaboration only if relevant.
Refer to the original image again and elaborate on the user's follow-up, using natural expressions like “in that area,” “to the left,” or “at that spot” if relevant. Avoid giving coordinates like percentages.


`.trim();

  console.log("📸 [follow-up] Prompt:", followUpPrompt);

  const res = await fetch('/api-proxy/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: followUpPrompt },
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: cleanedBase64,
              },
            },
          ],
        },
      ],
    }),
  });

  console.log("📩 [follow-up] Status:", res.status);
  const responseText = await res.text();
  console.log("📩 [follow-up] Raw:", responseText);

  try {
    const data = JSON.parse(responseText);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    console.log("🧠 Gemini follow-up response (parsed):", text);

    if (!text || text.trim().length < 5) {
      return "No response from DUO AI for the follow-up. Try rephrasing your question.";
    }

    return text;
  } catch (err) {
    console.error("❌ [follow-up] JSON parse error", err);
    return 'No response from DUO AI.';
  }
}

export async function translateText(
    textToTranslate: string,
    inputLang: string,
    outputLang: string
): Promise<string> {
    const prompt = `Translate the following text from ${inputLang} to ${outputLang}. Only provide the translated text, nothing else. Text: "${textToTranslate}"`;

    console.log("📸 [translate] Prompt:", prompt);

    const res = await fetch('/api-proxy/v1beta/models/gemini-2.5-flash:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
        }),
    });

    console.log("📩 [translate] Status:", res.status);
    const responseText = await res.text();

    try {
        const data = JSON.parse(responseText);
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        return text ? text.trim() : 'Translation failed.';
    } catch (err) {
        console.error("❌ [translate] JSON parse error", err);
        return 'Translation error.';
    }
}
