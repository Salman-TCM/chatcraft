"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, QrCode, CheckCircle, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

interface ProgramInfo {
  program_id: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  brand_overrides: Record<string, string>;
  quick_actions: string[];
}

const ACTION_LABELS: Record<string, string> = {
  add_punch: "Add Punch",
  redeem: "Redeem",
  redeem_coupon: "Redeem Coupon",
  add_points: "Add Points",
  redeem_points_reward: "Redeem Reward",
  check_in: "Check In",
  deduct_balance: "Deduct Balance",
  set_tier: "Set Tier",
};

// Scanner-permitted subset accepted by POST /api/wallet/scan/{token}/action
// — see backend/app/schemas/wallet.py `_ScannerAction`. Some program types
// (e.g. membership) surface a "set_tier" quick action from the info endpoint
// that this scanner action endpoint does not actually accept, so we still
// need to guard rather than trust `quick_actions` blindly.
const SCANNER_ACTIONS = [
  "add_punch",
  "redeem",
  "add_points",
  "redeem_points_reward",
  "check_in",
  "deduct_balance",
  "redeem_coupon",
] as const;

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";

/** Parses a fetch error body into a display message. The API returns two
 * shapes: a plain string `detail` (hand-rolled HTTPException(detail="...")
 * calls) and the structured {success, code, error, fields} shape produced
 * for Pydantic validation errors — see backend/app/core/error_handlers.py.
 * Handles both so we don't lose the specific message on the string-detail
 * path (e.g. "Card is not active", "Insufficient balance: ..."). */
function parseApiError(body: unknown): string {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === "string" && detail) {
    return detail;
  }
  if (detail && typeof detail === "object") {
    const d = detail as { error?: string };
    return d.error || GENERIC_ERROR_MESSAGE;
  }
  return GENERIC_ERROR_MESSAGE;
}

