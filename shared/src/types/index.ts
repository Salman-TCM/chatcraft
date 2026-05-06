export type UserRole = "free" | "trial" | "premium" | "creator" | "admin";

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid";

export type MessageRole = "user" | "assistant" | "system";

export type DocumentStatus = "pending" | "processing" | "ready" | "error";

export type LLMProvider = "anthropic" | "openai" | "google";

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  total: number;
  page: number;
  per_page: number;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  avatarUrl: string | null;
  stripeCustomerId: string | null;
  subscriptionStatus: SubscriptionStatus | null;
  trialEndsAt: string | null;
  createdAt: string;
}

export interface ChatbotConfig {
  id: string;
  userId: string;
  name: string;
  defaultModel: string;
  allowModelSwitch: boolean;
  fallbackModel: string | null;
  published: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  chatbotId: string;
  userId: string | null;
  guestId: string | null;
  title: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  createdAt: string;
}

export interface KnowledgeBaseDocument {
  id: string;
  chatbotId: string;
  name: string;
  type: string;
  fileUrl: string | null;
  status: DocumentStatus;
  chunkCount: number;
  tokenCount: number;
  createdAt: string;
}

export interface UsageSummary {
  messagesUsed: number;
  messagesCap: number;
  ttsCharsUsed: number;
  sttSecsUsed: number;
  embeddingTokensUsed: number;
  storageBytes: number;
  costUsd: number;
  periodStart: string;
  periodEnd: string;
}
