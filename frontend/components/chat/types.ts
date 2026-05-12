export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: string;
  feedback?: "thumbs_up" | "thumbs_down" | null;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string | null;
  updatedAt: string;
}

export interface ChatbotConfig {
  id: string;
  name: string;
  defaultModel: string;
  fallbackModel: string | null;
  allowModelSwitch: boolean;
  published: boolean;
  systemPrompt: string | null;
  // Branding
  logoUrl: string | null;
  primaryColour: string;
  secondaryColour: string;
  backgroundColour: string;
  fontFamily: string;
  welcomeMessage: string | null;
  placeholderText: string;
  bubbleStyle: "rounded" | "square" | "pill";
  darkMode: boolean;
  // Voice
  ttsEnabled: boolean;
  sttEnabled: boolean;
  autoPlayTts: boolean;
  voiceId: string | null;
  voiceStability: number;
  voiceSimilarityBoost: number;
}
