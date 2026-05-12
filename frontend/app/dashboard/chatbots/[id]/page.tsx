"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Palette,
  Code2,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";

const MODELS = [
  { value: "claude-sonnet-4-6",  label: "Claude Sonnet 4.6",  badge: "Recommended" },
  { value: "claude-opus-4-7",    label: "Claude Opus 4.7",    badge: "Most capable" },
  { value: "claude-haiku-4-5",   label: "Claude Haiku 4.5",   badge: "Fastest" },
  { value: "gpt-4o",             label: "GPT-4o",             badge: "" },
  { value: "gpt-4o-mini",        label: "GPT-4o Mini",        badge: "Budget" },
  { value: "gemini-1.5-pro",     label: "Gemini 1.5 Pro",     badge: "" },
  { value: "gemini-1.5-flash",   label: "Gemini 1.5 Flash",   badge: "" },
  { value: "gemini-2.0-flash",   label: "Gemini 2.0 Flash",   badge: "" },
];

interface BotSettings {
  name: string;
  default_model: string;
  fallback_model: string;
  allow_model_switch: boolean;
  system_prompt: string;
  published: boolean;
}

export default function ChatbotSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [settings, setSettings] = useState<BotSettings>({
    name: "",
    default_model: "claude-sonnet-4-6",
    fallback_model: "",
    allow_model_switch: false,
    system_prompt: "",
    published: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    apiClient.get(`/api/chatbots/${id}`).then(({ data }) => {
      const b = data.data;
      setSettings({
        name: b.name ?? "",
        default_model: b.default_model ?? "claude-sonnet-4-6",
        fallback_model: b.fallback_model ?? "",
        allow_model_switch: b.allow_model_switch ?? false,
        system_prompt: b.system_prompt ?? "",
        published: b.published ?? false,
      });
    }).catch(() => router.replace("/dashboard/chatbots"))
      .finally(() => setLoading(false));
  }, [id]);

  function set<K extends keyof BotSettings>(k: K, v: BotSettings[K]) {
    setSettings((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSave(overrides?: Partial<BotSettings>) {
    setSaving(true);
    const payload = { ...settings, ...overrides };
    try {
      await apiClient.put(`/api/chatbots/${id}`, {
        name: payload.name,
        default_model: payload.default_model,
        fallback_model: payload.fallback_model || null,
        allow_model_switch: payload.allow_model_switch,
        system_prompt: payload.system_prompt || null,
        published: payload.published,
      });
      if (overrides) setSettings((prev) => ({ ...prev, ...overrides }));
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => router.push("/dashboard/chatbots")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{settings.name}</h1>
          <p className="text-xs text-muted-foreground">Settings</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => window.open(`/chat/${id}`, "_blank")}>
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            Preview
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={saving}
            onClick={() => handleSave({ published: !settings.published })}
          >
            {settings.published ? "Unpublish" : "Publish"}
          </Button>
          <Button size="sm" className="h-8 text-xs" disabled={saving} onClick={() => handleSave()}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedOk ? <Check className="h-3.5 w-3.5" /> : "Save"}
          </Button>
        </div>
      </div>

      {/* Quick links */}
      <div className="flex gap-2 flex-wrap">
        {[
          { label: "Branding", icon: Palette, href: `/dashboard/chatbots/${id}/branding` },
          { label: "Knowledge Base", icon: BookOpen, href: `/dashboard/chatbots/${id}/knowledge` },
          { label: "Embed Widget", icon: Code2, href: `/dashboard/chatbots/${id}/widget` },
        ].map(({ label, icon: Icon, href }) => (
          <Button key={href} size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={() => router.push(href)}>
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Button>
        ))}
      </div>

      <Separator />

      {/* General */}
      <Section title="General">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">Chatbot Name</Label>
          <Input
            value={settings.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="My Chatbot"
            maxLength={255}
          />
        </div>
      </Section>

      <Separator />

      {/* Model */}
      <Section title="AI Model">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Default Model</Label>
            <select
              value={settings.default_model}
              onChange={(e) => set("default_model", e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}{m.badge ? ` — ${m.badge}` : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Fallback Model <span className="opacity-60">(optional)</span></Label>
            <select
              value={settings.fallback_model}
              onChange={(e) => set("fallback_model", e.target.value)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">None</option>
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Allow Model Switch</p>
              <p className="text-xs text-muted-foreground">Let users choose the model in the chat window</p>
            </div>
            <Toggle checked={settings.allow_model_switch} onChange={(v) => set("allow_model_switch", v)} />
          </div>
        </div>
      </Section>

      <Separator />

      {/* System prompt */}
      <Section title="System Prompt">
        <div>
          <Label className="text-xs text-muted-foreground mb-1.5 block">
            Custom instructions for the AI. Leave blank for the default ChatCraft prompt.
          </Label>
          <textarea
            value={settings.system_prompt}
            onChange={(e) => set("system_prompt", e.target.value)}
            placeholder="You are a helpful assistant for Acme Corp. Always be polite and concise…"
            maxLength={8000}
            rows={8}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
          />
          <p className="mt-1 text-xs text-muted-foreground text-right">
            {settings.system_prompt.length} / 8000
          </p>
        </div>
      </Section>

      <Separator />

      {/* Danger zone */}
      <Section title="Status">
        <Card className={`flex items-center justify-between p-4 ${settings.published ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30" : ""}`}>
          <div>
            <p className="text-sm font-medium">{settings.published ? "Published" : "Draft"}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {settings.published
                ? "This chatbot is live and accessible to anyone with the link."
                : "Only you can access this chatbot. Publish it to make it public."}
            </p>
          </div>
          <Button
            size="sm"
            variant={settings.published ? "outline" : "default"}
            className="shrink-0"
            disabled={saving}
            onClick={() => handleSave({ published: !settings.published })}
          >
            {settings.published ? "Unpublish" : "Publish"}
          </Button>
        </Card>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
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
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-6" : "translate-x-1"}`} />
    </button>
  );
}
