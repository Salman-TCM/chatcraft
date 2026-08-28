"use client";

/**
 * A drop-in "Convert to PDF" button. Accepts an Office document upload,
 * POSTs it to the conversion endpoint, and triggers a browser download.
 *
 * Works for both authenticated (agentId + token) and public (shareToken) flows.
 */

import { useRef, useState } from "react";
import { FileOutput, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const CONVERT_ACCEPT = ".docx,.doc,.odt,.rtf,.pptx,.ppt,.xlsx,.xls,.ods,.odp,.html,.htm,.txt";
const MAX_BYTES = 50 * 1024 * 1024;

interface ConvertButtonProps {
  /** POST URL for conversion, e.g. /api/v1/agents/{id}/convert */
  endpoint: string;
  /** Bearer token for authenticated endpoints; omit for public ones */
  accessToken?: string | null;
  className?: string;
  /** Icon + label variant */
  iconOnly?: boolean;
}

export function ConvertButton({ endpoint, accessToken, className, iconOnly }: ConvertButtonProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_BYTES) {
      setError("File exceeds 50 MB.");
      return;
    }
    setError(null);
    setConverting(true);

    const form = new FormData();
    form.append("file", file);

    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

      const res = await fetch(endpoint, { method: "POST", headers, body: form });

      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const j = await res.json(); msg = j.detail || msg; } catch {}
        setError(msg);
        return;
      }

      const blob = await res.blob();
      // Derive filename from Content-Disposition or fall back to stem + .pdf
      const cd = res.headers.get("Content-Disposition") || "";
      const match = cd.match(/filename="?([^"]+)"?/);
      const pdfName = match?.[1] || file.name.replace(/\.[^.]+$/, "") + ".pdf";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = pdfName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Conversion failed.");
    } finally {
      setConverting(false);
    }
  };

  return (
    <div className={cn("relative flex flex-col items-start gap-1", className)}>
      <input
        ref={fileRef}
        type="file"
        accept={CONVERT_ACCEPT}
        className="hidden"
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => { setError(null); fileRef.current?.click(); }}
        disabled={converting}
        title="Convert document to PDF (DOCX, PPTX, XLSX, ODT, RTF, HTML…)"
        className={cn(
          "flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium",
          "bg-background hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        )}
      >
        {converting
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : <FileOutput className="h-3.5 w-3.5" />}
        {!iconOnly && (converting ? "Converting…" : "Convert to PDF")}
      </button>
      {error && (
        <p className="text-[11px] text-destructive max-w-[200px] leading-snug">{error}</p>
      )}
    </div>
  );
}
