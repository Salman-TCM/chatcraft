"use client";

import { useEffect, useState } from "react";
import { Loader2, Smartphone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProgramInfo {
  program_id: string;
  name: string;
  type: string;
  description: string | null;
  config: Record<string, string>;
  brand_overrides: Record<string, string>;
  join_form_fields: string[];
}

interface CardResult {
  serial: string;
  pkpass_url: string;
  google_url: string;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Full name",
  email: "Email address",
  phone: "Phone number",
  birthday: "Birthday",
  postal_code: "Postal code",
};
const FIELD_TYPES: Record<string, string> = {
  email: "email",
  phone: "tel",
  birthday: "date",
  name: "text",
  postal_code: "text",
};

export default function JoinPageClient({ token }: { token: string }) {
  const [program, setProgram] = useState<ProgramInfo | null>(null);
  const [card, setCard] = useState<CardResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${apiBase}/api/wallet/join/${token}`);
        if (!res.ok) throw new Error("Invalid join link");
        const data = await res.json();
        setProgram(data.data);
        const initial: Record<string, string> = {};
        (data.data.join_form_fields || ["name", "email"]).forEach((f: string) => {
          initial[f] = "";
        });
        setFormData(initial);
      } catch {
        setError("This join link is not valid or has expired.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token, apiBase]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!program) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/wallet/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Enrollment failed");
      }
      const data = await res.json();
      setCard(data.data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    );
  }

  if (error && !program) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 px-4">
        <div className="max-w-sm w-full text-center bg-white/5 border border-white/10 rounded-2xl p-10 text-white">
          <p className="text-lg font-semibold mb-2">Link Not Found</p>
          <p className="text-sm text-white/60">{error}</p>
        </div>
      </div>
    );
  }

  if (!program) return null;

  const bg = program.brand_overrides?.background_color || "#4f46e5";
  const fg = program.brand_overrides?.foreground_color || "#ffffff";
  const fields = program.join_form_fields || ["name", "email"];

  // Success: show Add to Wallet buttons
  if (card) {
    return (
      <div
        className="flex min-h-screen items-center justify-center px-4 py-10"
        style={{ background: `linear-gradient(135deg, ${bg}22 0%, #0f172a 100%)` }}
      >
        <div className="w-full max-w-sm space-y-6 text-center">
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl shadow-lg text-2xl"
              style={{ backgroundColor: bg }}>
              <Check className="h-8 w-8" style={{ color: fg }} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{program.name}</h1>
              <p className="text-sm text-white/60 mt-1">You&apos;re in! Add the pass to your wallet.</p>
            </div>
          </div>

          <div className="space-y-3">
            <a href={`${apiBase}${card.pkpass_url}`} download className="block">
              <Button className="w-full h-12 bg-black hover:bg-zinc-800 text-white border-0 gap-2 rounded-xl">
                <Smartphone className="h-5 w-5" />
                Add to Apple Wallet
              </Button>
            </a>
            {card.google_url && (
              <a href={card.google_url} target="_blank" rel="noopener noreferrer" className="block">
                <Button className="w-full h-12 bg-white hover:bg-gray-100 text-black border-0 gap-2 rounded-xl">
                  <svg className="h-5 w-5" viewBox="0 0 533.5 544.3" xmlns="http://www.w3.org/2000/svg">
                    <path d="M533.5 278.4c0-18.5-1.5-37.1-4.7-55.3H272.1v104.8h147c-6.1 33.8-25.7 63.7-54.4 82.7v68h87.7c51.5-47.4 81.1-117.4 81.1-200.2z" fill="#4285f4"/>
                    <path d="M272.1 544.3c73.4 0 135.3-24.1 180.4-65.7l-87.7-68c-24.4 16.6-55.9 26-92.6 26-71 0-131.2-47.9-152.8-112.3H28.9v70.1c46.2 91.9 140.3 149.9 243.2 149.9z" fill="#34a853"/>
                    <path d="M119.3 324.3c-11.4-33.8-11.4-70.4 0-104.2V150H28.9c-38.6 76.9-38.6 167.5 0 244.4l90.4-70.1z" fill="#fbbc04"/>
                    <path d="M272.1 107.7c38.8-.6 76.3 14 104.4 40.8l77.7-77.7C405 24.6 339.7-.8 272.1 0 169.2 0 75.1 58 28.9 150l90.4 70.1c21.5-64.5 81.8-112.4 152.8-112.4z" fill="#ea4335"/>
                  </svg>
                  Add to Google Wallet
                </Button>
              </a>
            )}
          </div>

          <p className="text-xs text-white/30">Card #{card.serial}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center px-4 py-10"
      style={{ background: `linear-gradient(135deg, ${bg}22 0%, #0f172a 100%)` }}
    >
      <div className="w-full max-w-sm">
        {/* Program header */}
        <div className="text-center mb-8">
          {program.brand_overrides?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={program.brand_overrides.logo_url}
              alt={program.name}
              className="h-14 mx-auto object-contain mb-4"
            />
          ) : (
            <div
              className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center text-2xl font-bold"
              style={{ backgroundColor: bg, color: fg }}
            >
              {program.name[0]}
            </div>
          )}
          <h1 className="text-2xl font-bold text-white">{program.name}</h1>
          {program.description && (
            <p className="text-sm text-white/60 mt-2">{program.description}</p>
          )}
        </div>

        {/* Join form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4 backdrop-blur-sm"
        >
          <p className="text-sm font-medium text-white/80 mb-2">Join this program</p>

          {error && (
            <div className="rounded-lg bg-red-500/20 border border-red-500/30 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {fields.map((field) => (
            <div key={field} className="space-y-1.5">
              <Label className="text-xs text-white/70">{FIELD_LABELS[field] || field}</Label>
              <Input
                type={FIELD_TYPES[field] || "text"}
                value={formData[field] || ""}
                onChange={(e) => setFormData((p) => ({ ...p, [field]: e.target.value }))}
                placeholder={FIELD_LABELS[field] || field}
                required={field === "name"}
                className="bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-white/30"
              />
            </div>
          ))}

          <Button
            type="submit"
            disabled={submitting}
            className="w-full h-11 font-semibold mt-2 rounded-xl"
            style={{ backgroundColor: bg, color: fg }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Join program
          </Button>
        </form>

        <p className="text-center text-xs text-white/30 mt-4">
          By joining, you agree to receive loyalty updates.
        </p>
      </div>
    </div>
  );
}
