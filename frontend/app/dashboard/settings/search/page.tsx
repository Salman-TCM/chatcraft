"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Eye, EyeOff, Loader2, Trash2, X } from "lucide-react";
import { SiBrave, SiDuckduckgo } from "react-icons/si";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";

interface SearchProvider {
  provider: string;
  label: string;
  description: string;
  free_tier: string;
  key_hint: string;
  docs_url: string;
  configured: boolean;
}

type SearchIconDef =
  | { kind: "si"; Icon: React.ComponentType<{ className?: string }>; bg: string; fg: string }
  | { kind: "letter"; letter: string; bg: string; fg: string };

const SEARCH_ICON_MAP: Record<string, SearchIconDef> = {
  tavily:       { kind: "letter", letter: "T",  bg: "#0073E6", fg: "#fff" },
  serper:       { kind: "letter", letter: "S",  bg: "#E63946", fg: "#fff" },
  bing:         { kind: "letter", letter: "B",           bg: "#0078D4", fg: "#fff" },
  brave_search: { kind: "si",     Icon: SiBrave,         bg: "#FF5000", fg: "#fff" },
  serpapi:      { kind: "letter", letter: "S",  bg: "#3DDC84", fg: "#000" },
  you:          { kind: "letter", letter: "Y",  bg: "#6E48AA", fg: "#fff" },
  exa:          { kind: "letter", letter: "E",  bg: "#111827", fg: "#fff" },
};

function SearchProviderIcon({ provider }: { provider: string }) {
  const def = SEARCH_ICON_MAP[provider];
  if (!def) {
    return (
      <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
        <span className="text-xs font-bold text-muted-foreground">?</span>
      </div>
    );
  }
  return (
    <div
      className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
      style={{ backgroundColor: def.bg }}
    >
      {def.kind === "letter" ? (
        <span className="text-sm font-bold leading-none" style={{ color: def.fg }}>
          {def.letter}
        </span>
      ) : (
        <def.Icon className="h-[18px] w-[18px]" style={{ color: def.fg }} />
      )}
    </div>
  );
}

export default function SearchIntegrationsPage() {
  const [providers, setProviders] = useState<SearchProvider[]>([]);
  const [loading, setLoading]     = useState(true);
  const [inputs, setInputs]       = useState<Record<string, string>>({});
  const [visible, setVisible]     = useState<Record<string, boolean>>({});
  const [saving, setSaving]       = useState<Record<string, boolean>>({});
  const [removing, setRemoving]   = useState<Record<string, boolean>>({});
  const [testing, setTesting]     = useState<Record<string, boolean>>({});
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; msg: string }>>({});

  async function load() {
    try {
      const res = await apiClient.get("/api/settings/search-keys");
      setProviders(res.data.data ?? []);
    } catch {
      // show empty list on error
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(provider: string) {
    const key = inputs[provider]?.trim();
    if (!key) return;
    setSaving(p => ({ ...p, [provider]: true }));
    try {
      await apiClient.post("/api/settings/search-keys", { provider, api_key: key });
      setInputs(p => ({ ...p, [provider]: "" }));
      await load();
    } finally {
      setSaving(p => ({ ...p, [provider]: false }));
    }
  }

  async function handleRemove(provider: string) {
    setRemoving(p => ({ ...p, [provider]: true }));
    try {
      await apiClient.delete(`/api/settings/search-keys/${provider}`);
      await load();
    } finally {
      setRemoving(p => ({ ...p, [provider]: false }));
    }
  }

  async function handleTest(provider: string) {
    setTesting(p => ({ ...p, [provider]: true }));
    setTestResult(p => ({ ...p, [provider]: undefined! }));
    try {
      const res = await apiClient.post(`/api/settings/search-keys/${provider}/test`);
      if (res.data.success && res.data.data?.valid) {
        setTestResult(p => ({ ...p, [provider]: { ok: true, msg: "Connection successful" } }));
      } else {
        setTestResult(p => ({ ...p, [provider]: { ok: false, msg: res.data.error ?? "Invalid key" } }));
      }
    } catch (e: any) {
      setTestResult(p => ({
        ...p,
        [provider]: { ok: false, msg: e?.response?.data?.detail ?? "Test failed" },
      }));
    } finally {
      setTesting(p => ({ ...p, [provider]: false }));
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Search Integrations</h1>
        <p className="text-sm text-muted-foreground mt-1">
          API keys for the web search tool used by your agents.
          DuckDuckGo works out of the box with no key — add one below for higher limits and better results.
        </p>
      </div>

      {/* DuckDuckGo — always available, no key */}
      <Card className="p-5 space-y-2 border-dashed">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: "#DE5833" }}>
              <SiDuckduckgo className="h-[18px] w-[18px]" style={{ color: "#fff" }} />
            </div>
            <div>
              <p className="text-sm font-semibold">DuckDuckGo</p>
              <p className="text-xs text-muted-foreground">Free fallback — no API key needed. Used automatically when no other provider is configured.</p>
            </div>
          </div>
          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs shrink-0">
            <Check className="h-3 w-3 mr-1" /> Always available
          </Badge>
        </div>
      </Card>

      {providers.map((p) => {
        const isSaving   = saving[p.provider];
        const isRemoving = removing[p.provider];
        const isTesting  = testing[p.provider];
        const result     = testResult[p.provider];

        return (
          <Card key={p.provider} className="p-5 space-y-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <SearchProviderIcon provider={p.provider} />
                <div>
                  <p className="text-sm font-semibold">{p.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {p.configured ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                    <Check className="h-3 w-3 mr-1" /> Connected
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    Not connected
                  </Badge>
                )}
                <a href={p.docs_url} target="_blank" rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>

            {/* Free tier badge */}
            {p.free_tier && (
              <p className="text-[11px] text-emerald-600 font-medium">✓ {p.free_tier}</p>
            )}

            {/* Key input */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={visible[p.provider] ? "text" : "password"}
                  placeholder={p.configured ? "••••••••••••• (saved)" : p.key_hint}
                  value={inputs[p.provider] ?? ""}
                  onChange={e => setInputs(prev => ({ ...prev, [p.provider]: e.target.value }))}
                  className="pr-9 text-sm font-mono"
                  onKeyDown={e => e.key === "Enter" && handleSave(p.provider)}
                />
                <button
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setVisible(prev => ({ ...prev, [p.provider]: !prev[p.provider] }))}
                  type="button"
                >
                  {visible[p.provider] ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <Button
                size="sm"
                disabled={!inputs[p.provider]?.trim() || isSaving}
                onClick={() => handleSave(p.provider)}
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
              </Button>
            </div>

            {/* Actions */}
            {p.configured && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                  disabled={isTesting} onClick={() => handleTest(p.provider)}>
                  {isTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test connection"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                  disabled={isRemoving} onClick={() => handleRemove(p.provider)}>
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
