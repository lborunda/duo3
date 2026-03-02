
import React, { useRef, useEffect, useState } from 'react';
import { SaveIcon, CloseIcon, MicIcon, SoundOnIcon, SoundOffIcon, TranslateIcon } from './icons';
import type { Message } from '../types';
import { useIntermittentVibration } from '../hooks/useIntermittentVibration';

interface ResponseDisplayProps {
  isLoading: boolean;
  conversation: Message[];
  lastCapture: string | null;
  isMuted: boolean;
  onSave: () => void;
  onClear: () => void;
  onFollowUp: (prompt: string, type: 'tap' | 'long-press' | 'voice') => void;
  onToggleMute: () => void;
  onToggleListening: () => void;
  isListening: boolean;
  isTranslating?: boolean;
  onToggleTranslation?: () => void;
  translationEnabled?: boolean;
}



const Typewriter = ({ text, className, onComplete }: { text: string; className?: string; onComplete?: () => void }) => {
  const [displayedText, setDisplayedText] = useState('');
  const charIndex = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!text) return;

    setDisplayedText('');
    charIndex.current = 0;

    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      setDisplayedText(prev => {
        if (charIndex.current < text.length) {
          const nextChar = text[charIndex.current];
          charIndex.current += 1;
          return prev + nextChar;
        } else {
          if (intervalRef.current) clearInterval(intervalRef.current);
          if (onComplete) onComplete();
          return prev;
        }
      });
    }, 30);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [text, onComplete]);

  return (
    <p className={`leading-relaxed whitespace-pre-wrap ${className}`}>
      {displayedText}
    </p>
  );
};



const LoadingSkeleton = () => (
    <div className="animate-pulse flex items-start space-x-3">
        <div className="w-10 h-10 rounded-full bg-white/10"></div>
        <div className="flex-1 space-y-3">
            <div className="h-4 bg-white/20 rounded w-3/4"></div>
            <div className="h-4 bg-white/20 rounded w-full"></div>
            <div className="h-4 bg-white/20 rounded w-5/6"></div>
        </div>
    </div>
);


const clamp = (val: number, min: number, max: number) => Math.min(Math.max(val, min), max);

