"use client";

import Link from "next/link";
import { FiCheck } from "react-icons/fi";
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
              <FiCheck className="h-4 w-4 shrink-0 text-green-500" aria-hidden="true" />
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
