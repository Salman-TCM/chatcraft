"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, ArrowLeft, Bot, Check, ChevronDown, ChevronRight,
  ChevronUp, Code2, Copy, ExternalLink, Globe, Loader2, Mail,
  Link2, MessageSquare, RefreshCw, Send, Server, ShieldCheck,
  Chrome, Sheet, Smartphone, Trash2, Zap, ToggleLeft, ToggleRight,
  BarChart2, Webhook, Brain, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";
import { getSession } from "next-auth/react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProviderMeta {
  label: string;
  models: string[];
}

interface KeyStatus {
  provider: string;
  configured: boolean;
}

interface Agent {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  chatbot_id: string | null;
  model: string;
  tools: Record<string, boolean>;
  memory_enabled: boolean;
  max_steps: number;
  is_published: boolean;
  is_active: boolean;
  share_enabled: boolean;
  share_token: string | null;
  webhook_url: string | null;
}

interface MCPServer {
  id: string;
  name: string;
  server_url: string;
  is_active: boolean;
  auth_type: string;
}

interface Chatbot {
  id: string;
  name: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result" | "error";
  content: string;
  tool?: string;
  step?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOOLS = [
  {
    key: "web_search",
    label: "Web Search",
    icon: Globe,
    description: "Search the internet for up-to-date information",
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    activeBg: "bg-blue-600",
  },
  {
    key: "browser",
    label: "Browser",
    icon: Chrome,
    description: "Visit and extract content from web pages",
    color: "text-orange-600",
    bg: "bg-orange-50 border-orange-200",
    activeBg: "bg-orange-600",
  },
  {
    key: "code",
    label: "Run Code",
    icon: Code2,
    description: "Execute Python for calculations & data processing",
    color: "text-purple-600",
    bg: "bg-purple-50 border-purple-200",
    activeBg: "bg-purple-600",
  },
  {
    key: "http",
    label: "HTTP Requests",
    icon: Link2,
    description: "Call external APIs with GET / POST",
    color: "text-green-600",
    bg: "bg-green-50 border-green-200",
    activeBg: "bg-green-600",
  },
  {
    key: "sheets",
    label: "Google Sheets",
    icon: Sheet,
    description: "Read and write Google Sheets data",
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    activeBg: "bg-emerald-600",
  },
  {
    key: "email",
    label: "Send Email",
    icon: Mail,
    description: "Send emails via AWS SES or SMTP integration",
    color: "text-rose-600",
    bg: "bg-rose-50 border-rose-200",
    activeBg: "bg-rose-600",
  },
  {
    key: "sms",
    label: "Send SMS",
    icon: Smartphone,
    description: "Send SMS text messages via Twilio integration",
    color: "text-violet-600",
    bg: "bg-violet-50 border-violet-200",
    activeBg: "bg-violet-600",
  },
  {
    key: "verification",
    label: "Verification Codes",
    icon: ShieldCheck,
    description: "Send OTP codes by email or SMS and verify them (10-min expiry)",
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    activeBg: "bg-amber-600",
  },
  {
    key: "agent_builder",
    label: "Agent Builder",
    icon: Bot,
    description: "List available models and create new agents (for meta-agent / Agent Builder use)",
    color: "text-sky-600",
    bg: "bg-sky-50 border-sky-200",
    activeBg: "bg-sky-600",
  },
];

type Tab = "identity" | "model" | "instructions" | "tools" | "mcp" | "advanced" | "share" | "analytics";

const TABS: { id: Tab; label: string }[] = [
  { id: "identity",     label: "Identity" },
  { id: "model",        label: "Model" },
  { id: "instructions", label: "Instructions" },
  { id: "tools",        label: "Tools" },
  { id: "mcp",          label: "MCP" },
  { id: "advanced",     label: "Advanced" },
  { id: "share",        label: "Share" },
  { id: "analytics",   label: "Analytics" },
];

// ── Model selector ────────────────────────────────────────────────────────────

function ModelSelect({
  value,
  onChange,
  providerMeta,
  configuredProviders,
}: {
  value: string;
  onChange: (v: string) => void;
  providerMeta: Record<string, ProviderMeta>;
  configuredProviders: Set<string>;
}) {
  const configured = Object.entries(providerMeta).filter(([p]) => configuredProviders.has(p));
  const unconfigured = Object.entries(providerMeta).filter(([p]) => !configuredProviders.has(p));
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {configured.map(([provider, info]) => (
        <optgroup key={provider} label={`✓ ${info.label}`}>
          {info.models.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </optgroup>
      ))}
      {unconfigured.length > 0 && (
        <optgroup label="── No key configured ──">
          {unconfigured.map(([, info]) =>
            info.models.map((m) => (
              <option key={m} value={m} disabled>{info.label} — {m}</option>
            ))
          )}
        </optgroup>
      )}
    </select>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Provider / model data
  const [providerMeta, setProviderMeta] = useState<Record<string, ProviderMeta>>({});
  const [configuredProviders, setConfiguredProviders] = useState<Set<string>>(new Set());

  // MCP servers
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);

  // Share
  const [shareEnabled, setShareEnabled] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Tab — honour ?tab= query param for deep-linking (e.g. from Preview button)
  const [activeTab, setActiveTab] = useState<Tab>(
    (searchParams.get("tab") as Tab | null) ?? "identity"
  );

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [chatbotId, setChatbotId] = useState<string>("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [maxSteps, setMaxSteps] = useState(10);
  const [isActive, setIsActive] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");

  // Memory sessions
  const [memorySessions, setMemorySessions] = useState<{id:string;message_count:number;tool_calls:number;preview:string;created_at:string}[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [clearingMemory, setClearingMemory] = useState(false);

  // Analytics
  const [analytics, setAnalytics] = useState<{total_conversations:number;total_runs:number;input_tokens:number;output_tokens:number;cost_usd:number;daily:{date:string;runs:number}[]} | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Test chat
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatRunning, setChatRunning] = useState(false);
  const [showTools, setShowTools] = useState(true);
  const [stepCount, setStepCount] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get(`/api/v1/agents/${id}`),
      apiClient.get("/api/chatbots"),
      apiClient.get("/api/settings/model-keys/providers"),
      apiClient.get("/api/settings/model-keys"),
      apiClient.get("/api/v1/mcp-servers").catch(() => ({ data: { data: [] } })),
    ]).then(([agentRes, botsRes, metaRes, statusRes, mcpRes]) => {
      const a: Agent = agentRes.data.data;
      setAgent(a);
      setName(a.name);
      setDescription(a.description ?? "");
      setInstructions(a.instructions ?? "");
      setChatbotId(a.chatbot_id ?? "");
      setModel(a.model);
      setTools(a.tools ?? {});
      setMemoryEnabled(a.memory_enabled);
      setMaxSteps(a.max_steps);
      setIsActive(a.is_active);
      setShareEnabled(a.share_enabled ?? false);
      setShareToken(a.share_token ?? null);
      setWebhookUrl(a.webhook_url ?? "");
      setChatbots(botsRes.data.data ?? []);
      setProviderMeta(metaRes.data.data ?? {});
      const configured = new Set<string>(
        (statusRes.data.data as KeyStatus[])
          .filter((s) => s.configured)
          .map((s) => s.provider)
      );
      setConfiguredProviders(configured);
      setMcpServers(mcpRes.data.data ?? []);
    }).catch(() => router.push("/dashboard/agents")).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (activeTab === "analytics" && !analytics && !analyticsLoading) loadAnalytics();
    if (activeTab === "advanced" && memoryEnabled && memorySessions.length === 0 && !memoryLoading) loadMemory();
  }, [activeTab]);

  async function save() {
    setSaving(true);
    try {
      await apiClient.put(`/api/v1/agents/${id}`, {
        name,
        description: description || null,
        instructions: instructions || null,
        chatbot_id: chatbotId || null,
        model,
        tools,
        memory_enabled: memoryEnabled,
        max_steps: maxSteps,
        is_active: isActive,
        webhook_url: webhookUrl || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  function toggleTool(key: string) {
    setTools(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const enabledToolCount = Object.values(tools).filter(Boolean).length;

  async function enableShare() {
    setShareLoading(true);
    try {
      const { data } = await apiClient.post(`/api/v1/agents/${id}/share/enable`);
      setShareEnabled(true);
      setShareToken(data.data.share_token);
    } finally {
      setShareLoading(false);
    }
  }

  async function disableShare() {
    setShareLoading(true);
    try {
      await apiClient.post(`/api/v1/agents/${id}/share/disable`);
      setShareEnabled(false);
    } finally {
      setShareLoading(false);
    }
  }

  async function regenerateToken() {
    if (!confirm("Regenerate share link? The current link will stop working immediately.")) return;
    setShareLoading(true);
    try {
      const { data } = await apiClient.post(`/api/v1/agents/${id}/share/regenerate`);
      setShareToken(data.data.share_token);
      setShareEnabled(true);
    } finally {
      setShareLoading(false);
    }
  }

  async function loadMemory() {
    setMemoryLoading(true);
    try {
      const { data } = await apiClient.get(`/api/v1/agents/${id}/memory`);
      setMemorySessions(data.data ?? []);
    } finally {
      setMemoryLoading(false);
    }
  }

  async function clearMemory() {
    if (!confirm("Clear all memory sessions? This cannot be undone.")) return;
    setClearingMemory(true);
    try {
      await apiClient.delete(`/api/v1/agents/${id}/memory`);
      setMemorySessions([]);
    } finally {
      setClearingMemory(false);
    }
  }

  async function deleteMemorySession(sessionId: string) {
    await apiClient.delete(`/api/v1/agents/${id}/memory/${sessionId}`);
    setMemorySessions(prev => prev.filter(s => s.id !== sessionId));
  }

  async function loadAnalytics() {
    setAnalyticsLoading(true);
    try {
      const { data } = await apiClient.get(`/api/v1/agents/${id}/analytics`);
      setAnalytics(data.data);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  function copyShareLink() {
    if (!shareToken) return;
    const url = `${window.location.origin}/agent/${shareToken}`;
    navigator.clipboard.writeText(url);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatRunning) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: text }]);
    setChatRunning(true);
    setStepCount(0);

    const pushError = (msg: string) =>
      setChatMessages(prev => [...prev, { role: "error", content: msg }]);

    const history = chatMessages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const session = await getSession();
      const token = (session?.user as any)?.accessToken;

      if (!token) {
        pushError("Session expired — please refresh the page and log in again.");
        return;
      }

      const resp = await fetch(`${apiBase}/api/v1/agents/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, conversation_history: history }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const detail = errData?.detail;
        pushError(typeof detail === "string" ? detail : detail?.error ?? `Request failed (${resp.status})`);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { pushError("No response stream received."); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentText = "";
      let currentStep = 0;

      const handleEvent = (evt: any) => {
        if (evt.type === "text") {
          currentText += evt.content;
          setChatMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, content: currentText }];
            }
            return [...prev, { role: "assistant", content: currentText }];
          });
        } else if (evt.type === "tool_call") {
          currentStep++;
          setStepCount(currentStep);
          setChatMessages(prev => [
            ...prev,
            { role: "tool_call", content: JSON.stringify(evt.input, null, 2), tool: evt.tool, step: currentStep },
          ]);
        } else if (evt.type === "tool_result") {
          setChatMessages(prev => [
            ...prev,
            { role: "tool_result", content: evt.result, tool: evt.tool, step: currentStep },
          ]);
          currentText = "";
        } else if (evt.type === "error") {
          pushError(evt.content);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // Accumulate across chunk boundaries so no data: line is split
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { handleEvent(JSON.parse(line.slice(6))); } catch { /* malformed chunk */ }
        }
      }
      // Flush any remaining bytes
      if (buffer.startsWith("data: ")) {
        try { handleEvent(JSON.parse(buffer.slice(6))); } catch { /* ignore */ }
      }
    } catch (e: any) {
      pushError(e.message || "Network error — please check your connection and try again.");
    } finally {
      setChatRunning(false);
      setStepCount(0);
    }
  }

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)] overflow-hidden">

      {/* ── Left panel: configuration ─────────────────────────────────────── */}
      <div className="w-[400px] shrink-0 border-r flex flex-col overflow-hidden bg-background">

        {/* Header */}
        <div className="border-b px-4 py-3 space-y-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{name || "Untitled Agent"}</p>
              <p className="text-[11px] text-muted-foreground">{model}</p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsActive(v => !v)}
                title={isActive ? "Deactivate agent" : "Activate agent"}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                {isActive
                  ? <ToggleRight className="h-5 w-5 text-green-500" />
                  : <ToggleLeft className="h-5 w-5" />}
              </button>
              <Button size="sm" className="h-7 text-xs px-3" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5 text-green-400" /> : null}
                {saved ? "Saved!" : "Save"}
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-0.5 overflow-x-auto scrollbar-none">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`shrink-0 rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
              >
                {tab.label}
                {tab.id === "tools" && enabledToolCount > 0 && (
                  <span className={`ml-1 rounded-full px-1 text-[10px] ${activeTab === tab.id ? "bg-white/20" : "bg-muted-foreground/20"}`}>
                    {enabledToolCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-4">

          {/* ─ Identity tab ─ */}
          {activeTab === "identity" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Agent Name <span className="text-destructive">*</span></Label>
                <Input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="h-8 text-sm"
                  placeholder="My Research Agent"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description <span className="text-muted-foreground">(optional)</span></Label>
                <Textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="text-sm resize-none min-h-[80px]"
                  placeholder="Briefly describe what this agent does and when to use it…"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Attach Chatbot Knowledge Base</Label>
                <select
                  value={chatbotId}
                  onChange={e => setChatbotId(e.target.value)}
                  className="w-full h-8 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">— None —</option>
                  {chatbots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground">
                  The agent inherits that chatbot&apos;s knowledge base and system prompt.
                </p>
              </div>
            </div>
          )}

          {/* ─ Model tab ─ */}
          {activeTab === "model" && (
            <div className="space-y-4">
              {configuredProviders.size === 0 && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    No AI model keys configured.{" "}
                    <a href="/dashboard/settings/integrations" className="underline font-medium">
                      Set up API keys in Integrations
                    </a>
                    {" "}to activate this agent.
                  </span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">AI Model</Label>
                {Object.keys(providerMeta).length > 0 ? (
                  <ModelSelect
                    value={model}
                    onChange={setModel}
                    providerMeta={providerMeta}
                    configuredProviders={configuredProviders}
                  />
                ) : (
                  <select
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="w-full h-8 rounded-md border bg-background px-3 text-sm"
                  >
                    <option value="claude-sonnet-4-6">claude-sonnet-4-6</option>
                    <option value="claude-opus-4-7">claude-opus-4-7</option>
                    <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
                    <option value="gpt-4o">gpt-4o</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                  </select>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Only models with a configured API key are active. Models requiring unconfigured keys are greyed out.
                </p>
              </div>

              <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-[11px] uppercase tracking-wide">Model guidance</p>
                <ul className="space-y-1">
                  <li><span className="font-medium text-foreground">Sonnet 4.6</span> — Best balance of speed, cost, and capability for most agents</li>
                  <li><span className="font-medium text-foreground">Opus 4.7</span> — Highest capability for complex, multi-step reasoning tasks</li>
                  <li><span className="font-medium text-foreground">Haiku 4.5</span> — Fastest and cheapest; good for simple lookup or routing agents</li>
                  <li><span className="font-medium text-foreground">GPT-4o</span> — Strong alternative with vision capabilities</li>
                </ul>
              </div>
            </div>
          )}

          {/* ─ Instructions tab ─ */}
          {activeTab === "instructions" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">System Instructions</Label>
                <Textarea
                  value={instructions}
                  onChange={e => setInstructions(e.target.value)}
                  placeholder={`You are a research analyst. When given a topic:
1. Search the web for recent, authoritative sources
2. Visit the top 3 results and extract key information
3. Synthesize a structured summary with:
   - Key findings
   - Important caveats
   - Cited sources

Always prefer primary sources over aggregator sites.`}
                  className="min-h-[260px] text-sm font-mono resize-none"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Instructions are appended after any attached chatbot&apos;s system prompt.
                Be specific: tell the agent how to use its tools, what format to respond in, and when to stop.
              </p>

              {/* Quick templates */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Quick templates</p>
                {[
                  {
                    label: "Research agent",
                    prompt: "You are a research agent. Search the web, visit relevant pages, and produce a detailed summary with cited sources. Always verify information across multiple sources.",
                  },
                  {
                    label: "Data analyst",
                    prompt: "You are a data analyst. Use code execution to process data, calculate statistics, and generate insights. Present findings clearly with numbers and context.",
                  },
                  {
                    label: "API integrator",
                    prompt: "You are an API integration agent. Use HTTP requests to fetch data from external services. Parse responses and present the relevant information clearly.",
                  },
                ].map(t => (
                  <button
                    key={t.label}
                    onClick={() => setInstructions(t.prompt)}
                    className="w-full text-left rounded-md border px-3 py-2 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
                  >
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ─ Tools tab ─ */}
          {activeTab === "tools" && (
            <div className="space-y-3">
              <p className="text-[11px] text-muted-foreground">
                Enable the tools this agent can use. Each tool is only called when the model decides it&apos;s needed.
              </p>
              {TOOLS.map(({ key, label, icon: Icon, description: desc, bg, activeBg }) => {
                const enabled = !!tools[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-all ${
                      enabled ? `${bg} shadow-sm` : "hover:bg-muted/40"
                    }`}
                    onClick={() => toggleTool(key)}
                  >
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      enabled ? `${activeBg} text-white shadow-sm` : "bg-muted text-muted-foreground"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                      enabled ? "bg-primary border-primary" : "border-muted-foreground/30"
                    }`}>
                      {enabled && <Check className="h-2.5 w-2.5 text-white" />}
                    </div>
                  </div>
                );
              })}

              {enabledToolCount === 0 && (
                <div className="rounded-md bg-muted/30 border border-dashed px-3 py-2.5 text-[11px] text-muted-foreground text-center mt-2">
                  No tools enabled — agent will respond using only its training and instructions.
                </div>
              )}
            </div>
          )}

          {/* ─ MCP tab ─ */}
          {activeTab === "mcp" && (
            <div className="space-y-4">
              <p className="text-[11px] text-muted-foreground">
                All your active MCP servers are automatically available to this agent. Tools are
                discovered at runtime and namespaced as <code className="font-mono bg-muted px-1 rounded">mcp__server__tool</code>.
              </p>

              {mcpServers.length === 0 ? (
                <div className="rounded-lg border border-dashed p-5 text-center">
                  <Server className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs font-medium text-muted-foreground">No MCP servers configured</p>
                  <p className="text-[11px] text-muted-foreground mt-1 mb-3">
                    Connect MCP servers in Settings to extend this agent with external tools.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() => window.open("/dashboard/settings/mcp", "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Manage MCP Servers
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {mcpServers.map(s => (
                    <div
                      key={s.id}
                      className={`flex items-center gap-3 rounded-lg border p-3 ${s.is_active ? "bg-background" : "bg-muted/30 opacity-60"}`}
                    >
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${s.is_active ? "bg-indigo-100 text-indigo-600" : "bg-muted text-muted-foreground"}`}>
                        <Server className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{s.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{s.server_url}</p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${s.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {s.is_active ? "Active" : "Off"}
                      </span>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs w-full text-muted-foreground"
                    onClick={() => window.open("/dashboard/settings/mcp", "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Manage MCP Servers
                  </Button>
                </div>
              )}

              <div className="rounded-md bg-muted/30 border px-3 py-2.5 text-[11px] text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">How MCP tools work</p>
                <p>When you start a chat, the agent calls <code className="font-mono bg-muted px-0.5 rounded">tools/list</code> on each active server to discover available tools. Each tool is prefixed with the server name so the model knows which server to call.</p>
              </div>
            </div>
          )}

          {/* ─ Advanced tab ─ */}
          {activeTab === "advanced" && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs">Max Steps (agentic loop limit)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={1}
                    max={30}
                    value={maxSteps}
                    onChange={e => setMaxSteps(Math.min(30, Math.max(1, parseInt(e.target.value) || 10)))}
                    className="h-8 text-sm w-24"
                  />
                  <span className="text-xs text-muted-foreground">steps max (1–30)</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Each tool call counts as one step. Higher = more thorough but slower and costlier.
                  10 is a safe default.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Memory</Label>
                <div
                  className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${memoryEnabled ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"}`}
                  onClick={() => setMemoryEnabled(v => !v)}
                >
                  <div>
                    <p className="text-xs font-medium">Persistent memory</p>
                    <p className="text-[11px] text-muted-foreground">
                      {memoryEnabled ? "Agent remembers context across sessions" : "Each conversation starts fresh"}
                    </p>
                  </div>
                  <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${memoryEnabled ? "bg-primary border-primary" : "border-muted-foreground/30"}`}>
                    {memoryEnabled && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                </div>

                {memoryEnabled && (
                  <div className="mt-2 rounded-lg border bg-muted/30 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                        <Brain className="h-3 w-3" /> Memory sessions ({memorySessions.length})
                      </p>
                      <div className="flex gap-1.5">
                        <button onClick={loadMemory} className="text-[10px] text-muted-foreground hover:text-foreground">
                          {memoryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Refresh"}
                        </button>
                        {memorySessions.length > 0 && (
                          <button onClick={clearMemory} className="text-[10px] text-red-500 hover:text-red-700">
                            {clearingMemory ? <Loader2 className="h-3 w-3 animate-spin" /> : "Clear all"}
                          </button>
                        )}
                      </div>
                    </div>
                    {memorySessions.length === 0 && !memoryLoading && (
                      <p className="text-[11px] text-muted-foreground/60">No memory sessions yet</p>
                    )}
                    {memorySessions.map(s => (
                      <div key={s.id} className="flex items-start gap-2 text-[11px] group">
                        <Clock className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-muted-foreground">{s.preview || "Empty session"}</p>
                          <p className="text-muted-foreground/50">{s.message_count} msgs · {s.tool_calls} tools · {new Date(s.created_at).toLocaleDateString()}</p>
                        </div>
                        <button onClick={() => deleteMemorySession(s.id)} className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-1.5"><Webhook className="h-3.5 w-3.5" /> Webhook URL</Label>
                <Input
                  placeholder="https://your-server.com/agent-webhook"
                  value={webhookUrl}
                  onChange={e => setWebhookUrl(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  After each agent run, we POST the full conversation JSON to this URL (5s timeout, fire-and-forget).
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Status</Label>
                <div
                  className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${isActive ? "border-green-300 bg-green-50" : "hover:bg-muted/40"}`}
                  onClick={() => setIsActive(v => !v)}
                >
                  <div>
                    <p className="text-xs font-medium">Active</p>
                    <p className="text-[11px] text-muted-foreground">
                      {isActive ? "Agent accepts requests" : "Agent is paused — no requests will be processed"}
                    </p>
                  </div>
                  <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${isActive ? "bg-green-500 border-green-500" : "border-muted-foreground/30"}`}>
                    {isActive && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ─ Analytics tab ─ */}
          {activeTab === "analytics" && (
            <div className="space-y-5">
              {analyticsLoading && (
                <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              )}
              {!analyticsLoading && analytics && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Conversations", value: analytics.total_conversations, icon: MessageSquare, color: "text-indigo-500" },
                      { label: "Total Runs", value: analytics.total_runs, icon: Zap, color: "text-amber-500" },
                      { label: "Input Tokens", value: analytics.input_tokens.toLocaleString(), icon: Code2, color: "text-blue-500" },
                      { label: "Cost (est.)", value: `$${analytics.cost_usd.toFixed(4)}`, icon: BarChart2, color: "text-emerald-500" },
                    ].map(({ label, value, icon: Icon, color }) => (
                      <div key={label} className="rounded-lg border bg-muted/20 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <Icon className={`h-3.5 w-3.5 ${color}`} />
                          <p className="text-[11px] text-muted-foreground">{label}</p>
                        </div>
                        <p className="text-lg font-semibold">{value}</p>
                      </div>
                    ))}
                  </div>

                  {analytics.daily.length > 0 && (
                    <div className="rounded-lg border p-3">
                      <p className="text-[11px] font-medium text-muted-foreground mb-3">Runs — last 14 days</p>
                      <div className="flex items-end gap-1 h-20">
                        {analytics.daily.map(d => {
                          const max = Math.max(...analytics.daily.map(x => x.runs), 1);
                          const pct = (d.runs / max) * 100;
                          return (
                            <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.runs} runs`}>
                              <div className="w-full bg-indigo-500 rounded-sm" style={{ height: `${Math.max(pct, 4)}%` }} />
                              <p className="text-[9px] text-muted-foreground/60 rotate-45 origin-left">{d.date.slice(5)}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button onClick={loadAnalytics} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
                </>
              )}
              {!analyticsLoading && !analytics && (
                <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                  <BarChart2 className="h-8 w-8 opacity-30" />
                  <p className="text-sm">No data yet — start chatting with your agent</p>
                </div>
              )}
            </div>
          )}

          {/* ─ Share tab ─ */}
          {activeTab === "share" && (
            <div className="space-y-4">
              <p className="text-[11px] text-muted-foreground">
                Share a public link so anyone can chat with this agent — no login required.
                The link uses a secret token; regenerating it invalidates the old URL.
              </p>

              {/* Toggle */}
              <div
                className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors ${shareEnabled ? "border-indigo-300 bg-indigo-50" : "hover:bg-muted/40"}`}
                onClick={shareLoading ? undefined : (shareEnabled ? disableShare : enableShare)}
              >
                <div>
                  <p className="text-xs font-medium">Public sharing</p>
                  <p className="text-[11px] text-muted-foreground">
                    {shareEnabled ? "Anyone with the link can chat with this agent" : "Agent is private — only you can use it"}
                  </p>
                </div>
                <div className={`h-4 w-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${shareEnabled ? "bg-indigo-600 border-indigo-600" : "border-muted-foreground/30"}`}>
                  {shareLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin text-white" /> : shareEnabled && <Check className="h-2.5 w-2.5 text-white" />}
                </div>
              </div>

              {/* Share URL */}
              {shareEnabled && shareToken && (
                <div className="space-y-2">
                  <Label className="text-xs">Share link</Label>
                  <div className="flex gap-2">
                    <Input
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/agent/${shareToken}`}
                      className="h-8 text-xs font-mono bg-muted/30"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 shrink-0"
                      onClick={copyShareLink}
                    >
                      {shareCopied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-1"
                      onClick={() => window.open(`/agent/${shareToken}`, "_blank")}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Open preview
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={regenerateToken}
                      disabled={shareLoading}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Regenerate
                    </Button>
                  </div>
                </div>
              )}

              {!shareEnabled && (
                <div className="rounded-md bg-muted/30 border px-3 py-2.5 text-[11px] text-muted-foreground">
                  Enable sharing above to get a public link. You can disable it at any time to
                  immediately revoke access.
                </div>
              )}

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] text-amber-700 space-y-1">
                <p className="font-medium">Security note</p>
                <p>Public agents run with your API keys and tool integrations. Anyone with the link can send messages and trigger tools (web search, HTTP calls, etc.). Do not share links publicly if your agent has access to sensitive data.</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Right panel: test chat ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Chat header */}
        <div className="flex items-center justify-between border-b px-4 py-3 bg-background">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100">
              <Bot className="h-4 w-4 text-indigo-600" />
            </div>
            <div>
              <span className="text-sm font-medium">Test Chat</span>
              {chatRunning && stepCount > 0 && (
                <span className="ml-2 text-[11px] text-amber-600 font-medium">
                  <Zap className="h-3 w-3 inline -mt-0.5" /> Step {stepCount}…
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setShowTools(v => !v)}
            >
              {showTools ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Tool steps
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setChatMessages([])}
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          </div>
        </div>

        {/* Agent summary bar */}
        <div className="border-b px-4 py-2 bg-muted/20 flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
          <span className="font-medium text-foreground">{model}</span>
          <span>·</span>
          <span>Max {maxSteps} steps</span>
          {enabledToolCount > 0 && (
            <>
              <span>·</span>
              <span>{enabledToolCount} tool{enabledToolCount !== 1 ? "s" : ""} enabled</span>
            </>
          )}
          {chatbotId && chatbots.find(b => b.id === chatbotId) && (
            <>
              <span>·</span>
              <span>KB: {chatbots.find(b => b.id === chatbotId)?.name}</span>
            </>
          )}
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 mb-4">
                <Bot className="h-7 w-7 text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Test your agent</p>
              <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
                Send a message to see how the agent responds with its tools and instructions.
                Save changes first before testing.
              </p>
              {enabledToolCount > 0 && (
                <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                  {TOOLS.filter(t => tools[t.key]).map(t => (
                    <span key={t.key} className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
                      <t.icon className="h-3 w-3" />
                      {t.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {chatMessages.map((msg, i) => {
            if ((msg.role === "tool_call" || msg.role === "tool_result") && !showTools) return null;

            if (msg.role === "error") {
              return (
                <div key={i} className="flex justify-start">
                  <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm max-w-[85%] rounded-bl-sm">
                    <p className="font-medium text-red-700 flex items-center gap-1.5 mb-0.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      Error
                    </p>
                    <p className="text-xs text-red-600 whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              );
            }

            if (msg.role === "tool_call") {
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs max-w-[90%]">
                    <p className="font-semibold text-amber-700 mb-1 flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      Step {msg.step} — calling <code className="font-mono">{msg.tool}</code>
                    </p>
                    <pre className="text-[11px] text-amber-600 whitespace-pre-wrap break-all font-mono">{msg.content}</pre>
                  </div>
                </div>
              );
            }

            if (msg.role === "tool_result") {
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-xs max-w-[90%]">
                    <p className="font-semibold text-green-700 mb-1 flex items-center gap-1">
                      <Check className="h-3 w-3" />
                      <code className="font-mono">{msg.tool}</code> result
                    </p>
                    <p className="text-[11px] text-green-700 whitespace-pre-wrap break-all line-clamp-5">{msg.content}</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`rounded-2xl px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap break-words ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-br-sm"
                    : "bg-muted text-foreground rounded-bl-sm"
                }`}>
                  {msg.content}
                  {msg.role === "assistant" && chatRunning && i === chatMessages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                  )}
                </div>
              </div>
            );
          })}

          {chatRunning && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-4 py-3 rounded-bl-sm">
                <div className="flex gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4 bg-background">
          <div className="flex gap-2">
            <Input
              placeholder="Test your agent… (e.g. 'Research the latest AI news')"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
              disabled={chatRunning}
              className="text-sm"
            />
            <Button
              size="icon"
              onClick={sendChatMessage}
              disabled={!chatInput.trim() || chatRunning}
              className="shrink-0"
            >
              {chatRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Tool calls appear inline. Save changes before testing to use updated config.
          </p>
        </div>
      </div>
    </div>
  );
}
