"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ExternalLink,
  Loader2,
  Palette,
  Code2,
  BookOpen,
  Radio,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";

interface ProviderMeta {
  label: string;
  models: string[];
}

interface KeyStatus {
  provider: string;
  configured: boolean;
}

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

  const [providerMeta, setProviderMeta] = useState<Record<string, ProviderMeta>>({});
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      apiClient.get(`/api/chatbots/${id}`),
      apiClient.get("/api/settings/model-keys/providers"),
      apiClient.get("/api/settings/model-keys"),
    ]).then(([botRes, metaRes, statusRes]) => {
      const b = botRes.data.data;
      setSettings({
        name: b.name ?? "",
        default_model: b.default_model ?? "claude-sonnet-4-6",
        fallback_model: b.fallback_model ?? "",
        allow_model_switch: b.allow_model_switch ?? false,
        system_prompt: b.system_prompt ?? "",
        published: b.published ?? false,
      });
      setProviderMeta(metaRes.data.data);
      const configured = new Set<string>(
        (statusRes.data.data as KeyStatus[])
          .filter((s) => s.configured)
          .map((s) => s.provider)
      );
      setConfiguredProviders(configured);
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
          { label: "Channels", icon: Radio, href: `/dashboard/chatbots/${id}/channels` },
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
          {configuredProviders.size === 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-3 py-2.5 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                No AI model keys configured yet.{" "}
                <Link href="/dashboard/settings/integrations" className="underline font-medium">
                  Set up your API keys in Integrations
                </Link>{" "}
                to activate this chatbot.
              </span>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Default Model</Label>
            <ModelSelect
              value={settings.default_model}
              onChange={(v) => set("default_model", v)}
              providerMeta={providerMeta}
              configuredProviders={configuredProviders}
              includeNone={false}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Fallback Model <span className="opacity-60">(optional)</span></Label>
            <ModelSelect
              value={settings.fallback_model}
              onChange={(v) => set("fallback_model", v)}
              providerMeta={providerMeta}
              configuredProviders={configuredProviders}
              includeNone
            />
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

function ModelSelect({
  value,
  onChange,
  providerMeta,
  configuredProviders,
  includeNone,
}: {
  value: string;
  onChange: (v: string) => void;
  providerMeta: Record<string, ProviderMeta>;
  configuredProviders: Set<string>;
  includeNone: boolean;
}) {
  const configured = Object.entries(providerMeta).filter(([p]) => configuredProviders.has(p));
  const unconfigured = Object.entries(providerMeta).filter(([p]) => !configuredProviders.has(p));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {includeNone && <option value="">None</option>}
      {configured.map(([provider, info]) => (
        <optgroup key={provider} label={info.label}>
          {info.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </optgroup>
      ))}
      {unconfigured.length > 0 && (
        <optgroup label="── No key configured ──" disabled>
          {unconfigured.map(([provider, info]) =>
            info.models.map((m) => (
              <option key={m} value={m} disabled>{info.label} — {m}</option>
            ))
          )}
        </optgroup>
      )}
    </select>
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
