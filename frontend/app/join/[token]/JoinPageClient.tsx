"use client";

import { useEffect, useState } from "react";
import { Loader2, Smartphone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { FcGoogle } from "react-icons/fc";

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

const GENERIC_ERROR_MESSAGE = "Something went wrong. Please try again.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Every field the program's admin configured is required for enrollment —
 * there's no server-declared "required" flag, so we treat the rendered
 * field list itself as the source of truth. */
function validateJoinForm(fields: string[], data: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    const value = (data[field] || "").trim();
    if (!value) {
      errors[field] = `${FIELD_LABELS[field] || field} is required`;
    } else if (field === "email" && !EMAIL_RE.test(value)) {
      errors[field] = "Enter a valid email address";
    }
  }
  return errors;
}

/** Parses a fetch error body into a message + per-field errors. The API
 * returns two shapes: a plain string `detail` (hand-rolled
 * HTTPException(detail="...") calls) and the structured
 * {success, code, error, fields} shape produced for Pydantic validation
 * errors — see backend/app/core/error_handlers.py. Handles both so we don't
 * lose the specific message on the string-detail path (e.g. an expired/
 * inactive join link), while still surfacing field-level messages when present. */
function parseApiError(body: unknown): { message: string; fields: Record<string, string> } {
  const detail = (body as { detail?: unknown } | null | undefined)?.detail;
  if (typeof detail === "string" && detail) {
    return { message: detail, fields: {} };
  }
  if (detail && typeof detail === "object") {
    const d = detail as { error?: string; fields?: { field: string; message: string }[] };
    const fields = (d.fields ?? []).reduce<Record<string, string>>((acc, f) => {
      acc[f.field] = f.message;
      return acc;
    }, {});
    return { message: d.error || GENERIC_ERROR_MESSAGE, fields };
  }
  return { message: GENERIC_ERROR_MESSAGE, fields: {} };
}

export default function JoinPageClient({ token }: { token: string }) {
  const [program, setProgram] = useState<ProgramInfo | null>(null);
  const [card, setCard] = useState<CardResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

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
    setError("");

    const fields = program.join_form_fields?.length ? program.join_form_fields : ["name", "email"];
    const validationErrors = validateJoinForm(fields, formData);
    if (Object.keys(validationErrors).length > 0) {
      setFieldErrors(validationErrors);
      setError("Please fix the highlighted fields below.");
      return;
    }
    setFieldErrors({});

    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/wallet/join/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const { message, fields: apiFieldErrors } = parseApiError(body);
        setFieldErrors(apiFieldErrors);
        setError(message);
        toast({ variant: "destructive", title: "Couldn't join program", description: message });
        return;
      }
      const data = await res.json();
      setCard(data.data);
    } catch {
      setError(GENERIC_ERROR_MESSAGE);
      toast({ variant: "destructive", title: "Couldn't join program", description: GENERIC_ERROR_MESSAGE });
    } finally {
      setSubmitting(false);
    }
  }

  function handleFieldChange(field: string, value: string) {
    setFormData((p) => ({ ...p, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((p) => {
        const next = { ...p };
        delete next[field];
        return next;
      });
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
                  <FcGoogle className="h-5 w-5" />
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
          noValidate
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
                onChange={(e) => handleFieldChange(field, e.target.value)}
                placeholder={FIELD_LABELS[field] || field}
                aria-invalid={!!fieldErrors[field]}
                className={`bg-white/10 text-white placeholder:text-white/30 focus-visible:ring-white/30 ${
                  fieldErrors[field] ? "border-red-400/60" : "border-white/20"
                }`}
              />
              {fieldErrors[field] && (
                <p className="text-xs text-red-300">{fieldErrors[field]}</p>
              )}
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
