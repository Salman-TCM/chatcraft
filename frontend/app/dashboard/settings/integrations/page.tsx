"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, Loader2, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";

interface ProviderMeta {
  label: string;
  models: string[];
  key_hint: string;
  docs_url: string;
}

interface KeyStatus {
  provider: string;
  configured: boolean;
  label: string;
}

const PROVIDER_ICONS: Record<string, string> = {
  anthropic: "🟣",
  openai: "🟢",
  google: "🔵",
  deepseek: "🔷",
  groq: "⚡",
  perplexity: "🔮",
  xai: "✖️",
};

export default function IntegrationsPage() {
  const [meta, setMeta] = useState<Record<string, ProviderMeta>>({});
  const [statuses, setStatuses] = useState<KeyStatus[]>([]);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});
  const [removing, setRemoving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const metaRes = await apiClient.get("/api/settings/model-keys/providers");
    setMeta(metaRes.data.data);
    try {
      const statusRes = await apiClient.get("/api/settings/model-keys");
      setStatuses(statusRes.data.data);
    } catch {
      // not authenticated yet — show cards with no configured status
    }
  }

  async function handleSave(provider: string) {
    const key = inputs[provider]?.trim();
    if (!key) return;
    setSaving((p) => ({ ...p, [provider]: true }));
    try {
      await apiClient.post("/api/settings/model-keys", { provider, api_key: key });
      setInputs((p) => ({ ...p, [provider]: "" }));
      await load();
    } finally {
      setSaving((p) => ({ ...p, [provider]: false }));
    }
  }

  async function handleTest(provider: string) {
    setTesting((p) => ({ ...p, [provider]: true }));
    setTestResult((p) => ({ ...p, [provider]: undefined! }));
    try {
      const res = await apiClient.post(`/api/settings/model-keys/${provider}/test`);
      if (res.data.success && res.data.data?.valid) {
        setTestResult((p) => ({ ...p, [provider]: { ok: true, msg: "Connection successful" } }));
      } else {
        setTestResult((p) => ({ ...p, [provider]: { ok: false, msg: res.data.error ?? "Invalid key" } }));
      }
    } catch (e: any) {
      setTestResult((p) => ({
        ...p,
        [provider]: { ok: false, msg: e?.response?.data?.error ?? "Test failed" },
      }));
    } finally {
      setTesting((p) => ({ ...p, [provider]: false }));
    }
  }

  async function handleRemove(provider: string) {
    setRemoving((p) => ({ ...p, [provider]: true }));
    try {
      await apiClient.delete(`/api/settings/model-keys/${provider}`);
      await load();
    } finally {
      setRemoving((p) => ({ ...p, [provider]: false }));
    }
  }

  const statusMap = Object.fromEntries(statuses.map((s) => [s.provider, s.configured]));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">AI Model Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your own API keys. You pay the provider directly — ChatCraft doesn't charge per message.
        </p>
      </div>

      {Object.entries(meta).map(([provider, info]) => {
        const isConfigured = statusMap[provider] ?? false;
        const isSaving = saving[provider];
        const isTesting = testing[provider];
        const isRemoving = removing[provider];
        const result = testResult[provider];

        return (
          <Card key={provider} className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">{PROVIDER_ICONS[provider] ?? "🤖"}</span>
                <div>
                  <p className="text-sm font-semibold">{info.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {info.models.slice(0, 3).join(", ")}{info.models.length > 3 ? ` +${info.models.length - 3} more` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isConfigured ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                    <Check className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Not connected
                  </Badge>
                )}
                <a
                  href={info.docs_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Key input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={visible[provider] ? "text" : "password"}
                  placeholder={isConfigured ? "••••••••••••• (saved)" : info.key_hint}
                  value={inputs[provider] ?? ""}
                  onChange={(e) => setInputs((p) => ({ ...p, [provider]: e.target.value }))}
                  className="pr-9 text-sm font-mono"
                  onKeyDown={(e) => e.key === "Enter" && handleSave(provider)}
                />
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setVisible((p) => ({ ...p, [provider]: !p[provider] }))}
                  type="button"
                >
                  {visible[provider] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button
                size="sm"
                disabled={!inputs[provider]?.trim() || isSaving}
                onClick={() => handleSave(provider)}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>

            {/* Actions for configured keys */}
            {isConfigured && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1"
                  disabled={isTesting}
                  onClick={() => handleTest(provider)}
                >
                  {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test connection"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                  disabled={isRemoving}
                  onClick={() => handleRemove(provider)}
                >
                  {isRemoving ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Trash2 className="h-3 w-3" /> Remove</>}
                </Button>

                {result && (
                  <span className={`text-xs flex items-center gap-1 ${result.ok ? "text-green-600" : "text-destructive"}`}>
                    {result.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                    {result.msg}
                  </span>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
