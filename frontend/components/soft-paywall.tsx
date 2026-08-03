"use client";

import Link from "next/link";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

const ROLE_ORDER: Record<string, number> = {
  free: 0,
  trial: 1,
  premium: 2,
  creator: 3,
  admin: 4,
};

function hasAccess(userRole: string | null, requiredRole: string): boolean {
  if (!userRole) return false;
  return (ROLE_ORDER[userRole] ?? 0) >= (ROLE_ORDER[requiredRole] ?? 99);
}

interface SoftPaywallProps {
  requiredRole?: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export function SoftPaywall({
  requiredRole = "premium",
  title = "Pro feature",
  description = `Upgrade to ${APP_NAME} Pro to unlock this feature.`,
  children,
}: SoftPaywallProps) {
  const role = useAppStore((s) => s.user?.role ?? null);
  const openUpgradeModal = useAppStore((s) => s.openUpgradeModal);

  if (hasAccess(role, requiredRole)) {
    return <>{children}</>;
  }

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Blurred content */}
      <div className="select-none blur-sm pointer-events-none" aria-hidden="true">
        {children}
      </div>

      {/* Overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-background/70 backdrop-blur-[2px] p-6 text-center">
        <div className="rounded-full bg-muted p-3">
          <svg
            className="h-6 w-6 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        </div>

        <div className="space-y-1">
          <p className="font-semibold">{title}</p>
          <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => openUpgradeModal(description)}>
            Upgrade to Pro
          </Button>
          <Link href="/pricing">
            <Button size="sm" variant="outline">
              See plans
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
