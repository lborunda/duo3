
export interface Preferences {
  personality: {
    detailLevel: number; // 0 (concise) to 1 (detailed)
    creativity: number; // 0 (factual) to 1 (story-like)
    voiceSpeed: number; // 0.5 to 2.0
  };
  interests: {
    history: number;
    art: number;
    architecture: number;
    culture: number;
    food: number;
    nature: number;
    translation: number;
  };
  language: string;
  translation: {
    enabled: boolean;
    inputLanguage: string;
    outputLanguage: string;
    depth?: number; // 0 (forefront/focused) to 1 (ambient/everything)
  };
  geminiApiKey?: string;
}

export interface Message {
    role: 'user' | 'model';
    text: string;
}

export interface TripHighlight {
  id: string;
  imageData: string;
  conversation: Message[];
  timestamp: string;
  preferencesAtTimeOfCapture: Preferences;
}

export interface Trip {
  id: string;
  name: string;
  highlights: TripHighlight[];
  createdAt: string;
}
