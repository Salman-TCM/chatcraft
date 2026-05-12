"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface WidgetConfig {
  id: string;
  chatbot_id: string;
  allowed_domains: string | null;
  position: string;
  show_branding: boolean;
  embed_token: string;
}

const POSITION_OPTIONS = [
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left",  label: "Bottom Left" },
  { value: "top-right",    label: "Top Right" },
  { value: "top-left",     label: "Top Left" },
];

const CDN_BASE = process.env.NEXT_PUBLIC_CDN_URL ?? "https://cdn.chatcraft.ai";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.chatcraft.ai";

// ── Guides ────────────────────────────────────────────────────────────────────

const GUIDES: { platform: string; steps: string[] }[] = [
  {
    platform: "WordPress",
    steps: [
      'In your WordPress admin go to Appearance → Theme Editor → footer.php (or use a plugin like "Insert Headers and Footers").',
      "Paste the snippet just before the closing </body> tag.",
      "Click Save File.",
    ],
  },
  {
    platform: "Shopify",
    steps: [
      "In your Shopify admin go to Online Store → Themes → Edit code.",
      "Open layout/theme.liquid.",
      "Paste the snippet just before </body>.",
      "Click Save.",
    ],
  },
  {
    platform: "Squarespace",
    steps: [
      "In your Squarespace admin go to Settings → Advanced → Code Injection.",
      "Paste the snippet in the Footer field.",
      "Click Save.",
    ],
  },
  {
    platform: "Wix",
    steps: [
      "In the Wix Editor click Settings → Custom Code → + Add Custom Code.",
      "Paste the snippet, set Load Order to Body — end, apply to All Pages.",
      "Publish your site.",
    ],
  },
  {
    platform: "Webflow",
    steps: [
      "In the Webflow Designer open Project Settings → Custom Code.",
      "Paste the snippet in the Footer Code field.",
      "Publish your site.",
    ],
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WidgetPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [config, setConfig] = useState<WidgetConfig | null>(null);
  const [chatbotName, setChatbotName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(null);

  // Form state (mirrors config)
  const [domains, setDomains] = useState("");
  const [position, setPosition] = useState("bottom-right");
  const [showBranding, setShowBranding] = useState(true);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [botRes, widgetRes] = await Promise.all([
        apiClient.get(`/api/chatbots/${id}`),
        apiClient.get(`/api/widget/manage/${id}`),
      ]);
      setChatbotName(botRes.data.data.name);
      applyConfig(widgetRes.data.data);
    } catch {
      router.replace("/dashboard/chatbots");
    } finally {
      setLoading(false);
    }
  }

  function applyConfig(wc: WidgetConfig) {
    setConfig(wc);
    setDomains(wc.allowed_domains ?? "");
    setPosition(wc.position);
    setShowBranding(wc.show_branding);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data } = await apiClient.put(`/api/widget/manage/${id}`, {
        allowed_domains: domains.trim() || null,
        position,
        show_branding: showBranding,
      });
      applyConfig(data.data);
    } finally {
      setSaving(false);
    }
  }

  async function handleRotate() {
    if (!confirm("Rotating the token will break any existing embeds. Continue?")) return;
    setRotating(true);
    try {
      const { data } = await apiClient.post(`/api/widget/manage/${id}/rotate-token`);
      setConfig((prev) => prev ? { ...prev, embed_token: data.data.embed_token } : prev);
    } finally {
      setRotating(false);
    }
  }

  const snippet = config
    ? `<script\n  src="${CDN_BASE}/widget.js"\n  data-chatbot-id="${id}"\n  data-widget-token="${config.embed_token}"\n  data-position="${position}"\n  data-api-base="${API_BASE}"\n></script>`
    : "";

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{chatbotName}</p>
          <p className="text-xs text-muted-foreground">Embed Widget</p>
        </div>
        <Button size="sm" className="h-8 text-xs" disabled={saving} onClick={handleSave}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
        </Button>
      </div>

      <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">

        {/* ── Snippet ─────────────────────────────────────────────────── */}
        <Section title="Embed Snippet" description="Paste this before the </body> tag on any page.">
          <div className="relative">
            <pre className="overflow-x-auto rounded-lg border bg-muted p-4 text-xs leading-relaxed whitespace-pre-wrap break-all">
              {snippet}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="absolute right-2 top-2 h-7 gap-1.5 text-xs"
              onClick={copySnippet}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </Section>

        <Separator />

        {/* ── Settings ────────────────────────────────────────────────── */}
        <Section title="Widget Settings">
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Position
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {POSITION_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setPosition(opt.value)}
                    className={`rounded-lg border px-3 py-2 text-sm text-left transition-colors ${
                      position === opt.value
                        ? "border-primary bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Show Branding</p>
                <p className="text-xs text-muted-foreground">Display "Powered by ChatCraft AI"</p>
              </div>
              <Toggle checked={showBranding} onChange={setShowBranding} />
            </div>
          </div>
        </Section>

        <Separator />

        {/* ── Domain whitelist ─────────────────────────────────────────── */}
        <Section
          title="Domain Whitelist"
          description="Comma-separated hostnames that are allowed to embed this widget. Leave blank to allow all domains. Use * to explicitly allow all."
        >
          <Input
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="example.com, app.example.com"
            className="font-mono text-sm"
          />
          {domains && (
            <p className="mt-2 text-xs text-muted-foreground">
              Allowed: {domains.split(",").filter(Boolean).map((d) => d.trim()).join(" · ")}
            </p>
          )}
        </Section>

        <Separator />

        {/* ── Embed token ──────────────────────────────────────────────── */}
        <Section
          title="Embed Token"
          description="This token authenticates your widget. Rotate it if you suspect it has been compromised — existing embeds using the old token will stop working."
        >
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={config?.embed_token ?? ""}
              className="font-mono text-xs text-muted-foreground"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-1.5 text-xs"
              disabled={rotating}
              onClick={handleRotate}
            >
              {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Rotate
            </Button>
          </div>
        </Section>

        <Separator />

        {/* ── Integration guides ───────────────────────────────────────── */}
        <Section title="Integration Guides">
          <div className="space-y-2">
            {GUIDES.map((guide) => (
              <div key={guide.platform} className="rounded-lg border overflow-hidden">
                <button
                  className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted transition-colors"
                  onClick={() =>
                    setOpenGuide(openGuide === guide.platform ? null : guide.platform)
                  }
                >
                  {guide.platform}
                  {openGuide === guide.platform ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                {openGuide === guide.platform && (
                  <div className="border-t bg-muted/30 px-4 py-3">
                    <ol className="space-y-2 text-sm text-muted-foreground list-decimal list-inside">
                      {guide.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
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
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
