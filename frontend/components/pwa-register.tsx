"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegister() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    navigator.serviceWorker.register("/sw.js").catch(() => {});

    const handler = (e: Event) => {
      e.preventDefault();
      const dismissed = sessionStorage.getItem("pwa-install-dismissed");
      if (!dismissed) {
        setInstallPrompt(e as BeforeInstallPromptEvent);
        setShowBanner(true);
      }
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function handleInstall() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    if (outcome === "accepted") {
      setShowBanner(false);
    }
    setInstallPrompt(null);
  }

  function handleDismiss() {
    sessionStorage.setItem("pwa-install-dismissed", "1");
    setShowBanner(false);
  }

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border bg-background px-4 py-3 shadow-lg max-w-sm w-[calc(100%-2rem)]">
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <p className="flex-1 text-sm">
        Install <span className="font-semibold">{APP_NAME}</span> for quick access
      </p>
      <Button size="sm" className="h-7 text-xs shrink-0" onClick={handleInstall}>
        Install
      </Button>
      <button
        onClick={handleDismiss}
        className="inline-flex items-center justify-center p-1 rounded hover:bg-muted text-muted-foreground"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
