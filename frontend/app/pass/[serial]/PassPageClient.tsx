"use client";

import { useEffect, useState } from "react";
import { Loader2, Smartphone, Camera } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CardInfo {
  serial: string;
  customer_name: string;
  customer_email: string | null;
  status: string;
  program: {
    name: string;
    type: string;
    description?: string;
    config?: Record<string, unknown>;
    brand_overrides?: Record<string, string>;
  };
  state: Record<string, unknown>;
  pkpass_url: string;
  google_url: string;
  receipt_scan_enabled?: boolean;
}

export default function PassPageClient({ serial }: { serial: string }) {
  const [card, setCard] = useState<CardInfo | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  // Use Google Charts API for QR (no extra npm package needed)
  const passPageUrl = typeof window !== "undefined" ? window.location.href : `https://app.chatcraft.ai/pass/${serial}`;
  const qrUrl = `https://chart.googleapis.com/chart?chs=240x240&cht=qr&chl=${encodeURIComponent(passPageUrl)}&choe=UTF-8`;

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiBase}/api/wallet/cards/${serial}/public`);
        if (!res.ok) throw new Error("Card not found");
        const data = await res.json();
        setCard(data.data);
      } catch {
        setError("This pass link is not valid or has expired.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [serial, apiBase]);

  function stateLabel(state: Record<string, unknown>, type: string): string {
    if (!state) return "";
    switch (type) {
      case "punch_card":
        return `${state.punches ?? 0} / ${state.max_punches ?? "?"} punches`;
      case "points":
        return `${state.points ?? 0} points`;
      case "prepaid_balance":
        return `$${Number(state.balance ?? 0).toFixed(2)} balance`;
      case "membership":
        return `Tier: ${state.tier ?? "Standard"}`;
      case "coupon":
        return state.redeemed ? "Redeemed" : "Valid";
      default:
        return "";
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
        <Card className="max-w-sm w-full text-center py-10 bg-white/5 border-white/10 text-white">
          <CardContent>
            <p className="text-lg font-semibold mb-2">Pass Not Found</p>
            <p className="text-sm text-white/60">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const statusLabel = stateLabel(card.state, card.program.type);
  const isActive = card.status === "active";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4 py-10">
      <div className="w-full max-w-sm space-y-4">
        {/* Pass card */}
        <Card className="overflow-hidden bg-white/10 border-white/10 backdrop-blur-sm text-white">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-widest text-white/50 mb-1">
                  {card.program.type.replace(/_/g, " ")}
                </p>
                <CardTitle className="text-2xl">{card.program.name}</CardTitle>
                {card.program.description && (
                  <p className="text-sm text-white/60 mt-1">{card.program.description}</p>
                )}
              </div>
              {isActive ? (
                <span className="shrink-0 rounded-full bg-green-500/20 px-2.5 py-1 text-[11px] font-semibold text-green-400 border border-green-500/30">
                  Active
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-red-500/20 px-2.5 py-1 text-[11px] font-semibold text-red-400 border border-red-500/30">
                  {card.status}
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <p className="font-semibold text-lg">{card.customer_name}</p>
            {card.customer_email && (
              <p className="text-sm text-white/50">{card.customer_email}</p>
            )}
            {statusLabel && (
              <p className="mt-2 text-sm font-medium text-white/80">{statusLabel}</p>
            )}
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card className="bg-white border-0 p-4 flex justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qrUrl}
            alt="Card QR code"
            width={200}
            height={200}
            className="rounded-md"
          />
        </Card>

        {/* Add to Wallet buttons */}
        <div className="space-y-3">
          <a href={`${apiBase}${card.pkpass_url}`} download>
            <Button className="w-full h-12 bg-black hover:bg-zinc-800 text-white border-0 gap-2">
              <Smartphone className="h-5 w-5" />
              Add to Apple Wallet
            </Button>
          </a>
          <a href={card.google_url} target="_blank" rel="noopener noreferrer">
            <Button className="w-full h-12 bg-white hover:bg-gray-100 text-black border-0 gap-2">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z" fill="currentColor" />
              </svg>
              Add to Google Wallet
            </Button>
          </a>
        </div>

        {/* Receipt scan link */}
        {card.receipt_scan_enabled && (
          <Link href={`/pass/${serial}/scan-receipt`}>
            <Button variant="outline" className="w-full h-11 border-white/20 text-white/70 hover:text-white hover:bg-white/10 gap-2">
              <Camera className="h-4 w-4" />
              Scan Receipt for Points
            </Button>
          </Link>
        )}

        <p className="text-center text-xs text-white/30">
          Card #{card.serial}
        </p>
      </div>
    </div>
  );
}
