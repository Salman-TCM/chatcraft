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
