"use client";

import Link from "next/link";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PLAN_FEATURES = [
  "5,000 messages per month",
  "All AI models (GPT-4, Claude, Gemini)",
  "Knowledge base (RAG)",
  "Custom branding",
  "Analytics dashboard",
  "Priority support",
];

export function UpgradeModal() {
  const open = useAppStore((s) => s.upgradeModalOpen);
  const reason = useAppStore((s) => s.upgradeModalReason);
  const close = useAppStore((s) => s.closeUpgradeModal);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">
            {reason || "You've reached your usage limit"}
          </DialogTitle>
          <DialogDescription>
            Upgrade to {APP_NAME} Pro to keep the conversation going.
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 py-2">
          {PLAN_FEATURES.map((f) => (
            <li key={f} className="flex items-center gap-2 text-sm">
              <svg
                className="h-4 w-4 shrink-0 text-green-500"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
              {f}
            </li>
          ))}
        </ul>

        <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
          <Button variant="outline" onClick={close}>
            Maybe later
          </Button>
          <Link href="/pricing" onClick={close} className="w-full sm:w-auto">
            <Button className="w-full">View plans</Button>
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
