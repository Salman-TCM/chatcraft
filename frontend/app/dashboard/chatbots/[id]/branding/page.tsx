"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2, Monitor, Smartphone, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

type BubbleStyle = "rounded" | "square" | "pill";

interface BrandingState {
  name: string;
  logoUrl: string | null;
  primaryColour: string;
  secondaryColour: string;
  backgroundColour: string;
  fontFamily: string;
  welcomeMessage: string;
  placeholderText: string;
  bubbleStyle: BubbleStyle;
  darkMode: boolean;
  replyDelay: number;
  published: boolean;
}

// ── Theme presets ─────────────────────────────────────────────────────────────

const PRESETS: Record<string, Partial<BrandingState>> = {
  Professional: {
    primaryColour: "#1e40af",
    secondaryColour: "#3b82f6",
    backgroundColour: "#f8fafc",
    fontFamily: "Inter",
    bubbleStyle: "rounded",
    darkMode: false,
  },
  Friendly: {
    primaryColour: "#6366f1",
    secondaryColour: "#8b5cf6",
    backgroundColour: "#fafafa",
    fontFamily: "Nunito",
    bubbleStyle: "pill",
    darkMode: false,
  },
  Bold: {
    primaryColour: "#dc2626",
    secondaryColour: "#f97316",
    backgroundColour: "#18181b",
    fontFamily: "Poppins",
    bubbleStyle: "square",
    darkMode: true,
  },
  Minimal: {
    primaryColour: "#374151",
    secondaryColour: "#6b7280",
    backgroundColour: "#ffffff",
    fontFamily: "system-ui",
    bubbleStyle: "rounded",
    darkMode: false,
  },
};

const FONT_OPTIONS = [
  "Inter",
  "Nunito",
  "Poppins",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Source Sans Pro",
  "system-ui",
];

