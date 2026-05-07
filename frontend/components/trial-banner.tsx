"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "chatcraft:trial-banner-dismissed";

function daysRemaining(endsAt: string): number {
  const diff = new Date(endsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function TrialBanner() {
  const { data: session } = useSession();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const role = session?.user?.role;
  const trialEndsAt = session?.user?.trialEndsAt ?? null;

  if (dismissed || role !== "trial" || !trialEndsAt) return null;

  const days = daysRemaining(trialEndsAt);

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  const urgency = days <= 1 ? "bg-red-600" : days <= 3 ? "bg-orange-500" : "bg-blue-600";

  return (
    <div className={`${urgency} text-white`} role="alert">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
        <p className="text-sm font-medium">
          {days === 0
            ? "Your free trial expires today."
            : days === 1
            ? "Your free trial expires tomorrow."
            : `Your free trial ends in ${days} day${days === 1 ? "" : "s"}.`}{" "}
          Upgrade to keep access to all features.
        </p>

        <div className="flex shrink-0 items-center gap-3">
          <Link href="/pricing">
            <Button
              size="sm"
              variant="secondary"
              className="h-7 text-xs"
            >
              Upgrade now
            </Button>
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="rounded p-0.5 opacity-75 hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
