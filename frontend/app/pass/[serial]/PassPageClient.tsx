"use client";

import { useEffect, useState } from "react";
import { Loader2, Smartphone, Camera, Share2, Check } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QRCodeSVG } from "qrcode.react";
import { FcGoogle } from "react-icons/fc";

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
  const [copied, setCopied] = useState(false);

  const passPageUrl = typeof window !== "undefined" ? window.location.href : `https://app.chatcraft.ai/pass/${serial}`;

  async function shareOrCopy() {
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: card?.program.name ?? "My Pass", url: passPageUrl });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(passPageUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

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

  function renderProgress(state: Record<string, unknown>, type: string, config?: Record<string, unknown>) {
    if (type === "punch_card") {
      const punches = Number(state.punches ?? 0);
      const max = Number(state.max_punches ?? config?.max_punches ?? 10);
      const pct = Math.min(100, (punches / max) * 100);
      return (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-white/60 mb-1.5">
            <span>{punches} punches</span>
            <span>{max - punches} to reward</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full bg-white/70 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {Array.from({ length: max }).map((_, i) => (
              <div key={i} className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                i < punches ? "bg-white border-white" : "border-white/30 bg-transparent"}`}>
                {i < punches && <div className="w-2 h-2 rounded-full bg-current opacity-30" />}
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (type === "points") {
      const points = Number(state.points ?? 0);
      const threshold = Number(config?.points_threshold ?? 100);
      const label = String(config?.points_label ?? "points");
      const pct = threshold > 0 ? Math.min(100, (points / threshold) * 100) : 0;
      return (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-white/60 mb-1.5">
            <span>{points.toLocaleString()} {label}</span>
            {threshold > 0 && <span>{Math.max(0, threshold - points)} to reward</span>}
          </div>
          {threshold > 0 && (
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-white/70 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
      );
    }
    return null;
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

  const brandBg = card.program.brand_overrides?.background_color;

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={brandBg
        ? { background: `linear-gradient(135deg, ${brandBg}33 0%, #0f172a 70%)` }
        : { background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)" }}
    >
      <div className="w-full max-w-sm space-y-4">
        {/* Pass card */}
        <Card
          className="overflow-hidden border-0 backdrop-blur-sm text-white"
          style={{ backgroundColor: brandBg ? `${brandBg}ee` : "rgba(255,255,255,0.10)" }}
        >
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-widest text-white/50 mb-1">
                  {card.program.type.replace(/_/g, " ")}
                </p>
                <CardTitle className="text-2xl text-white">{card.program.name}</CardTitle>
                {card.program.description && (
                  <p className="text-sm text-white/60 mt-1">{card.program.description}</p>
                )}
              </div>
              {isActive ? (
                <span className="shrink-0 rounded-full bg-green-500/20 px-2.5 py-1 text-[11px] font-semibold text-green-300 border border-green-500/30">
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
            <p className="font-semibold text-lg text-white">{card.customer_name}</p>
            {card.customer_email && (
              <p className="text-sm text-white/50">{card.customer_email}</p>
            )}
            {statusLabel && (
              <p className="mt-2 text-sm font-medium text-white/90">{statusLabel}</p>
            )}
            {renderProgress(card.state, card.program.type, card.program.config)}
          </CardContent>
        </Card>

        {/* QR Code */}
        <Card className="bg-white border-0 p-5 flex flex-col items-center gap-2">
          <QRCodeSVG value={passPageUrl} size={200} level="M" />
          <p className="text-xs text-gray-400 text-center">Scan to view this pass</p>
        </Card>

        {/* Add to Wallet buttons */}
        <div className="space-y-3">
          <a href={`${apiBase}${card.pkpass_url}`} download>
            <Button className="w-full h-12 bg-black hover:bg-zinc-800 text-white border-0 gap-2 rounded-xl">
              <Smartphone className="h-5 w-5" />
              Add to Apple Wallet
            </Button>
          </a>
          <a href={card.google_url} target="_blank" rel="noopener noreferrer">
            <Button className="w-full h-12 bg-white hover:bg-gray-100 text-black border-0 gap-2 rounded-xl">
              <FcGoogle className="h-5 w-5" />
              Add to Google Wallet
            </Button>
          </a>
        </div>

        {/* Receipt scan link */}
        {card.receipt_scan_enabled && (
          <Link href={`/pass/${serial}/scan-receipt`}>
            <Button variant="outline" className="w-full h-11 border-white/20 text-white/70 hover:text-white hover:bg-white/10 gap-2 rounded-xl">
              <Camera className="h-4 w-4" />
              Scan Receipt for Points
            </Button>
          </Link>
        )}

        {/* Share button */}
        <Button
          variant="ghost"
          onClick={shareOrCopy}
          className="w-full h-10 text-white/40 hover:text-white/70 hover:bg-white/5 gap-2"
        >
          {copied
            ? <><Check className="h-4 w-4" /> Link copied!</>
            : <><Share2 className="h-4 w-4" /> Share this pass</>}
        </Button>

        <p className="text-center text-xs text-white/20">
          Card #{card.serial}
        </p>
      </div>
    </div>
  );
}
