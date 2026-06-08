"use client";

import { useSession } from "next-auth/react";
import { hasFeatureAccess, type FeatureKey } from "@/lib/features";

/**
 * Returns whether the current user has access to a given feature.
 *
 * Usage:
 *   const canUseWallet = useFeature("wallet");
 *   if (!canUseWallet) return <FeatureLockedMessage />;
 */
export function useFeature(feature: FeatureKey): boolean {
  const { data: session } = useSession();
  const role = session?.user?.role ?? null;
  const allowedFeatures = session?.user?.allowedFeatures ?? null;
  return hasFeatureAccess(role, allowedFeatures, feature);
}
