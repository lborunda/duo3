import React from 'react';
import type { Preferences } from '../types';
import { RadarChart, capitalize } from './RadarChart';

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
        <h3 className="text-lg font-bold text-stone-800 px-4">Translation</h3>
        <p className="text-sm text-stone-500 mb-4 px-4">Configure live translation and language preferences.</p>
        
        <div className="bg-white p-4 rounded-xl shadow space-y-4 mx-4">
            <div className="flex items-center justify-between">
                <span className="font-medium text-stone-700">Live Translation</span>
                <button 
                    onClick={() => onPreferencesChange({
                        ...preferences,
                        translation: { ...preferences.translation, enabled: !preferences.translation.enabled }
                    })}
                    className={`w-12 h-6 rounded-full transition-colors duration-200 ease-in-out relative ${preferences.translation?.enabled ? 'bg-orange-500' : 'bg-stone-300'}`}
                >
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform duration-200 ${preferences.translation?.enabled ? 'left-7' : 'left-1'}`}></div>
                </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-stone-500 mb-1">Input Language (Mic)</label>
                    <select 
                        value={preferences.translation?.inputLanguage || 'en-US'}
                        onChange={(e) => onPreferencesChange({
                            ...preferences,
                            translation: { ...preferences.translation, inputLanguage: e.target.value }
                        })}
                        className="w-full p-2 rounded-lg border border-stone-200 bg-stone-50 text-sm"
                    >
                        <option value="en-US">English</option>
                        <option value="es-ES">Spanish</option>
                        <option value="it-IT">Italian</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-stone-500 mb-1">Output Language (DUO)</label>
                    <select 
                        value={preferences.translation?.outputLanguage || 'en-US'}
                        onChange={(e) => onPreferencesChange({
                            ...preferences,
                            language: e.target.value, // Sync main language
                            translation: { ...preferences.translation, outputLanguage: e.target.value }
                        })}
                        className="w-full p-2 rounded-lg border border-stone-200 bg-stone-50 text-sm"
                    >
                        <option value="en-US">English</option>
                        <option value="es-ES">Spanish</option>
                        <option value="it-IT">Italian</option>
                    </select>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
