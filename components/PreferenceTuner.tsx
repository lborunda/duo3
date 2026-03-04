import React from 'react';
import type { Preferences } from '../types';
import { RadarChart, capitalize } from './RadarChart';
import { TranslateIcon } from './icons';

interface PreferenceTunerProps {
  preferences: Preferences;
  onPreferencesChange: (newPreferences: Preferences) => void;
}

const LabeledSlider = ({
  emoji,
  label,
  value,
  min,
  max,
  leftLabel,
  rightLabel,
  onChange,
}: {
  emoji?: string;
  label: string;
  value: number;
  min: number;
  max: number;
  leftLabel: string;
  rightLabel: string;
  onChange: (value: number) => void;
}) => {
  return (
    <div className="flex flex-col items-center space-y-2">
      <p className="text-sm text-stone-700 font-semibold">{emoji} {label}</p>
      <input
        type="range"
        min={min}
        max={max}
        step="0.01"
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-48 accent-orange-500"
      />
      <div className="flex justify-between w-48 text-xs text-stone-500">
        <span>{leftLabel}</span>
        <span>{rightLabel}</span>
      </div>
    </div>
  );
};

export const PreferenceTuner: React.FC<PreferenceTunerProps> = ({ preferences, onPreferencesChange }) => {
  if (!preferences || !preferences.personality || !preferences.interests) {
    console.warn("⚠️ Invalid or missing preferences object:", preferences);
    return <p className="text-red-500 p-4">Preferences not properly loaded.</p>;
  }

  const handleInterestChange = (newInterests: Preferences['interests']) => {
    onPreferencesChange({ ...preferences, interests: newInterests });
  };

  const handlePersonalityChange = (key: keyof Preferences['personality'], value: number) => {
    onPreferencesChange({
      ...preferences,
      personality: {
        ...preferences.personality,
        [key]: value,
      },
    });
  };

  const interestData = Object.entries(preferences.interests || {}).map(([name, value]) => ({
    name: capitalize(name),
    value: typeof value === 'number' ? value : 0.3,
  }));

  return (
    <div className="p-4 space-y-8">
      {/* Interests Section */}
      <div>
        <h3 className="text-lg font-bold text-stone-800 px-4">Interests Profile</h3>
        <p className="text-sm text-stone-500 mb-4 px-4">Drag the points to adjust your travel interests.</p>
        <div className="bg-white p-4 rounded-xl shadow">
          <RadarChart
            data={interestData}
            onDataChange={(newData) => {
              const newInterests = newData.reduce((acc, item) => {
                acc[item.name.toLowerCase() as keyof Preferences['interests']] = item.value;
                return acc;
              }, {} as Preferences['interests']);
              handleInterestChange(newInterests);
            }}
          />
        </div>
      </div>

      {/* AI Personality Section */}
      <div>
        <h3 className="text-lg font-bold text-stone-800 px-4">AI Personality</h3>
        <p className="text-sm text-stone-500 mb-4 px-4">Adjust how DUO communicates with you.</p>
        <div className="flex flex-wrap gap-6 justify-center">
          <LabeledSlider
            emoji="🧠"
            label="Information Style"
            min={0}
            max={1}
            value={preferences.personality.detailLevel ?? 0.3}
            leftLabel="Succinct"
            rightLabel="Detailed"
            onChange={(v) => handlePersonalityChange('detailLevel', v)}
          />
          <LabeledSlider
            emoji="💬"
            label="Tone"
            min={0}
            max={0.6}
            value={preferences.personality.creativity ?? 0.2}
            leftLabel="Factual"
            rightLabel="Conversational"
            onChange={(v) => handlePersonalityChange('creativity', v)}
          />
          <LabeledSlider
            emoji="🗣️"
            label="Voice Speed"
            min={0.5}
            max={1.8}
            value={preferences.personality.voiceSpeed ?? 1}
            leftLabel="Slower"
            rightLabel="Faster"
            onChange={(v) => handlePersonalityChange('voiceSpeed', v)}
          />
        </div>
      </div>

      {/* Translation Settings */}
      <div>
        <h3 className="text-lg font-bold text-stone-800 px-4">Translation & Language</h3>
        <p className="text-sm text-stone-500 mb-4 px-4">Configure languages and live translation focus.</p>
        
        <div className="bg-white p-6 rounded-xl shadow space-y-6 mx-4 border-l-4 border-maroon">
            
            {/* Global Language Settings - Always Visible */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wide mb-1">Input Language (I hear)</label>
                    <select 
                        value={preferences.translation?.inputLanguage || 'en-US'}
                        onChange={(e) => onPreferencesChange({
                            ...preferences,
                            translation: { ...preferences.translation, inputLanguage: e.target.value }
                        })}
                        className="w-full p-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 text-sm focus:ring-2 focus:ring-maroon focus:border-maroon outline-none transition-shadow"
                    >
                        <option value="en-US">English</option>
                        <option value="es-ES">Spanish</option>
                        <option value="it-IT">Italian</option>
                        <option value="fr-FR">French</option>
                        <option value="de-DE">German</option>
                        <option value="ja-JP">Japanese</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-stone-500 uppercase tracking-wide mb-1">Output Language (I speak)</label>
                    <select 
                        value={preferences.translation?.outputLanguage || 'en-US'}
                        onChange={(e) => onPreferencesChange({
                            ...preferences,
                            language: e.target.value, // Sync main language
                            translation: { ...preferences.translation, outputLanguage: e.target.value }
                        })}
                        className="w-full p-2.5 rounded-lg border border-stone-300 bg-white text-stone-800 text-sm focus:ring-2 focus:ring-maroon focus:border-maroon outline-none transition-shadow"
                    >
                        <option value="en-US">English</option>
                        <option value="es-ES">Spanish</option>
                        <option value="it-IT">Italian</option>
                        <option value="fr-FR">French</option>
                        <option value="de-DE">German</option>
                        <option value="ja-JP">Japanese</option>
                    </select>
                </div>
            </div>

            <hr className="border-stone-100" />

            {/* Live Translation Toggle & Depth */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-stone-800 text-base">Live Translation</p>
                        <p className="text-xs text-stone-500">Real-time audio translation</p>
                    </div>
                    
                    <button
                        onClick={() => onPreferencesChange({
                            ...preferences,
                            translation: { ...preferences.translation, enabled: !preferences.translation.enabled }
                        })}
                        className={`p-3 rounded-full transition-all duration-300 ${preferences.translation?.enabled ? 'bg-maroon text-white shadow-md ring-2 ring-maroon/20' : 'bg-stone-100 text-stone-400 hover:bg-stone-200'}`}
                        aria-label={preferences.translation?.enabled ? "Disable Live Translation" : "Enable Live Translation"}
                    >
                        <TranslateIcon className="w-6 h-6" />
                    </button>
                </div>

                {preferences.translation?.enabled && (
                    <div className="animate-fadeIn pt-2">
                         <LabeledSlider
                            emoji="🎚️"
                            label="Listening Focus"
                            min={0}
                            max={1}
                            value={preferences.translation?.depth ?? 0.5}
                            leftLabel="Forefront Only"
                            rightLabel="Everything"
                            onChange={(v) => onPreferencesChange({
                                ...preferences,
                                translation: { ...preferences.translation, depth: v }
                            })}
                        />
                        <p className="text-xs text-stone-400 text-center mt-2 max-w-xs mx-auto">
                            Adjust to filter out background noise (Forefront) or translate all ambient conversations (Everything).
                        </p>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* API Key Override */}
      <div>
        <h3 className="text-lg font-bold text-stone-800 px-4">API Key Override</h3>
        <p className="text-sm text-stone-500 mb-4 px-4">Enter your own Gemini API key to override the default.</p>
        <div className="bg-white p-4 rounded-xl shadow mx-4">
            <input
                type="password"
                placeholder="Enter Gemini API Key"
                value={preferences.geminiApiKey || ''}
                onChange={(e) => onPreferencesChange({ ...preferences, geminiApiKey: e.target.value })}
                className="w-full p-3 rounded-lg border border-stone-200 bg-stone-50 text-sm font-mono"
            />
            <p className="text-xs text-stone-400 mt-2">Leave empty to use the default system key.</p>
        </div>
      </div>
    </div>
  );
};
