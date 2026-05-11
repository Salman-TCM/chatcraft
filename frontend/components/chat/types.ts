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
}
