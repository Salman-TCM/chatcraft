// ── Rich content types ──────────────────────────────────────────────────────

export interface RichButton {
  type: "url" | "phone" | "email" | "postback" | "landing_page";
  label: string;
  url?: string;
  phone?: string;
  email?: string;
  payload?: string;
  landing_page_id?: string;
}

export interface CarouselItem {
  title: string;
  subtitle?: string;
  image_url?: string;
  buttons?: RichButton[];
}

export type RichBlock =
  | { type: "carousel"; items: CarouselItem[] }
  | { type: "card"; title: string; subtitle?: string; image_url?: string; buttons?: RichButton[] }
  | { type: "quick_replies"; text?: string; replies: string[] }
  | { type: "buttons"; text?: string; buttons: RichButton[] };

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