export const ResponseDisplay: React.FC<ResponseDisplayProps> = ({
  isLoading, conversation, lastCapture, isMuted, onSave, onClear, onFollowUp, onToggleMute, onToggleListening, isListening
}) => {
  const imageInteractionContainerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // -- NEW INTERACTION STATE --
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const interactionState = useRef({
    isPointerDown: false,
    isDragging: false,
    isPinching: false,
    panStart: { x: 0, y: 0 },
    pinchStartDistance: 0,
    longPressTimeout: null as NodeJS.Timeout | null,
    lastTapTime: 0,
    initialPointer: { x: 0, y: 0 },
  }).current;

  useIntermittentVibration(isLoading);

  useEffect(() => {
    if (lastCapture) {
      const img = new Image();
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.src = lastCapture;
    } else {
      setImageDimensions({ width: 0, height: 0 });
    }
    // Reset view when a new image is captured
    resetView();
  }, [lastCapture]);

  useEffect(() => {
    if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [conversation, isLoading]);

  const clampOffset = (newOffset: {x: number, y: number}, currentZoom: number) => {
    if (!imageInteractionContainerRef.current) return newOffset;
    const { width, height } = imageInteractionContainerRef.current.getBoundingClientRect();
    const maxOffsetX = Math.max(0, (width * currentZoom - width) / 2);
    const maxOffsetY = Math.max(0, (height * currentZoom - height) / 2);

    return {
        x: clamp(newOffset.x, -maxOffsetX, maxOffsetX),
        y: clamp(newOffset.y, -maxOffsetY, maxOffsetY),
    };
  };

  const getCoordinatesOnImage = (clientX: number, clientY: number) => {
    if (!imageInteractionContainerRef.current || !imageDimensions.width || !imageDimensions.height) {
        return null;
    }

    const containerRect = imageInteractionContainerRef.current.getBoundingClientRect();
    const { width: containerWidth, height: containerHeight } = containerRect;

    const clickXInContainer = clientX - containerRect.left;
    const clickYInContainer = clientY - containerRect.top;

    // Reverse the pan and zoom to find where the click would be on the non-transformed element
    const clickXOnElement = (clickXInContainer - offset.x) / zoom;
    const clickYOnElement = (clickYInContainer - offset.y) / zoom;
    
    // Calculate the image's dimensions and position within that element due to 'bg-cover'
    const containerAR = containerWidth / containerHeight;
    const imageAR = imageDimensions.width / imageDimensions.height;

    let imgRenderWidth, imgRenderHeight, imgOffsetX, imgOffsetY;

    if (imageAR > containerAR) { // Image is wider than container aspect ratio
        imgRenderHeight = containerHeight;
        imgRenderWidth = imgRenderHeight * imageAR;
        imgOffsetX = (containerWidth - imgRenderWidth) / 2;
        imgOffsetY = 0;
    } else { // Image is taller than container aspect ratio
        imgRenderWidth = containerWidth;
        imgRenderHeight = imgRenderWidth / imageAR;
        imgOffsetX = 0;
        imgOffsetY = (containerHeight - imgRenderHeight) / 2;
    }
    
    // Calculate click coordinates relative to the image itself
    const clickXOnImage = clickXOnElement - imgOffsetX;
    const clickYOnImage = clickYOnElement - imgOffsetY;

    // Convert to percentage
    const xPercent = (clickXOnImage / imgRenderWidth) * 100;
    const yPercent = (clickYOnImage / imgRenderHeight) * 100;

    if (xPercent < 0 || xPercent > 100 || yPercent < 0 || yPercent > 100) {
        return null;
    }
    
    return {
        x: Math.round(clamp(xPercent, 0, 100)),
        y: Math.round(clamp(yPercent, 0, 100)),
    };
  };

  const handleRipple = (clientX: number, clientY: number) => {
    if ('vibrate' in navigator) navigator.vibrate(20);
    const imageContainer = imageInteractionContainerRef.current;
    if (!imageContainer) return;
    const rect = imageContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    
    imageContainer.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  };
  
  const triggerFollowUp = (type: 'tap' | 'long-press', clientX: number, clientY: number) => {
    const coords = getCoordinatesOnImage(clientX, clientY);
    if (!coords) return;

    handleRipple(clientX, clientY);

    const prompt = type === 'tap'
      ? `What is the most interesting thing at position (${coords.x}%, ${coords.y}%) in this image?`
      : `Give me more details about the object at position (${coords.x}%, ${coords.y}%) in the image. Keep it to a maximum of three sentences.`;
      
    onFollowUp(prompt, type);
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    interactionState.isPointerDown = true;
    interactionState.panStart = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    interactionState.initialPointer = { x: e.clientX, y: e.clientY };

    interactionState.longPressTimeout = setTimeout(() => {
        if (!interactionState.isDragging) {
            triggerFollowUp('long-press', e.clientX, e.clientY);
            interactionState.longPressTimeout = null;
        }
    }, 500);
  };
  
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!interactionState.isPointerDown) return;
    
    const dx = Math.abs(e.clientX - interactionState.initialPointer.x);
    const dy = Math.abs(e.clientY - interactionState.initialPointer.y);
    if(dx > 5 || dy > 5) {
        interactionState.isDragging = true;
        if(interactionState.longPressTimeout) clearTimeout(interactionState.longPressTimeout);
    }
    
    if (interactionState.isDragging) {
      const newOffset = { x: e.clientX - interactionState.panStart.x, y: e.clientY - interactionState.panStart.y };
      setOffset(clampOffset(newOffset, zoom));
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (interactionState.longPressTimeout) clearTimeout(interactionState.longPressTimeout);

    if (!interactionState.isDragging) {
        const now = Date.now();
        if (now - interactionState.lastTapTime < 300) { // Double click
            resetView();
        } else {
            triggerFollowUp('tap', e.clientX, e.clientY);
        }
        interactionState.lastTapTime = now;
    }
    interactionState.isPointerDown = false;
    interactionState.isDragging = false;
  };
  
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const newZoom = clamp(zoom - e.deltaY * 0.005, 1, 5);
    setZoom(newZoom);
  };

  // Touch handlers
  const getPinchInfo = (touches: React.TouchList | TouchList) => {
    const t1 = touches[0]; const t2 = touches[1];
    const dx = t1.clientX - t2.clientX; const dy = t1.clientY - t2.clientY;
    return { distance: Math.sqrt(dx * dx + dy * dy), center: { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }};
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 1) {
        const touch = e.touches[0];
        interactionState.isPointerDown = true;
        interactionState.panStart = { x: touch.clientX - offset.x, y: touch.clientY - offset.y };
        interactionState.initialPointer = { x: touch.clientX, y: touch.clientY };

        interactionState.longPressTimeout = setTimeout(() => {
            if (!interactionState.isDragging) {
                triggerFollowUp('long-press', touch.clientX, touch.clientY);
                interactionState.longPressTimeout = null;
            }
        }, 500);
    } else if (e.touches.length >= 2) {
        if (interactionState.longPressTimeout) clearTimeout(interactionState.longPressTimeout);
        interactionState.isPointerDown = false; // Stop single-touch panning
        interactionState.isPinching = true;
        const pinchInfo = getPinchInfo(e.touches);
        interactionState.pinchStartDistance = pinchInfo.distance;
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    // Prevent browser default actions like scrolling
    if (interactionState.isDragging || interactionState.isPinching) {
      e.preventDefault();
    }

    if (interactionState.isPinching && e.touches.length >= 2) {
        const pinchInfo = getPinchInfo(e.touches);
        const scale = pinchInfo.distance / interactionState.pinchStartDistance;
        const newZoom = clamp(zoom * scale, 1, 5);

        const container = imageInteractionContainerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        
        // Pinch center relative to the container element
        const pinchCenter = {
            x: pinchInfo.center.x - rect.left,
            y: pinchInfo.center.y - rect.top,
        };

        // The point on the non-zoomed image under the pinch center
        const imagePoint = {
            x: (pinchCenter.x - offset.x) / zoom,
            y: (pinchCenter.y - offset.y) / zoom,
        };
        
        // New offset to keep the image point under the pinch center
        const newOffset = {
            x: pinchCenter.x - imagePoint.x * newZoom,
            y: pinchCenter.y - imagePoint.y * newZoom,
        };

        setZoom(newZoom);
        setOffset(clampOffset(newOffset, newZoom));
        
        // Update for next frame
        interactionState.pinchStartDistance = pinchInfo.distance;
    } else if (interactionState.isPointerDown && e.touches.length === 1) {
        const touch = e.touches[0];
        if (!interactionState.isDragging) {
            const dx = Math.abs(touch.clientX - interactionState.initialPointer.x);
            const dy = Math.abs(touch.clientY - interactionState.initialPointer.y);
            if (dx > 5 || dy > 5) {
                 interactionState.isDragging = true;
                 if (interactionState.longPressTimeout) {
                     clearTimeout(interactionState.longPressTimeout);
                     interactionState.longPressTimeout = null;
                 }
            }
        }
        
        if (interactionState.isDragging) {
            const newOffset = { x: touch.clientX - interactionState.panStart.x, y: touch.clientY - interactionState.panStart.y };
            setOffset(clampOffset(newOffset, zoom));
        }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (interactionState.longPressTimeout) {
      clearTimeout(interactionState.longPressTimeout);
      interactionState.longPressTimeout = null;
    }
    
    // Only trigger tap if not dragging or pinching, and it was the last finger lifted
    if (!interactionState.isDragging && !interactionState.isPinching && e.touches.length === 0) {
        const touch = e.changedTouches[0];
        const now = Date.now();
        if (now - interactionState.lastTapTime < 300) {
            resetView();
        } else {
            triggerFollowUp('tap', touch.clientX, touch.clientY);
        }
        interactionState.lastTapTime = now;
    }
    
    // Reset states
    if (e.touches.length < 2) {
      interactionState.isPinching = false;
    }
    if (e.touches.length < 1) {
      interactionState.isPointerDown = false;
      interactionState.isDragging = false;
    }
  };

  if (!lastCapture) return null;

  const hasModelResponse = [...conversation].reverse().find(m => m.role === 'model');

  return (
    <div className="absolute inset-0 z-30">
      <div 
        ref={imageInteractionContainerRef}
        className="absolute inset-0 bg-stone-200 overflow-hidden touch-none group"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
            className="w-full h-full bg-cover bg-center"
            style={{
                backgroundImage: `url(${lastCapture})`,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transition: interactionState.isPointerDown || interactionState.isPinching ? 'none' : 'transform 0.2s ease-out',
                cursor: interactionState.isDragging ? 'grabbing' : 'pointer',
            }}
        >
        </div>
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center text-white text-center p-4 opacity-0 group-hover:opacity-100 pointer-events-none">
            <div>
                <p className="font-bold">Tap for a highlight</p>
                <p className="text-sm">Pinch/Scroll to zoom</p>
                <p className="text-sm">Double-tap to reset</p>
            </div>
        </div>
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 flex flex-col max-h-[40vh] bg-stone-900/80 backdrop-blur-md rounded-t-2xl shadow-2xl">
        <div className="flex-shrink-0 p-3 border-b border-white/20 flex justify-between items-center">
            <button onClick={onToggleMute} className="p-2 text-stone-300 hover:text-white">
                {isMuted ? <SoundOffIcon className="w-6 h-6" /> : <SoundOnIcon className="w-6 h-6" />}
            </button>
            <h2 className="text-lg font-bold text-white">DUO</h2>
            <button onClick={onClear} className="p-2 text-stone-300 hover:text-white">
                <CloseIcon className="w-6 h-6" />
            </button>
        </div>
        
        <div ref={scrollRef} className="flex-1 p-4 space-y-4 overflow-y-auto">
            {conversation.map((msg, index) => (
                msg.role === 'model' ? (
                    <div key={index} className="flex items-start space-x-3">
                        <div className="w-10 h-10 rounded-full bg-orange-500 flex-shrink-0"></div>
                        <div className="flex-1 bg-black/30 p-4 rounded-2xl rounded-tl-none">
                            <Typewriter text={msg.text} className="text-white/90 text-lg" />
                        </div>
                    </div>
                ) : (
                    <div key={index} className="flex justify-end">
                         <div className="bg-orange-500/90 text-white p-3 rounded-2xl rounded-tr-none max-w-sm">
                            <p className="text-base leading-relaxed whitespace-pre-wrap italic">{msg.text}</p>
                        </div>
                    </div>
                )
            ))}
            {isLoading && <LoadingSkeleton />}
        </div>

        <div className="flex-shrink-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] mt-auto border-t border-white/20 bg-stone-900/60 flex items-center gap-3">
            <button
              onClick={onSave}
              className="flex-shrink-0 bg-stone-200/20 text-white font-bold py-3 px-4 rounded-lg hover:bg-stone-200/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !hasModelResponse}
            >
              <SaveIcon className="w-5 h-5" />
            </button>
            
            {translationEnabled && (
                <button
                    onClick={onToggleTranslation}
                    className={`flex-shrink-0 font-bold py-3 px-4 rounded-lg transition-colors ${isTranslating ? 'bg-blue-500 animate-pulse text-white' : 'bg-stone-200/20 text-white hover:bg-stone-200/40'}`}
                    disabled={isLoading}
                >
                    <TranslateIcon className="w-5 h-5" />
                </button>
            )}

            <button
              onClick={onToggleListening}
              className={`w-full flex items-center justify-center gap-2 text-white font-bold py-3 px-4 rounded-lg transition-colors ${isListening ? 'bg-red-500 animate-pulse' : 'bg-orange-500 hover:bg-orange-600'}`}
              disabled={isLoading || isTranslating}
            >
              <MicIcon className="w-5 h-5" />
              <span>{isListening ? 'Listening...' : 'Ask a follow-up'}</span>
            </button>
        </div>
      </div>
    </div>
  );
};