const DEFAULT_STATE: BrandingState = {
  name: "",
  logoUrl: null,
  primaryColour: "#6366f1",
  secondaryColour: "#8b5cf6",
  backgroundColour: "#ffffff",
  fontFamily: "Inter",
  welcomeMessage: "",
  placeholderText: "Type a message…",
  bubbleStyle: "rounded",
  darkMode: false,
  replyDelay: 0,
  published: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function resizeToCanvas(file: File, maxPx = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")), "image/png");
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BrandingPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [branding, setBranding] = useState<BrandingState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadChatbot();
  }, [id]);

  async function loadChatbot() {
    try {
      const { data } = await apiClient.get(`/api/chatbots/${id}`);
      const b = data.data;
      setBranding({
        name: b.name ?? "",
        logoUrl: b.logo_url ?? null,
        primaryColour: b.primary_colour ?? "#6366f1",
        secondaryColour: b.secondary_colour ?? "#8b5cf6",
        backgroundColour: b.background_colour ?? "#ffffff",
        fontFamily: b.font_family ?? "Inter",
        welcomeMessage: b.welcome_message ?? "",
        placeholderText: b.placeholder_text ?? "Type a message…",
        bubbleStyle: (b.bubble_style as BubbleStyle) ?? "rounded",
        darkMode: b.dark_mode ?? false,
        replyDelay: b.reply_delay_seconds ?? 0,
        published: b.published ?? false,
      });
    } catch {
      // Chatbot not found — navigate back
      router.replace("/dashboard/chatbots");
    } finally {
      setLoading(false);
    }
  }

  const set = useCallback(<K extends keyof BrandingState>(key: K, value: BrandingState[K]) => {
    setBranding((prev) => ({ ...prev, [key]: value }));
  }, []);

  function applyPreset(name: string) {
    const preset = PRESETS[name];
    if (preset) setBranding((prev) => ({ ...prev, ...preset }));
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    try {
      const resized = await resizeToCanvas(file);
      const form = new FormData();
      form.append("file", resized, "logo.png");
      const { data } = await apiClient.post(`/api/chatbots/${id}/logo`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      set("logoUrl", data.data.logo_url);
    } catch {
      // Upload failed — leave existing logo
    } finally {
      setLogoUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave(publish?: boolean) {
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        primary_colour: branding.primaryColour,
        secondary_colour: branding.secondaryColour,
        background_colour: branding.backgroundColour,
        font_family: branding.fontFamily,
        welcome_message: branding.welcomeMessage || null,
        placeholder_text: branding.placeholderText,
        bubble_style: branding.bubbleStyle,
        dark_mode: branding.darkMode,
        reply_delay_seconds: branding.replyDelay,
      };
      if (publish !== undefined) payload.published = publish;
      await apiClient.put(`/api/chatbots/${id}`, payload);
      if (publish !== undefined) set("published", publish);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } catch {
      // Error feedback via toast in a future task
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* ── Settings panel ──────────────────────────────────────────────── */}
      <div className="flex w-[380px] shrink-0 flex-col border-r overflow-y-auto">
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{branding.name}</p>
            <p className="text-xs text-muted-foreground">Branding</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              disabled={saving}
              onClick={() => handleSave()}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedOk ? <Check className="h-3.5 w-3.5" /> : "Save"}
            </Button>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={saving}
              onClick={() => handleSave(!branding.published)}
            >
              {branding.published ? "Unpublish" : "Publish"}
            </Button>
          </div>
        </div>

        <div className="flex-1 space-y-6 px-4 py-5">
          {/* Theme presets */}
          <Section title="Theme Presets">
            <div className="grid grid-cols-2 gap-2">
              {Object.keys(PRESETS).map((name) => (
                <button
                  key={name}
                  onClick={() => applyPreset(name)}
                  className="rounded-lg border px-3 py-2 text-left text-xs font-medium transition-colors hover:bg-muted"
                  style={{ borderColor: (PRESETS[name].primaryColour as string) }}
                >
                  <span
                    className="mb-1 block h-2 w-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${PRESETS[name].primaryColour}, ${PRESETS[name].secondaryColour})` }}
                  />
                  {name}
                </button>
              ))}
            </div>
          </Section>

          <Separator />

          {/* Logo */}
          <Section title="Logo">
            <div className="flex items-center gap-3">
              {branding.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={branding.logoUrl}
                  alt="Logo"
                  className="h-12 w-12 rounded-lg object-contain border"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-muted text-muted-foreground text-xs">
                  Logo
                </div>
              )}
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" className="sr-only" onChange={handleLogoUpload} />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs"
                  disabled={logoUploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {logoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {logoUploading ? "Uploading…" : "Upload"}
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">PNG / JPEG / WebP — resized to 512 px</p>
              </div>
            </div>
          </Section>

          <Separator />

          {/* Colours */}
          <Section title="Colours">
            <div className="space-y-3">
              <ColourRow
                label="Primary"
                value={branding.primaryColour}
                onChange={(v) => set("primaryColour", v)}
              />
              <ColourRow
                label="Secondary"
                value={branding.secondaryColour}
                onChange={(v) => set("secondaryColour", v)}
              />
              <ColourRow
                label="Background"
                value={branding.backgroundColour}
                onChange={(v) => set("backgroundColour", v)}
              />
            </div>
          </Section>

          <Separator />

          {/* Typography */}
          <Section title="Typography">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Font Family</Label>
                <select
                  value={branding.fontFamily}
                  onChange={(e) => set("fontFamily", e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {FONT_OPTIONS.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Bubble Style</Label>
                <div className="flex gap-2">
                  {(["rounded", "square", "pill"] as BubbleStyle[]).map((style) => (
                    <button
                      key={style}
                      onClick={() => set("bubbleStyle", style)}
                      className={`flex-1 py-2 border text-xs font-medium capitalize transition-colors ${
                        branding.bubbleStyle === style
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      } ${style === "pill" ? "rounded-full" : style === "rounded" ? "rounded-lg" : "rounded-none"}`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Separator />

          {/* Content */}
          <Section title="Content">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Welcome Message</Label>
                <Input
                  value={branding.welcomeMessage}
                  onChange={(e) => set("welcomeMessage", e.target.value)}
                  placeholder="Hi! How can I help you today?"
                  maxLength={500}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1.5 block">Placeholder Text</Label>
                <Input
                  value={branding.placeholderText}
                  onChange={(e) => set("placeholderText", e.target.value)}
                  placeholder="Type a message…"
                  maxLength={200}
                  className="text-sm"
                />
              </div>
            </div>
          </Section>

          <Separator />

          {/* Appearance */}
          <Section title="Appearance">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Dark Mode</p>
                <p className="text-xs text-muted-foreground">Show widget with dark background</p>
              </div>
              <Toggle checked={branding.darkMode} onChange={(v) => set("darkMode", v)} />
            </div>

            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">
                  AI Reply Delay
                </Label>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {branding.replyDelay === 0 ? "Instant" : `${branding.replyDelay}s`}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={30}
                step={1}
                value={branding.replyDelay}
                onChange={(e) => set("replyDelay", Number(e.target.value))}
                className="w-full accent-primary"
              />
              <p className="text-xs text-muted-foreground">
                Show a typing indicator for this many seconds before the bot replies (0 = instant).
              </p>
            </div>
          </Section>
        </div>
      </div>

      {/* ── Preview panel ────────────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Preview toolbar */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <p className="text-sm font-medium">Live Preview</p>
          <div className="ml-auto flex gap-1">
            <Button
              size="icon"
              variant={previewMode === "desktop" ? "default" : "ghost"}
              className="h-8 w-8"
              onClick={() => setPreviewMode("desktop")}
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant={previewMode === "mobile" ? "default" : "ghost"}
              className="h-8 w-8"
              onClick={() => setPreviewMode("mobile")}
            >
              <Smartphone className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview area */}
        <div className="flex flex-1 items-center justify-center overflow-auto bg-muted/30 p-8">
          <ChatPreview branding={branding} mobile={previewMode === "mobile"} />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function ColourRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [text, setText] = useState(value);

  useEffect(() => {
    setText(value);
  }, [value]);

  function handleText(raw: string) {
    setText(raw);
    if (/^#[0-9A-Fa-f]{6}$/.test(raw)) onChange(raw);
  }

  return (
    <div className="flex items-center gap-2">
      <label className="w-24 shrink-0 text-xs text-muted-foreground">{label}</label>
      <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded border cursor-pointer">
        <input
          type="color"
          value={value}
          onChange={(e) => { onChange(e.target.value); setText(e.target.value); }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <div className="h-full w-full rounded" style={{ background: value }} />
      </div>
      <Input
        value={text}
        onChange={(e) => handleText(e.target.value)}
        maxLength={7}
        className="h-8 font-mono text-xs uppercase"
        placeholder="#000000"
      />
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
        checked ? "bg-primary" : "bg-input"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ── Chat preview ──────────────────────────────────────────────────────────────

const PREVIEW_MESSAGES = [
  { role: "assistant", text: "Hi! How can I help you today?" },
  { role: "user", text: "Can you tell me more about your services?" },
  { role: "assistant", text: "Of course! I'd be happy to help. We offer a wide range of AI-powered solutions tailored to your needs." },
];

function ChatPreview({ branding, mobile }: { branding: BrandingState; mobile: boolean }) {
  const bg = branding.darkMode ? "#18181b" : branding.backgroundColour;
  const textColor = branding.darkMode ? "#f4f4f5" : "#09090b";
  const mutedColor = branding.darkMode ? "#a1a1aa" : "#71717a";
  const inputBg = branding.darkMode ? "#27272a" : "#f4f4f5";
  const borderColor = branding.darkMode ? "#3f3f46" : "#e4e4e7";

  const bubbleRadius =
    branding.bubbleStyle === "pill" ? "9999px"
    : branding.bubbleStyle === "square" ? "4px"
    : "12px";

  const width = mobile ? 340 : 480;
  const height = mobile ? 580 : 520;

  return (
    <div
      className="flex flex-col overflow-hidden shadow-2xl"
      style={{
        width,
        height,
        background: bg,
        color: textColor,
        fontFamily: `'${branding.fontFamily}', sans-serif`,
        borderRadius: 16,
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3"
        style={{ background: branding.primaryColour }}
      >
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt="" className="h-7 w-7 rounded-full object-cover" />
        ) : (
          <div className="h-7 w-7 rounded-full bg-white/20" />
        )}
        <span className="text-sm font-semibold text-white truncate">{branding.name || "Chatbot"}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-white/70">
          <span className="h-1.5 w-1.5 rounded-full bg-green-300" />
          Online
        </span>
      </div>

      {/* Messages */}
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        {PREVIEW_MESSAGES.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[75%] px-3 py-2 text-sm leading-relaxed"
              style={{
                borderRadius: bubbleRadius,
                background: msg.role === "user" ? branding.primaryColour : inputBg,
                color: msg.role === "user" ? "#ffffff" : textColor,
              }}
            >
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 border-t"
        style={{ borderColor, background: bg }}
      >
        <div
          className="flex flex-1 items-center rounded-full px-3 py-1.5 text-xs"
          style={{ background: inputBg, color: mutedColor }}
        >
          {branding.placeholderText || "Type a message…"}
        </div>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-white text-xs"
          style={{ background: branding.primaryColour }}
        >
          ↑
        </div>
      </div>
    </div>
  );
}
