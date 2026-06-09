/**
 * Feature registry — mirrors backend app/core/features.py.
 * Keep in sync if features are added/removed.
 */
export const FEATURES = {
  WALLET:          "wallet",
  AGENT_BUILDER:   "agent_builder",
  FLOWS:           "flows",
  AUTOMATIONS:     "automations",
  ANALYTICS:       "analytics",
  KNOWLEDGE_BASE:  "knowledge_base",
  INBOX:           "inbox",
  FORMS:           "forms",
  CAMPAIGNS:       "campaigns",
  WHITE_LABEL:     "white_label",
  CHATBOTS:        "chatbots",
  CONTACTS:        "contacts",
  KEYWORDS:        "keywords",
  SOCIAL:          "social",
  SEQUENCES:       "sequences",
  PIPELINES:       "pipelines",
  LANDING_PAGES:   "landing_pages",
  STORES:          "stores",
  VOICE_LAB:       "voice_lab",
  BROWSER_AGENT:   "browser_agent",
  MCP_SERVERS:     "mcp_servers",
} as const;

export type FeatureKey = typeof FEATURES[keyof typeof FEATURES];

/** Map of feature key → dashboard route prefix (used by middleware). */
export const FEATURE_ROUTES: Record<FeatureKey, string> = {
  wallet:         "/dashboard/wallet",
  agent_builder:  "/dashboard/agents",
  flows:          "/dashboard/flows",
  automations:    "/dashboard/automations",
  analytics:      "/dashboard/analytics",
  knowledge_base: "/dashboard/knowledge",
  inbox:          "/dashboard/inbox",
  forms:          "/dashboard/forms",
  campaigns:      "/dashboard/campaigns",
  white_label:    "/dashboard/white-label",
  chatbots:       "/dashboard/chatbots",
  contacts:       "/dashboard/contacts",
  keywords:       "/dashboard/keywords",
  social:         "/dashboard/social",
  sequences:      "/dashboard/sequences",
  pipelines:      "/dashboard/pipelines",
  landing_pages:  "/dashboard/landing-pages",
  stores:         "/dashboard/stores",
  voice_lab:      "/dashboard/voice-lab",
  browser_agent:  "/dashboard/browser-agent",
  mcp_servers:    "/dashboard/settings/mcp",
};

/**
 * Returns true if the user has access to the given feature.
 * - Admins always have full access.
 * - null allowedFeatures = unrestricted (full access).
 * - string[] = only the listed features are allowed.
 */
export function hasFeatureAccess(
  role: string | null | undefined,
  allowedFeatures: string[] | null | undefined,
  feature: FeatureKey,
): boolean {
  if (role === "admin") return true;
  if (allowedFeatures === null || allowedFeatures === undefined) return true;
  return allowedFeatures.includes(feature);
}
