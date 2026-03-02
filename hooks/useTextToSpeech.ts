import { useState, useCallback, useRef, useEffect } from 'react';
import { fetchElevenLabsAudio } from '../services/elevenLabsService';

export const useTextToSpeech = () => {
  const [isSpeaking, setIsSpeaking] = useState(false);

  // Track the currently active audio element
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  
  // Track the active speech request to prevent race conditions
  const currentSpeechIdRef = useRef<number>(0);

  const cleanupAudio = useCallback(() => {
    // Stop the currently active audio
    const el = activeAudioRef.current;
    if (el) {
      try {
        el.pause();
        // Do NOT call removeAttribute('src') here as it triggers "interrupted by new load request"
        // if the promise is pending. Just pausing and removing from DOM is sufficient.
        el.onerror = null;
        el.onended = null;
        if (el.parentNode) {
            el.parentNode.removeChild(el);
        }
      } catch (e) {
        // Ignore errors during cleanup
      }
      activeAudioRef.current = null;
    }

    // Revoke the blob URL
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }
    
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(async (text: string, _lang?: string, rate: number = 1) => {
    // Increment ID to invalidate previous async operations
    const speechId = ++currentSpeechIdRef.current;
    
    // Stop previous audio immediately
    cleanupAudio();
    
    if (!text.trim()) return;

    setIsSpeaking(true);
    try {
      // 1) Fetch TTS audio
      const audioBlob = await fetchElevenLabsAudio(text);
      
      // If another speak request started while we were fetching, abort
      if (speechId !== currentSpeechIdRef.current) return;

      const audioUrl = URL.createObjectURL(audioBlob);
      audioUrlRef.current = audioUrl;

      // 2) Create a NEW audio element for this utterance
      const el = document.createElement('audio');
      el.preload = 'auto';
      // @ts-ignore
      el.playsInline = true;
      el.setAttribute('playsinline', ''); // WebKit/iOS
      el.style.display = 'none';
      el.playbackRate = Math.max(0.5, Math.min(2.5, rate));
      el.src = audioUrl;
      
      document.body.appendChild(el);
      activeAudioRef.current = el;

      // 3) Hook up end/error
      const handleEnd = () => {
         if (speechId === currentSpeechIdRef.current) {
             cleanupAudio();
         }
      };
      const handleError = (e: Event) => {
        // Don't log error here, let the promise rejection handle it or the outer catch
        if (speechId === currentSpeechIdRef.current) {
            cleanupAudio();
        }
      };
      el.onended = handleEnd;
      el.onerror = handleError;

      // 4) Play
      try {
        await el.play();
      } catch (playErr: any) {
        // These errors are expected when playback is cancelled
        const isInterruption = 
            playErr.name === 'AbortError' || 
            playErr.message?.includes('interrupted') ||
            playErr.message?.includes('load request');
            
        if (isInterruption) {
          return;
        }
        throw playErr;
      }
    } catch (err: any) {
      // Only handle errors if this is still the active request
      if (speechId === currentSpeechIdRef.current) {
         // NotAllowedError: iOS blocked autoplay (user hasn’t tapped unlock yet)
        if (err && err.name === 'NotAllowedError') {
            console.warn('Audio blocked: tap "Enable sound" first.');
        } else if (err && (err.name === 'AbortError' || err.message?.includes('interrupted') || err.message?.includes('load request'))) {
            // Ignore
        } else {
            console.error('Failed to speak with ElevenLabs:', err);
        }
        cleanupAudio();
      }
    }
  }, [cleanupAudio]);

  const cancel = useCallback(() => {
    currentSpeechIdRef.current++; // Invalidate any pending
    cleanupAudio();
  }, [cleanupAudio]);

  useEffect(() => {
    return () => {
      currentSpeechIdRef.current++;
      cleanupAudio();
    };
  }, [cleanupAudio]);

  return { speak, cancel, isSpeaking };
};
