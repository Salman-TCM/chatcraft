"use client";

import Link from "next/link";
import { FiXCircle } from "react-icons/fi";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const ROLE_CAPS: Record<string, number> = {
  free: 20,
  trial: 500,
  premium: 5000,
};

const NEXT_PLAN: Record<string, { name: string; cap: number; price: string }> = {
  free: { name: "Pro", cap: 5000, price: "$49/mo" },
  trial: { name: "Pro", cap: 5000, price: "$49/mo" },
  premium: { name: "Enterprise", cap: 0, price: "custom pricing" },
};

export function HardPaywallModal() {
  const open = useAppStore((s) => s.hardPaywallOpen);
  const cap = useAppStore((s) => s.hardPaywallCap);
  const close = useAppStore((s) => s.closeHardPaywall);
  const role = useAppStore((s) => s.user?.role ?? "free");

  const resolvedCap = cap || ROLE_CAPS[role] || 0;
  const next = NEXT_PLAN[role] ?? NEXT_PLAN.free;

  return (
    <Dialog
      open={open}
      // Prevent closing by clicking outside or pressing Escape
      onOpenChange={() => {}}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader className="space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <FiXCircle className="h-7 w-7 text-destructive" aria-hidden="true" />
          </div>
          <DialogTitle className="text-center text-xl">
            Monthly message limit reached
          </DialogTitle>
          <DialogDescription className="text-center">
            You&apos;ve used all{" "}
            <span className="font-semibold text-foreground">
              {resolvedCap.toLocaleString()} messages
            </span>{" "}
            included in your current plan. Upgrade to continue chatting.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-4 text-sm space-y-2">
          <p className="font-medium">
            {next.cap > 0
              ? `${next.name} plan — ${next.cap.toLocaleString()} messages/mo`
              : `${next.name} plan — unlimited messages`}
          </p>
          <p className="text-muted-foreground">
            {next.cap > 0
              ? `Starting at ${next.price}`
              : "Contact us for custom pricing"}
          </p>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Link href="/pricing" onClick={close} className="w-full">
            <Button className="w-full">
              {next.cap > 0 ? `Upgrade to ${next.name}` : "Contact sales"}
            </Button>
          </Link>
          <Button
            variant="ghost"
            className="w-full text-muted-foreground"
            onClick={close}
          >
            Go back to dashboard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
