"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Key,
  Loader2,
  Menu,
  Phone,
  Plus,
  RefreshCw,
  Trash2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface License {
  id: string;
  label: string;
  license_key: string;
  allowed_domain: string | null;
  status: "active" | "revoked";
  expires_at: string | null;
  created_at: string;
}

interface WidgetConfig {
  id: string;
  chatbot_id: string;
  allowed_domains: string | null;
  position: string;
  show_branding: boolean;
  embed_token: string;
  persistent_menu: MenuItem[] | null;
}

interface MenuItem {
  type: "url" | "phone" | "flow" | "postback";
  label: string;
  value: string;
}

const MENU_ITEM_TYPES = [
  { value: "url",      label: "URL Link",         icon: ExternalLink },
  { value: "phone",    label: "Phone Number",      icon: Phone },
  { value: "postback", label: "Postback Message",  icon: Zap },
  { value: "flow",     label: "Trigger Flow",      icon: Zap },
];

const POSITION_OPTIONS = [
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left",  label: "Bottom Left" },
  { value: "top-right",    label: "Top Right" },
  { value: "top-left",     label: "Top Left" },
];

const CDN_BASE = process.env.NEXT_PUBLIC_CDN_URL ?? "https://cdn.chatcraft.ai";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://api.chatcraft.ai";
const APP_BASE = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.chatcraft.ai";

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
  const [copied, setCopied] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const [deployMode, setDeployMode] = useState<"launcher" | "iframe" | "voice">("launcher");

  // Licenses
  const [licenses, setLicenses] = useState<License[]>([]);
  const [newLabel, setNewLabel] = useState("");
  const [newDomain, setNewDomain] = useState("");
  const [creatingLicense, setCreatingLicense] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  // Form state (mirrors config)
  const [domains, setDomains] = useState("");
  const [position, setPosition] = useState("bottom-right");
  const [showBranding, setShowBranding] = useState(true);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    try {
      const [botRes, widgetRes, licRes] = await Promise.all([
        apiClient.get(`/api/chatbots/${id}`),
        apiClient.get(`/api/widget/manage/${id}`),
        apiClient.get(`/api/widget/manage/${id}/licenses`),
      ]);
      setChatbotName(botRes.data.data.name);
      applyConfig(widgetRes.data.data);
      setLicenses(licRes.data.data);
    } catch {
      router.replace("/dashboard/chatbots");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateLicense() {
    setCreatingLicense(true);
    try {
      const { data } = await apiClient.post(`/api/widget/manage/${id}/licenses`, {
        label: newLabel.trim() || "Unnamed",
        allowed_domain: newDomain.trim() || null,
      });
      setLicenses((prev) => [data.data, ...prev]);
      setNewLabel("");
      setNewDomain("");
    } finally {
      setCreatingLicense(false);
    }
  }

  async function handleRevoke(licenseId: string) {
    if (!confirm("Revoke this license? The widget will stop working on that site immediately.")) return;
    setRevokingId(licenseId);
    try {
      await apiClient.delete(`/api/widget/manage/${id}/licenses/${licenseId}`);
      setLicenses((prev) => prev.map((l) => l.id === licenseId ? { ...l, status: "revoked" as const } : l));
    } finally {
      setRevokingId(null);
    }
  }

  async function copyKey(key: string) {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }

  function applyConfig(wc: WidgetConfig) {
    setConfig(wc);
    setDomains(wc.allowed_domains ?? "");
    setPosition(wc.position);
    setShowBranding(wc.show_branding);
    setMenuItems(wc.persistent_menu ?? []);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data } = await apiClient.put(`/api/widget/manage/${id}`, {
        allowed_domains: domains.trim() || null,
        position,
        show_branding: showBranding,
        persistent_menu: menuItems.length > 0 ? menuItems : null,
      });
      applyConfig(data.data);
    } finally {
      setSaving(false);
    }
  }

  function addMenuItem() {
    if (menuItems.length >= 5) return;
    setMenuItems((prev) => [...prev, { type: "url", label: "", value: "" }]);
  }

  function updateMenuItem(index: number, field: keyof MenuItem, value: string) {
    setMenuItems((prev) => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  function removeMenuItem(index: number) {
    setMenuItems((prev) => prev.filter((_, i) => i !== index));
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

  const baseAttrs = config
    ? `  src="${CDN_BASE}/widget.js"\n  data-chatbot-id="${id}"\n  data-widget-token="${config.embed_token}"\n  data-api-base="${API_BASE}"`
    : "";

  const snippet = config
    ? deployMode === "iframe"
      ? `<div data-chatcraft-iframe="${id}"></div>\n\n<script\n${baseAttrs}\n  data-type="iframe"\n></script>`
      : deployMode === "voice"
      ? `<script\n${baseAttrs}\n  data-type="voice"\n  data-position="${position}"\n></script>`
      : `<script\n${baseAttrs}\n  data-position="${position}"\n></script>`
    : "";

  const directLink = `${APP_BASE}/widgets/${id}`;

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setCopied("snippet");
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(directLink);
    setCopied("link");
    setTimeout(() => setCopied(null), 2000);
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

        {/* ── Deploy Mode ──────────────────────────────────────────────── */}
        <Section title="Deploy Mode" description="Choose how to embed your chatbot.">
          <div className="space-y-2">
            {(
              [
                {
                  value: "launcher",
                  label: "Floating Launcher",
                  desc: "A chat bubble fixed to the corner of the page. Best for most sites.",
                },
                {
                  value: "iframe",
                  label: "Inline Iframe",
                  desc: "Embed the chat panel directly inside a container element on your page.",
                },
                {
                  value: "voice",
                  label: "Voice Launcher",
                  desc: "A microphone bubble for voice conversations. Opens a chat panel on tap.",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDeployMode(opt.value)}
                className={`flex w-full items-start gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                  deployMode === opt.value
                    ? "border-primary bg-primary/5"
                    : "hover:bg-muted"
                }`}
              >
                <span
                  className={`mt-0.5 h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                    deployMode === opt.value ? "border-primary" : "border-muted-foreground"
                  }`}
                >
                  {deployMode === opt.value && (
                    <span className="h-2 w-2 rounded-full bg-primary" />
                  )}
                </span>
                <div>
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
          {deployMode === "iframe" && (
            <p className="text-xs text-muted-foreground bg-muted rounded-md px-3 py-2">
              Add <code className="font-mono text-[11px]">{`<div data-chatcraft-iframe="${id}"></div>`}</code> where you want the chat panel to appear. The snippet below will mount into it automatically.
            </p>
          )}
        </Section>

        <Separator />

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
              {copied === "snippet" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === "snippet" ? "Copied!" : "Copy"}
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

        {/* ── Persistent Menu ──────────────────────────────────────────── */}
        <Section
          title="Persistent Menu"
          description="Quick-access buttons shown at the bottom of the chat widget (max 5 items)."
        >
          <div className="space-y-2">
            {menuItems.map((item, index) => (
              <div key={index} className="flex items-center gap-2 rounded-lg border p-3">
                <Menu className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 grid grid-cols-3 gap-2 min-w-0">
                  <select
                    value={item.type}
                    onChange={(e) => updateMenuItem(index, "type", e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-xs"
                  >
                    {MENU_ITEM_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                  <input
                    value={item.label}
                    onChange={(e) => updateMenuItem(index, "label", e.target.value)}
                    placeholder="Label"
                    className="h-8 rounded-md border bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <input
                    value={item.value}
                    onChange={(e) => updateMenuItem(index, "value", e.target.value)}
                    placeholder={item.type === "url" ? "https://..." : item.type === "phone" ? "+1234567890" : "Message text or Flow ID"}
                    className="h-8 rounded-md border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
                <button
                  onClick={() => removeMenuItem(index)}
                  className="shrink-0 p-1 rounded hover:bg-destructive/10 text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {menuItems.length < 5 && (
              <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs" onClick={addMenuItem}>
                <Plus className="h-3.5 w-3.5" /> Add Menu Item
              </Button>
            )}
            {menuItems.length === 0 && (
              <p className="text-xs text-muted-foreground">No menu items. Add up to 5 quick-action buttons.</p>
            )}
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

        {/* ── License keys ─────────────────────────────────────────────── */}
        <Section
          title="License Keys"
          description="Generate per-client license keys so each site can embed your widget independently. Use data-license instead of data-widget-token in the snippet."
        >
          {/* Create form */}
          <div className="flex gap-2 flex-wrap">
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Client Name)"
              className="flex-1 min-w-36 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="Domain (optional, e.g. client.com)"
              className="flex-1 min-w-36 rounded-md border bg-background px-3 py-2 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button size="sm" className="h-9 gap-1.5 text-xs shrink-0" disabled={creatingLicense} onClick={handleCreateLicense}>
              {creatingLicense ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Plus className="h-3.5 w-3.5" />Generate</>}
            </Button>
          </div>

          {/* List */}
          {licenses.length > 0 ? (
            <div className="mt-3 space-y-2">
              {licenses.map((lic) => (
                <div key={lic.id} className={`flex items-center gap-2 rounded-lg border p-3 ${lic.status === "revoked" ? "opacity-50" : ""}`}>
                  <Key className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{lic.label || "Unnamed"}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate">{lic.license_key}</p>
                    {lic.allowed_domain && (
                      <p className="text-[10px] text-muted-foreground">Domain: {lic.allowed_domain}</p>
                    )}
                  </div>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${lic.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    {lic.status}
                  </span>
                  <button
                    className="shrink-0 p-1 rounded hover:bg-muted text-muted-foreground"
                    title="Copy key"
                    onClick={() => copyKey(lic.license_key)}
                  >
                    {copiedKey === lic.license_key ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  {lic.status === "active" && (
                    <button
                      className="shrink-0 p-1 rounded hover:bg-destructive/10 text-destructive"
                      title="Revoke"
                      disabled={revokingId === lic.id}
                      onClick={() => handleRevoke(lic.id)}
                    >
                      {revokingId === lic.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground mt-2">No license keys yet. Generate one above to give a client embed access.</p>
          )}
        </Section>

        <Separator />

        {/* ── Direct Link ──────────────────────────────────────────────── */}
        <Section
          title="Direct Link"
          description="Share this URL to let anyone chat with your bot directly — no embed needed. Works in any browser."
        >
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={directLink}
              className="font-mono text-xs text-muted-foreground"
            />
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 gap-1.5 text-xs"
              onClick={copyLink}
            >
              {copied === "link" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied === "link" ? "Copied!" : "Copy"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 shrink-0 text-xs"
              onClick={() => window.open(directLink, "_blank")}
            >
              Open
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
