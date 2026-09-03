"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, CheckCircle, AlertCircle, Upload, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function ScanReceiptPage({ params }: { params: { serial: string } }) {
  const { serial } = params;
  const [imagePreview, setImagePreview] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
    awarded?: number;
    type?: string;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  function handleFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImagePreview(dataUrl);
      setResult(null);
    };
    reader.readAsDataURL(file);
  }

  async function handleSubmit() {
    if (!imagePreview) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/wallet/cards/${serial}/receipt-scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: imagePreview }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Scan failed");
      setResult({
        success: true,
        message: `+${data.data.awarded?.toFixed(0)} ${data.data.awarded_type} awarded!`,
        awarded: data.data.awarded,
        type: data.data.awarded_type,
      });
      setImagePreview("");
    } catch (err: unknown) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Could not process receipt.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-white/10">
        <Link href={`/pass/${serial}`}>
          <button className="inline-flex items-center justify-center text-white/60 hover:text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
        </Link>
        <h1 className="text-white font-semibold">Scan Receipt</h1>
      </div>

      <div className="flex-1 flex flex-col items-center justify-start px-4 py-8 max-w-sm mx-auto w-full space-y-6">

        <div className="text-center">
          <p className="text-white/70 text-sm">
            Take a photo of your receipt to earn points or punches automatically.
          </p>
        </div>

        {/* Result */}
        {result && (
          <div className={`w-full flex items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium ${
            result.success
              ? "bg-green-500/20 border border-green-500/30 text-green-300"
              : "bg-red-500/20 border border-red-500/30 text-red-300"
          }`}>
            {result.success
              ? <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" />
              : <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />}
            <div>
              <p>{result.message}</p>
              {result.success && (
                <p className="text-xs mt-0.5 opacity-70">Your pass will update shortly.</p>
              )}
            </div>
          </div>
        )}

        {/* Image preview */}
        {imagePreview ? (
          <div className="w-full space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="Receipt preview"
              className="w-full rounded-xl object-contain max-h-64 border border-white/10"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1 border-white/20 text-white/70 hover:text-white hover:bg-white/10"
                onClick={() => { setImagePreview(""); setResult(null); }}
              >
                Choose different
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Submit
              </Button>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-3">
            {/* Camera capture */}
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-2xl border-2 border-dashed border-white/20 hover:border-white/40 transition-colors py-12 flex flex-col items-center gap-3 text-white/60 hover:text-white/80"
            >
              <Camera className="h-10 w-10" />
              <div>
                <p className="font-medium">Take a photo</p>
                <p className="text-sm text-white/40">or tap to choose from library</p>
              </div>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {/* Gallery pick fallback */}
            <Button
              variant="outline"
              className="w-full border-white/20 text-white/60 hover:text-white hover:bg-white/10"
              onClick={() => {
                if (fileRef.current) {
                  fileRef.current.removeAttribute("capture");
                  fileRef.current.click();
                }
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Choose from library
            </Button>
          </div>
        )}

        <p className="text-center text-xs text-white/30 px-4">
          AI reads your receipt total and awards {"{points or punches}"} automatically.
          Each receipt can only be redeemed once.
        </p>
      </div>
    </div>
  );
}
