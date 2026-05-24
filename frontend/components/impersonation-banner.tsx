"use client";

import { useEffect, useState } from "react";
import { ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ImpersonationInfo {
  token?: string;
  userName?: string;
  expiresAt?: number;
}

export function ImpersonationBanner() {
  const [info, setInfo] = useState<ImpersonationInfo | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("impersonation_session");
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (parsed.expiresAt && Date.now() > parsed.expiresAt) {
        localStorage.removeItem("impersonation_session");
        return;
      }
      setInfo(parsed);
    } catch {
      // ignore
    }
  }, []);

  function exit() {
    localStorage.removeItem("impersonation_session");
    setInfo(null);
    window.location.href = "/admin/users";
  }

  if (!info) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-[100] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between text-sm font-medium shadow-md">
      <div className="flex items-center gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0" />
        <span>Viewing as {info.userName ?? "user"} — impersonation session active</span>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 text-amber-950 hover:bg-amber-600 hover:text-amber-950 gap-1.5"
        onClick={exit}
      >
        <X className="h-3.5 w-3.5" /> Exit
      </Button>
    </div>
  );
}
