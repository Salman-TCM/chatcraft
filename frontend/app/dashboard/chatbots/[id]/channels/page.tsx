"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Shield,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Integration {
  id: string;
  channel: string;
  is_active: boolean;
  config: Record<string, string>;
  webhook_secret: string;
}

// ── Channel definitions ───────────────────────────────────────────────────────

interface ChannelDef {
  key: string;
  label: string;
  icon: string;
  color: string;
  description: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean }[];
  webhookNote?: string;
  setupUrl?: string;
}

const CHANNELS: ChannelDef[] = [
  {
    key: "telegram",
    label: "Telegram",
    icon: "✈️",
    color: "bg-sky-50 border-sky-200",
    description: "Connect a Telegram bot to handle messages via Bot API.",
    fields: [
      { key: "bot_token", label: "Bot Token", placeholder: "1234567890:ABCDef...", secret: true },
    ],
    webhookNote: "After saving, click 'Register Webhook' to activate the bot.",
    setupUrl: "https://core.telegram.org/bots#botfather",
  },
  {
    key: "whatsapp",
    label: "WhatsApp",
    icon: "💬",
    color: "bg-green-50 border-green-200",
    description: "Connect via WhatsApp Business Cloud API (Meta).",
    fields: [
      { key: "phone_number_id", label: "Phone Number ID", placeholder: "114890000000000" },
      { key: "access_token", label: "Access Token", placeholder: "EAAGm...", secret: true },
      { key: "verify_token", label: "Webhook Verify Token", placeholder: "my_verify_token_123" },
    ],
    setupUrl: "https://developers.facebook.com/docs/whatsapp/cloud-api",
  },
  {
    key: "facebook",
    label: "Facebook Messenger",
    icon: "📘",
    color: "bg-blue-50 border-blue-200",
    description: "Connect a Facebook Page to receive and reply to Messenger messages.",
    fields: [
      { key: "page_access_token", label: "Page Access Token", placeholder: "EAAGm...", secret: true },
      { key: "verify_token", label: "Webhook Verify Token", placeholder: "my_verify_token_123" },
      { key: "app_secret", label: "App Secret (optional)", placeholder: "abc123def456", secret: true },
    ],
    setupUrl: "https://developers.facebook.com/docs/messenger-platform",
  },
  {
    key: "instagram",
    label: "Instagram DM",
    icon: "📸",
    color: "bg-pink-50 border-pink-200",
    description: "Receive and reply to Instagram Direct Messages via the Instagram Graph API.",
    fields: [
      { key: "page_access_token", label: "Page Access Token", placeholder: "EAAGm...", secret: true },
      { key: "verify_token", label: "Webhook Verify Token", placeholder: "my_verify_token_123" },
    ],
    setupUrl: "https://developers.facebook.com/docs/instagram-api/guides/messaging",
  },
  {
    key: "sms",
    label: "SMS (Twilio)",
    icon: "📱",
    color: "bg-red-50 border-red-200",
    description: "Send and receive SMS messages via your Twilio account.",
    fields: [
      { key: "account_sid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "auth_token", label: "Auth Token", placeholder: "your_auth_token", secret: true },
      { key: "from_number", label: "From Number", placeholder: "+15551234567" },
    ],
    setupUrl: "https://console.twilio.com/",
  },
  {
    key: "phone",
    label: "Phone Calls (Twilio)",
    icon: "☎️",
    color: "bg-orange-50 border-orange-200",
    description: "Handle inbound PSTN calls — AI answers, speaks, and routes to your team.",
    fields: [
      { key: "account_sid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" },
      { key: "auth_token", label: "Auth Token", placeholder: "your_auth_token", secret: true },
      { key: "from_number", label: "Twilio Phone Number", placeholder: "+15551234567" },
    ],
    webhookNote: "Set your Twilio phone number's Voice webhook to the URL below (HTTP POST).",
    setupUrl: "https://console.twilio.com/",
  },
  {
    key: "discord",
    label: "Discord",
    icon: "🎮",
    color: "bg-indigo-50 border-indigo-200",
    description: "Connect a Discord bot to reply to messages in your server channels.",
    fields: [
      { key: "bot_token", label: "Bot Token", placeholder: "MTxxxxxxxxxxxxxxxxxxxxxxxx.xxxxxx.xxxxx", secret: true },
      { key: "application_id", label: "Application ID", placeholder: "1234567890123456789" },
    ],
    webhookNote: "Set your Discord bot's Interactions Endpoint URL to the webhook URL below.",
    setupUrl: "https://discord.com/developers/applications",
  },
  {
    key: "twitter",
    label: "X (Twitter)",
    icon: "🐦",
    color: "bg-slate-50 border-slate-200",
    description: "Auto-reply to @mentions using AI. Requires a Twitter Developer App with Account Activity API access.",
    fields: [
      { key: "bearer_token", label: "Bearer Token", placeholder: "AAAAAAAAAA...", secret: true },
      { key: "api_key", label: "API Key (Consumer Key)", placeholder: "xvz1evFS4wEEPTGEFPHBog" },
      { key: "api_secret", label: "API Secret (Consumer Secret)", placeholder: "L8qq9PZyRg6ieKGEKhZolGC0...", secret: true },
      { key: "access_token", label: "Access Token", placeholder: "756201191646691328-..." },
      { key: "access_secret", label: "Access Token Secret", placeholder: "jandy...", secret: true },
      { key: "twitter_user_id", label: "Your Twitter User ID", placeholder: "756201191646691328" },
    ],
    webhookNote: "Register the webhook URL below in your Twitter Developer Portal under Account Activity API.",
    setupUrl: "https://developer.twitter.com/en/docs/twitter-api/enterprise/account-activity-api",
  },
  {
    key: "tiktok",
    label: "TikTok DM",
    icon: "🎵",
    color: "bg-pink-50 border-pink-200",
    description: "Receive and reply to TikTok Direct Messages via TikTok Business API.",
    fields: [
      { key: "access_token", label: "Access Token", placeholder: "act.xxxxxxxxx...", secret: true },
      { key: "client_key", label: "Client Key (App ID)", placeholder: "aw1234567890" },
      { key: "client_secret", label: "Client Secret", placeholder: "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx", secret: true },
      { key: "open_id", label: "Your TikTok Open ID", placeholder: "_000abc1234..." },
    ],
    webhookNote: "Configure the webhook URL below in your TikTok Developer app settings under 'Event Subscriptions'.",
    setupUrl: "https://developers.tiktok.com/products/direct-messages",
  },
];

// ── Main component ────────────────────────────────────────────────────────────

export default function ChannelsPage() {
  const { id: chatbotId } = useParams<{ id: string }>();
  const router = useRouter();

  const [integrations, setIntegrations] = useState<Record<string, Integration>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [settingWebhook, setSettingWebhook] = useState(false);
  const [forms, setForms] = useState<Record<string, Record<string, string>>>({});
  const [activeToggles, setActiveToggles] = useState<Record<string, boolean>>({});

  const baseWebhookUrl = typeof window !== "undefined"
    ? `${window.location.origin.replace(":3000", ":8000")}/webhooks`
    : "/webhooks";

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/api/v1/chatbots/${chatbotId}/integrations`);
      const map: Record<string, Integration> = {};
      const formInit: Record<string, Record<string, string>> = {};
      const toggleInit: Record<string, boolean> = {};
      for (const item of data.data as Integration[]) {
        map[item.channel] = item;
        formInit[item.channel] = { ...item.config };
        toggleInit[item.channel] = item.is_active;
      }
      setIntegrations(map);
      setForms(formInit);
      setActiveToggles(toggleInit);
    } finally {
      setLoading(false);
    }
  }, [chatbotId]);

  useEffect(() => { load(); }, [load]);

  function setField(channel: string, key: string, value: string) {
    setForms(prev => ({ ...prev, [channel]: { ...(prev[channel] ?? {}), [key]: value } }));
  }

  async function save(channel: string) {
    setSaving(channel);
    try {
      const { data } = await apiClient.put(
        `/api/v1/chatbots/${chatbotId}/integrations/${channel}`,
        { config: forms[channel] ?? {}, is_active: activeToggles[channel] ?? true }
      );
      setIntegrations(prev => ({ ...prev, [channel]: data.data }));
    } finally {
      setSaving(null);
    }
  }

  async function remove(channel: string) {
    if (!confirm(`Remove ${channel} integration? This cannot be undone.`)) return;
    await apiClient.delete(`/api/v1/chatbots/${chatbotId}/integrations/${channel}`);
    setIntegrations(prev => { const n = { ...prev }; delete n[channel]; return n; });
    setForms(prev => { const n = { ...prev }; delete n[channel]; return n; });
    setActiveToggles(prev => { const n = { ...prev }; delete n[channel]; return n; });
  }

  async function test(channel: string) {
    setTesting(channel);
    setTestResult(prev => ({ ...prev, [channel]: { ok: false, msg: "" } }));
    try {
      const { data } = await apiClient.post(
        `/api/v1/chatbots/${chatbotId}/integrations/${channel}/test`
      );
      const info = data.data;
      const msg = channel === "telegram"
        ? `@${info.username} (${info.first_name})`
        : channel === "whatsapp"
        ? `${info.verified_name} · ${info.display_phone_number}`
        : channel === "facebook" || channel === "instagram"
        ? `${info.page_name} (${info.page_id})`
        : channel === "discord"
        ? `@${info.username}#${info.discriminator} (${info.bot_id})`
        : channel === "twitter"
        ? `@${info.username} (${info.user_id})`
        : channel === "tiktok"
        ? `${info.display_name} (${info.open_id})`
        : `${info.friendly_name} · ${info.status}`;
      setTestResult(prev => ({ ...prev, [channel]: { ok: true, msg } }));
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? "Connection failed";
      setTestResult(prev => ({ ...prev, [channel]: { ok: false, msg } }));
    } finally {
      setTesting(null);
    }
  }

  async function registerWebhook() {
    setSettingWebhook(true);
    try {
      await apiClient.post(`/api/v1/chatbots/${chatbotId}/integrations/telegram/set-webhook`);
      setTestResult(prev => ({ ...prev, telegram: { ok: true, msg: "Webhook registered!" } }));
    } catch (e: any) {
      setTestResult(prev => ({
        ...prev,
        telegram: { ok: false, msg: e?.response?.data?.detail ?? "Failed" },
      }));
    } finally {
      setSettingWebhook(false);
    }
  }

  function copyWebhookUrl(channel: string) {
    const path = channel === "phone" ? "voice" : channel;
    const url = `${baseWebhookUrl}/${path}/${chatbotId}`;
    navigator.clipboard.writeText(url);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Channel Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Connect messaging channels to route conversations through your chatbot.
          </p>
        </div>
      </div>

      {/* Channel cards */}
      {CHANNELS.map((ch) => {
        const integration = integrations[ch.key];
        const isConnected = !!integration;
        const isExpanded = expanded === ch.key;
        const form = forms[ch.key] ?? {};
        const isActive = activeToggles[ch.key] ?? true;
        const result = testResult[ch.key];
        const webhookPath = ch.key === "phone" ? "voice" : ch.key;
        const webhookUrl = `${baseWebhookUrl}/${webhookPath}/${chatbotId}`;

        return (
          <Card key={ch.key} className={`overflow-hidden border ${isConnected ? ch.color : ""}`}>
            {/* Card header */}
            <div
              className="flex cursor-pointer items-center justify-between p-4"
              onClick={() => setExpanded(isExpanded ? null : ch.key)}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{ch.icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{ch.label}</span>
                    {isConnected ? (
                      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                        <Wifi className="h-2.5 w-2.5" />
                        {isActive ? "Active" : "Inactive"}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <WifiOff className="h-2.5 w-2.5" />
                        Not connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{ch.description}</p>
                </div>
              </div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>

            {/* Expanded config form */}
            {isExpanded && (
              <div className="border-t bg-background px-4 pb-4 pt-3 space-y-4">
                {/* Credential fields */}
                <div className="grid gap-3">
                  {ch.fields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        type={f.secret ? "password" : "text"}
                        placeholder={f.placeholder}
                        value={form[f.key] ?? ""}
                        onChange={(e) => setField(ch.key, f.key, e.target.value)}
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                  ))}
                </div>

                {/* Active toggle */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveToggles(prev => ({ ...prev, [ch.key]: !prev[ch.key] }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      isActive ? "bg-primary" : "bg-muted"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
                        isActive ? "translate-x-4.5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {isActive ? "Active — bot will respond" : "Inactive — messages saved but no AI reply"}
                  </span>
                </div>

                {/* Webhook URL */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Webhook URL</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value={webhookUrl}
                      className="h-8 text-xs font-mono text-muted-foreground"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => copyWebhookUrl(ch.key)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {ch.webhookNote && (
                    <p className="text-[11px] text-muted-foreground">{ch.webhookNote}</p>
                  )}
                </div>

                {/* Test result */}
                {result && result.msg && (
                  <div
                    className={`flex items-center gap-2 rounded-md px-3 py-2 text-xs ${
                      result.ok
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-700"
                    }`}
                  >
                    {result.ok ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    {result.msg}
                  </div>
                )}

                {/* External setup link */}
                {ch.setupUrl && (
                  <p className="text-[11px] text-muted-foreground">
                    Need credentials?{" "}
                    <a
                      href={ch.setupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Open {ch.label} developer console ↗
                    </a>
                  </p>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => save(ch.key)}
                    disabled={saving === ch.key}
                  >
                    {saving === ch.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    Save
                  </Button>

                  {isConnected && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => test(ch.key)}
                        disabled={testing === ch.key}
                      >
                        {testing === ch.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Test Connection
                      </Button>

                      {ch.key === "telegram" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={registerWebhook}
                          disabled={settingWebhook}
                        >
                          {settingWebhook ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wifi className="h-3.5 w-3.5" />}
                          Register Webhook
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-destructive hover:text-destructive"
                        onClick={() => remove(ch.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      {/* A2A Protocol */}
      <A2ASection chatbotId={chatbotId} />

      {/* Info box */}
      <Card className="bg-muted/40 p-4">
        <p className="text-xs text-muted-foreground leading-relaxed">
          <strong>How it works:</strong> When a message arrives on any connected channel, ChatCraft
          creates a contact and conversation, runs the message through your chatbot's AI (with its
          knowledge base), and sends the reply back — all automatically. You can monitor and take
          over conversations from the <strong>Inbox</strong>.
        </p>
      </Card>
    </div>
  );
}

function A2ASection({ chatbotId }: { chatbotId: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [authRequired, setAuthRequired] = useState(false);
  const [tokens, setTokens] = useState<string[]>([]);
  const [newToken, setNewToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  const agentCardUrl = `${apiBase}/a2a/widgets/${chatbotId}/agent.json`;
  const messageUrl = `${apiBase}/a2a/widgets/${chatbotId}`;

  useEffect(() => {
    apiClient.get(`/api/chatbots/${chatbotId}`).then(({ data }) => {
      const bot = data.data;
      setAuthRequired(bot.a2a_auth_required ?? false);
      setTokens(bot.a2a_allowed_tokens ?? []);
      setLoaded(true);
    }).catch(() => setLoaded(true));
  }, [chatbotId]);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  async function quickTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const resp = await fetch(messageUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "message/send",
          params: {
            message: {
              role: "user",
              parts: [{ type: "text", text: "Hello! Can you introduce yourself briefly?" }],
            },
          },
        }),
      });
      const json = await resp.json();
      if (json.error) {
        setTestResult({ ok: false, msg: json.error.message });
      } else {
        const reply = json.result?.artifacts?.[0]?.parts?.[0]?.text ?? "OK";
        setTestResult({ ok: true, msg: reply.slice(0, 200) });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  }

  async function saveAuth() {
    setSaving(true);
    try {
      await apiClient.put(`/api/chatbots/${chatbotId}`, {
        a2a_auth_required: authRequired,
        a2a_allowed_tokens: tokens.length > 0 ? tokens : null,
      });
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  function addToken() {
    const t = newToken.trim();
    if (t && !tokens.includes(t)) {
      setTokens(prev => [...prev, t]);
    }
    setNewToken("");
  }

  if (!loaded) return null;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Shield className="h-4 w-4 text-indigo-500" />
        <div>
          <h3 className="font-semibold text-sm">Google A2A Protocol</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Allow other AI agents to discover and communicate with this chatbot using the
            Agent-to-Agent (A2A) open standard.
          </p>
        </div>
      </div>

      {/* Endpoint URLs */}
      <div className="space-y-2">
        <div>
          <Label className="text-xs text-muted-foreground">Agent Card (discovery)</Label>
          <div className="flex gap-2 mt-1">
            <Input value={agentCardUrl} readOnly className="text-xs font-mono h-8" />
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => copy(agentCardUrl, "card")}>
              {copied === "card" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Message endpoint (JSON-RPC 2.0)</Label>
          <div className="flex gap-2 mt-1">
            <Input value={messageUrl} readOnly className="text-xs font-mono h-8" />
            <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => copy(messageUrl, "rpc")}>
              {copied === "rpc" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Quick test */}
      <div className="space-y-2">
        <Button
          size="sm"
          variant="outline"
          className="h-8 text-xs"
          onClick={quickTest}
          disabled={testing}
        >
          {testing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Quick Test
        </Button>
        {testResult && (
          <div className={`flex items-start gap-2 rounded-md px-3 py-2 text-xs ${testResult.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
            {testResult.ok ? <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <X className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
            <span className="break-all">{testResult.msg}</span>
          </div>
        )}
      </div>

      {/* Auth settings */}
      <div className="border-t pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAuthRequired(v => !v)}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${authRequired ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${authRequired ? "translate-x-4.5" : "translate-x-0.5"}`} />
          </button>
          <span className="text-xs font-medium">Require Bearer token authentication</span>
        </div>
        {authRequired && (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Allowed tokens (callers must present one of these)</Label>
            <div className="space-y-1">
              {tokens.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={t} readOnly className="h-7 text-xs font-mono flex-1" />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setTokens(prev => prev.filter((_, j) => j !== i))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Paste token or API key…"
                value={newToken}
                onChange={e => setNewToken(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addToken()}
                className="h-7 text-xs font-mono flex-1"
              />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addToken}>
                <Plus className="h-3 w-3" />
                Add
              </Button>
            </div>
          </div>
        )}
        <Button size="sm" className="h-8 text-xs" onClick={saveAuth} disabled={saving}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saveOk ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Check className="h-3.5 w-3.5" />}
          {saveOk ? "Saved!" : "Save Auth Settings"}
        </Button>
      </div>
    </Card>
  );
}