export default function ScanPage({ params }: { params: { token: string } }) {
  const token = params.token;
  const [program, setProgram] = useState<ProgramInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [serial, setSerial] = useState("");
  const [selectedAction, setSelectedAction] = useState("");
  const [actionValue, setActionValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const serialInputRef = useRef<HTMLInputElement>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiBase}/api/wallet/scan/${token}`);
        if (!res.ok) throw new Error("Invalid scanner link");
        const data = await res.json();
        setProgram(data.data);
        if (data.data.quick_actions?.length > 0) {
          setSelectedAction(data.data.quick_actions[0]);
        }
      } catch {
        setError("This scanner link is not valid.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, apiBase]);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    if (!serial.trim() || !selectedAction) return;

    // Client-side guards before hitting the network:
    // 1. the action must be one the scan-action endpoint actually accepts
    //    (quick_actions can include actions — e.g. "set_tier" for membership
    //    programs — that this endpoint's schema rejects).
    if (!(SCANNER_ACTIONS as readonly string[]).includes(selectedAction)) {
      const message = "This action isn't available from the scanner.";
      setResult({ success: false, message });
      toast({ variant: "destructive", title: "Couldn't apply action", description: message });
      return;
    }

    // 2. if a numeric value is being collected, it must be a valid
    //    non-negative number before we submit it.
    let numericValue: string | undefined = undefined;
    if (needsValue) {
      const trimmed = actionValue.trim();
      if (trimmed) {
        const parsed = Number(trimmed);
        if (!Number.isFinite(parsed) || parsed < 0) {
          const message = "Enter a valid non-negative number.";
          setResult({ success: false, message });
          toast({ variant: "destructive", title: "Invalid value", description: message });
          return;
        }
        numericValue = trimmed;
      }
    }

    setSubmitting(true);
    setResult(null);
    try {
      const res = await fetch(`${apiBase}/api/wallet/scan/${token}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serial: serial.trim(),
          action: selectedAction,
          value: numericValue,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = parseApiError(body);
        setResult({ success: false, message });
        toast({ variant: "destructive", title: "Couldn't apply action", description: message });
        return;
      }
      const data = await res.json();
      setResult({ success: true, message: data.message || "Action applied successfully." });
      setSerial("");
      setActionValue("");
      setTimeout(() => {
        setResult(null);
        serialInputRef.current?.focus();
      }, 3000);
    } catch {
      setResult({ success: false, message: GENERIC_ERROR_MESSAGE });
      toast({ variant: "destructive", title: "Couldn't apply action", description: GENERIC_ERROR_MESSAGE });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Loader2 className="h-8 w-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <div className="text-center text-white">
          <AlertCircle className="h-10 w-10 mx-auto text-red-400 mb-3" />
          <p className="font-semibold">{error || "Scanner not found"}</p>
        </div>
      </div>
    );
  }

  const bg = program.brand_overrides?.background_color || "#4f46e5";
  const fg = program.brand_overrides?.foreground_color || "#ffffff";
  const needsValue = ["add_points", "deduct_balance", "set_tier"].includes(selectedAction);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Header */}
      <div className="px-4 py-5 text-center" style={{ backgroundColor: bg }}>
        <QrCode className="h-6 w-6 mx-auto mb-1" style={{ color: `${fg}99` }} />
        <h1 className="font-bold text-lg" style={{ color: fg }}>{program.name}</h1>
        <p className="text-xs mt-0.5" style={{ color: `${fg}80` }}>Staff Scanner Mode</p>
      </div>

      <div className="flex-1 px-4 py-6 max-w-sm mx-auto w-full space-y-5">

        {/* Result banner */}
        {result && (
          <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
            result.success
              ? "bg-green-500/20 border border-green-500/30 text-green-300"
              : "bg-red-500/20 border border-red-500/30 text-red-300"
          }`}>
            {result.success
              ? <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
              : <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />}
            {result.message}
          </div>
        )}

        <form onSubmit={handleScan} className="space-y-4">
          {/* Serial input */}
          <div className="space-y-1.5">
            <Label className="text-sm text-white/70">Card serial / QR code</Label>
            <Input
              ref={serialInputRef}
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="Scan or type serial number"
              autoFocus
              className="bg-white/5 border-white/20 text-white placeholder:text-white/30 h-12 text-base"
            />
            <p className="text-xs text-white/40">
              Point a barcode scanner at the QR on the customer&apos;s pass, or type the serial.
            </p>
          </div>

          {/* Action selector */}
          {program.quick_actions.length > 1 && (
            <div className="space-y-1.5">
              <Label className="text-sm text-white/70">Action</Label>
              <div className="grid grid-cols-2 gap-2">
                {program.quick_actions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setSelectedAction(a)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-medium border transition-all ${
                      selectedAction === a
                        ? "border-transparent text-white"
                        : "border-white/20 text-white/60 hover:border-white/40"
                    }`}
                    style={selectedAction === a ? { backgroundColor: bg, color: fg } : {}}
                  >
                    {ACTION_LABELS[a] || a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Value input for actions that need it */}
          {needsValue && (
            <div className="space-y-1.5">
              <Label className="text-sm text-white/70">
                {selectedAction === "add_points" ? "Points to add" :
                 selectedAction === "deduct_balance" ? "Amount to deduct" :
                 "Tier name"}
              </Label>
              <Input
                value={actionValue}
                onChange={(e) => setActionValue(e.target.value)}
                placeholder={selectedAction === "set_tier" ? "e.g. Gold" : "0"}
                className="bg-white/5 border-white/20 text-white placeholder:text-white/30"
              />
            </div>
          )}

          <Button
            type="submit"
            disabled={submitting || !serial.trim() || !selectedAction}
            className="w-full h-12 font-semibold rounded-xl text-base"
            style={{ backgroundColor: bg, color: fg }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> :
             result?.success ? <CheckCircle className="h-4 w-4 mr-2" /> :
             <RefreshCw className="h-4 w-4 mr-2" />}
            {ACTION_LABELS[selectedAction] || "Apply Action"}
          </Button>
        </form>

        <p className="text-center text-xs text-white/30">
          {program.type.replace(/_/g, " ")} program · Staff only
        </p>
      </div>
    </div>
  );
}
