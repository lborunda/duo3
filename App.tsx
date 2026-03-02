import React, { useState, useCallback, useEffect } from 'react';
import { CameraView } from './components/CameraView';
import { TripBookView } from './components/TripBookView';
import { Controls } from './components/Controls';
import { ResponseDisplay } from './components/ResponseDisplay';
import { Notification } from './components/Notification';
import { WelcomeOverlay } from './components/WelcomeOverlay';
import { SettingsView } from './components/SettingsView';
import { generateDescription, getFollowUpDescription } from './services/geminiService';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { useTextToSpeech } from './hooks/useTextToSpeech';
import type { Trip, TripHighlight, Preferences, Message } from './types';
import { PREFERENCES_KEY, TRIPS_KEY, ACTIVE_TRIP_ID_KEY } from './constants';

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [view, setView] = useState<'camera' | 'tripBook' | 'settings'>('camera');
  const [isLoading, setIsLoading] = useState(false);
  
  // ... existing state ...
  const [conversation, setConversation] = useState<Message[]>([]);
  const [lastCapture, setLastCapture] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Preferences>({
    personality: {
      detailLevel: 0.3,
      creativity: 0.2,
      voiceSpeed: 1,
    },
    interests: {
      history: 0.5,
      art: 0.5,
      architecture: 0.5,
      culture: 0.5,
      food: 0.2,
      nature: 0.3,
      translation: 0.1,
    },
    language: 'en-US',
    translation: {
      enabled: false,
      inputLanguage: 'en-US',
      outputLanguage: 'en-US',
    },
  });
  const [notification, setNotification] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(true);
  const [hasBuiltPreferences, setHasBuiltPreferences] = useState(false);
  const [hasVisitedSettings, setHasVisitedSettings] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  // 🔊 existing hooks
  const { isListening, transcript, startListening, stopListening } = useSpeechRecognition();
  const { speak, cancel, isSpeaking } = useTextToSpeech();

  // 🌐 NEW: minimal WS listener state (no image rendering)
  const [wsConnected, setWsConnected] = useState(false);
  const [espSession, setEspSession] = useState<string | null>(null);
  const [espCaption, setEspCaption] = useState<string>('');

  // ===== init prefs/trips =====
  useEffect(() => {
    // Mark as initialized immediately to prevent white screen
    setIsInitialized(true);
    
    try {
      const storedPrefs = localStorage.getItem(PREFERENCES_KEY);
      if (storedPrefs) {
        setPreferences(JSON.parse(storedPrefs));
      } else {
        localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
      }
      setHasBuiltPreferences(true);

      const storedTrips = localStorage.getItem(TRIPS_KEY);
      if (storedTrips) setTrips(JSON.parse(storedTrips));

      const storedActiveTripId = localStorage.getItem(ACTIVE_TRIP_ID_KEY);
      if (storedActiveTripId) setActiveTripId(storedActiveTripId);
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
    }
  }, []);

  useEffect(() => {
    if (view === 'settings') {
      setHasVisitedSettings(true);
    }
  }, [view]);

  const handleStart = () => setShowWelcome(false);

  const showNotification = useCallback((message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 3000);
  }, []);

  // 🎙️ existing voice follow-ups (camera flow)
  useEffect(() => {
    if (transcript) {
      if (conversation.length > 0) {
        handleFollowUp(transcript, 'voice');
      } else {
        showNotification("Please capture an image before asking questions.");
      }
    }
  }, [transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSavePreferences = useCallback((newPreferences: Preferences) => {
    setPreferences(newPreferences);
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify(newPreferences));
    showNotification("Preferences updated!");
  }, [showNotification]);

  const handleApiResponse = useCallback((response: string) => {
    const trimmed = response?.trim() || '';
    setConversation(prev => [...prev, { role: 'model', text: trimmed }]);
    if (!trimmed || trimmed.length < 10 || trimmed.startsWith("No response from DUO AI")) return;
    if (!isMuted) {
      speak(trimmed, preferences.language, preferences.personality.voiceSpeed).catch(console.error);
    }
  }, [isMuted, speak, preferences]);

  const handleCapture = useCallback(async (imageData: string) => {
    setConversation([]);
    setIsLoading(true);
    setLastCapture(imageData);
    try {
      const description = await generateDescription(imageData, preferences);
      handleApiResponse(description);
    } catch (error) {
      console.error("Error generating description:", error);
      handleApiResponse("Sorry, I was unable to generate a description. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }, [preferences, handleApiResponse]);

  const handleFollowUp = useCallback(async (prompt: string, type: 'tap' | 'long-press' | 'voice') => {
    if (!lastCapture || isLoading) return;
    setConversation(prev => [...prev, { role: 'user', text: prompt }]);
    setIsLoading(true);
    try {
      const lastResponse = [...conversation].reverse().find(m => m.role === 'model')?.text || '';
      const followUpResponse = await getFollowUpDescription(lastCapture, lastResponse, prompt, preferences);
      handleApiResponse(followUpResponse);
    } catch (error) {
      console.error("Error during follow-up:", error);
      handleApiResponse("I seem to have lost my train of thought. Could you try again?");
    } finally {
      setIsLoading(false);
    }
  }, [lastCapture, isLoading, conversation, preferences, handleApiResponse]);

  const handleCreateTrip = useCallback((name: string) => {
    const newTrip: Trip = {
      id: Date.now().toString(),
      name,
      highlights: [],
      createdAt: new Date().toISOString(),
    };
    const updatedTrips = [newTrip, ...trips];
    setTrips(updatedTrips);
    setActiveTripId(newTrip.id);
    localStorage.setItem(TRIPS_KEY, JSON.stringify(updatedTrips));
    localStorage.setItem(ACTIVE_TRIP_ID_KEY, newTrip.id);
    showNotification(`Trip "${name}" created!`);
    return newTrip.id;
  }, [trips, showNotification]);

  const handleSaveHighlight = useCallback(() => {
    if (!lastCapture || conversation.length === 0) return;
    let tripIdToUpdate = activeTripId;
    if (!tripIdToUpdate) tripIdToUpdate = handleCreateTrip(`Trip from ${new Date().toLocaleDateString()}`);
    const newHighlight: TripHighlight = {
      id: Date.now().toString(),
      imageData: lastCapture,
      conversation,
      timestamp: new Date().toISOString(),
      preferencesAtTimeOfCapture: preferences,
    };
    const updatedTrips = trips.map(trip => trip.id === tripIdToUpdate
      ? { ...trip, highlights: [newHighlight, ...trip.highlights] }
      : trip);
    setTrips(updatedTrips);
    localStorage.setItem(TRIPS_KEY, JSON.stringify(updatedTrips));
    showNotification("Highlight saved!");
    setConversation([]);
    setLastCapture(null);
  }, [lastCapture, conversation, trips, preferences, activeTripId, handleCreateTrip, showNotification]);

  const handleRenameTrip = useCallback((tripId: string, newName: string) => {
    const updatedTrips = trips.map(trip => trip.id === tripId ? { ...trip, name: newName } : trip);
    setTrips(updatedTrips);
    localStorage.setItem(TRIPS_KEY, JSON.stringify(updatedTrips));
  }, [trips]);

  const handleSetActiveTrip = useCallback((tripId: string) => {
    setActiveTripId(tripId);
    localStorage.setItem(ACTIVE_TRIP_ID_KEY, tripId);
    const name = trips.find(t => t.id === tripId)?.name || '';
    showNotification(`Active trip: "${name}"`);
  }, [trips, showNotification]);

  const handleToggleListening = () => {
    if (isSpeaking) cancel();
    if (isListening) stopListening();
    else startListening();
  };

  const handleClearResponse = () => {
    cancel();
    setConversation([]);
    setLastCapture(null);
  };

  const handleToggleMute = () => {
    setIsMuted(prev => {
      if (!prev) cancel();
      return !prev;
    });
  };

  // 🌐 NEW: open /ws and speak any incoming caption (no image)
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg?.type === 'upload_ready') {
          const text = (msg.description || '').trim();
          setEspSession(msg.session || null);
          setEspCaption(text);
          if (text && !isMuted) {
            speak(text, preferences.language, preferences.personality.voiceSpeed)
              .catch(console.error);
          }
        }
      } catch (e) {
        console.warn('WS parse error', e);
      }
    };

    return () => ws.close();
  }, [isMuted, speak, preferences.language, preferences.personality.voiceSpeed]);

  const renderView = () => {
    switch (view) {
      case 'camera':
        return <CameraView onCapture={handleCapture} onViewChange={setView} />;
      case 'tripBook':
        return (
          <TripBookView
            trips={trips}
            activeTripId={activeTripId}
            onBack={() => setView('camera')}
            onCreateTrip={handleCreateTrip}
            onRenameTrip={handleRenameTrip}
            onSetActiveTrip={handleSetActiveTrip}
          />
        );
      case 'settings':
        return (
          <SettingsView
            preferences={preferences}
            onPreferencesChange={handleSavePreferences}
            onBack={() => setView('camera')}
            onCreateTrip={handleCreateTrip}
            hasVisitedBefore={hasVisitedSettings}
          />
        );
      default:
        return <CameraView onCapture={handleCapture} onViewChange={setView} />;
    }
  };

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen bg-stone-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-stone-500">Initializing DUO...</p>
        </div>
      </div>
    );
  }

  if (showWelcome) return <WelcomeOverlay onStart={handleStart} />;

  return (
    <div className="h-screen w-screen bg-stone-50 text-stone-800 font-sans flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* existing app views */}
        {renderView()}

        {/* existing camera conversation drawer */}
        {lastCapture && (
          <ResponseDisplay
            isLoading={isLoading}
            conversation={conversation}
            lastCapture={lastCapture}
            isMuted={isMuted}
            onSave={handleSaveHighlight}
            onClear={handleClearResponse}
            onFollowUp={handleFollowUp}
            onToggleMute={handleToggleMute}
            onToggleListening={handleToggleListening}
            isListening={isListening}
          />
        )}

        {/* 🌐 NEW: ESP32 caption panel (no image), shows even when there's no lastCapture */}
        {!lastCapture && (
          <div className="px-4 pb-5">
            <div className="text-xs text-stone-500 mt-3">
              {wsConnected ? 'WS connected' : 'WS disconnected'}
              {espSession ? ` · session: ${espSession}` : ''}
            </div>

            {espCaption ? (
              <div className="mt-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
                <div className="text-sm leading-relaxed whitespace-pre-wrap">{espCaption}</div>
                <div className="mt-3">
                  <button
                    onClick={() => speak(espCaption, preferences.language, preferences.personality.voiceSpeed)}
                    className="px-3 py-2 rounded-lg border border-stone-300 text-sm hover:bg-stone-50"
                  >
                    🔊 Speak again
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 text-sm text-stone-500">Waiting for an ESP32 upload…</div>
            )}
          </div>
        )}
      </div>

      {view !== 'camera' && !lastCapture && (
        <Controls view={view} onViewChange={setView} />
      )}

      <Notification message={notification} />
    </div>
  );
}
