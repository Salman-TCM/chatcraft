"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Save, Loader2, Check, Settings,
  Brain, Zap, Terminal, Webhook, Plug, ChevronDown,
  ChevronUp, RefreshCw, Trash2, Plus, ExternalLink,
  AlertCircle, Globe, Wrench, Sparkles, BookOpen, MessageSquare, Palette,
} from "lucide-react";
import { TestChatDrawer } from "./TestChatDrawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { apiClient } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  tools: Record<string, boolean>;
  instructions: string | null;
  memory_enabled: boolean;
  max_steps: number;
  is_active: boolean;
  webhook_url: string | null;
}

interface MCPServer {
  id: string;
  name: string;
  server_url: string;
  auth_type: string;
  is_active: boolean;
  created_at: string;
}

interface MCPTool {
  name: string;
  description?: string;
}

interface ProviderModels {
  provider: string;
  label: string;
  available: boolean;
  models: { id: string; name: string; allowed?: boolean }[];
  custom_model_input?: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SELF_HOSTED_PREFIX = "self-hosted/";
const SELF_HOSTED_OPTION = "__self_hosted__";

const TOOLS = [
  { key: "web_search",   label: "Web Search",    description: "Search the internet for real-time information",  icon: "🔍" },
  { key: "browser",      label: "Browser",       description: "Visit and interact with web pages",              icon: "🌐" },
  { key: "code",         label: "Code Execution",description: "Run Python code and scripts",                    icon: "⚙️" },
  { key: "http",         label: "HTTP Requests", description: "Call external REST APIs",                        icon: "🔗" },
  { key: "sheets",       label: "Google Sheets", description: "Read and write spreadsheets",                    icon: "📊" },
  { key: "email",        label: "Email",         description: "Compose and send emails",                        icon: "✉️" },
  { key: "sms",          label: "SMS",           description: "Send text messages via Twilio",                  icon: "💬" },
  { key: "verification", label: "Verification",  description: "Send and verify OTP codes",                      icon: "🔐" },
  { key: "search_kb",    label: "Knowledge Base",description: "Search this agent's uploaded documents",         icon: "📚" },
  { key: "agent_builder",label: "Agent Builder", description: "Spawn and manage other agents",                  icon: "🤖" },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3 mb-6">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <h3 className="font-semibold text-base">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ToolToggle({
  tool,
  enabled,
  onToggle,
}: {
  tool: typeof TOOLS[number];
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-3 rounded-xl border p-3.5 text-left transition-all ${
        enabled
          ? "border-primary/50 bg-primary/5 shadow-sm"
          : "border-border bg-background hover:border-muted-foreground/30 hover:bg-muted/30"
      }`}
    >
      <span className="text-xl shrink-0">{tool.icon}</span>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium leading-tight ${enabled ? "text-primary" : ""}`}>
          {tool.label}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{tool.description}</p>
      </div>
      <div className={`shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
        enabled ? "border-primary bg-primary" : "border-muted-foreground/40"
      }`}>
        {enabled && <Check className="h-3 w-3 text-white" />}
      </div>
    </button>
  );
}

function MCPServerCard({
  server,
  tools,
  loadingTools,
  onToggle,
  onDelete,
  onDiscover,
}: {
  server: MCPServer;
  tools?: MCPTool[];
  loadingTools: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onDiscover: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border transition-all ${
      server.is_active ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-900 dark:bg-emerald-950/20" : "border-border bg-muted/20"
    }`}>
      <div className="flex items-center gap-3 p-4">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          server.is_active ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400" : "bg-muted text-muted-foreground"
        }`}>
          <Globe className="h-4 w-4" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold truncate">{server.name}</p>
            <Badge variant={server.is_active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
              {server.is_active ? "Active" : "Off"}
            </Badge>
            {tools && tools.length > 0 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-1">
                <Wrench className="h-2.5 w-2.5" />
                {tools.length} tool{tools.length !== 1 ? "s" : ""}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">{server.server_url}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={onDiscover} disabled={loadingTools}
            title="Discover tools"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingTools ? "animate-spin" : ""}`} />
          </Button>
          {tools && tools.length > 0 && (
            <Button
              size="icon" variant="ghost" className="h-7 w-7"
              onClick={() => setExpanded((e) => !e)}
              title="View tools"
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Switch checked={server.is_active} onCheckedChange={onToggle} />
          <Button
            size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {expanded && tools && tools.length > 0 && (
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t pt-3 mt-0">
          {tools.map((tool) => (
            <div key={tool.name} className="bg-background rounded-lg p-2.5 border">
              <p className="text-xs font-mono font-semibold text-primary">{tool.name}</p>
              {tool.description && (
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{tool.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConfigureAgentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [saved, setSaved]         = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [testChatOpen, setTestChatOpen] = useState(false);

  const [mcpServers, setMcpServers]       = useState<MCPServer[]>([]);
  const [mcpTools, setMcpTools]           = useState<Record<string, MCPTool[]>>({});
  const [loadingMcpId, setLoadingMcpId]   = useState<string | null>(null);

  const [providers, setProviders]         = useState<ProviderModels[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);

  const [form, setForm] = useState({
    name: "",
    description: "",
    model: "claude-sonnet-4-6",
    instructions: "",
    memory_enabled: false,
    max_steps: 10,
    is_active: true,
    webhook_url: "",
    welcome_message: "",
    suggestions_enabled: false,
    tools: {} as Record<string, boolean>,
    // Design
    primary_colour: "#6366f1",
    logo_url: "",
    dark_mode: false,
    show_branding: true,
    font_family: "system-ui",
    bubble_style: "rounded",
    placeholder_text: "",
  });

  const isSelfHostedModel = form.model.startsWith(SELF_HOSTED_PREFIX);

  const loadAgent = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/v1/agents/${id}`);
      const d = res.data.data;
      setForm({
        name: d.name,
        description: d.description || "",
        model: d.model,
        instructions: d.instructions || "",
        memory_enabled: d.memory_enabled,
        max_steps: d.max_steps,
        is_active: d.is_active,
        webhook_url: d.webhook_url || "",
        welcome_message: d.welcome_message || "",
        suggestions_enabled: d.suggestions_enabled || false,
        tools: d.tools || {},
        primary_colour: d.primary_colour || "#6366f1",
        logo_url: d.logo_url || "",
        dark_mode: d.dark_mode || false,
        show_branding: d.show_branding ?? true,
        font_family: d.font_family || "system-ui",
        bubble_style: d.bubble_style || "rounded",
        placeholder_text: d.placeholder_text || "",
      });
    } catch {
      router.push("/dashboard/agents");
    }
  }, [id, router]);

  const loadMcpServers = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/mcp-servers");
      setMcpServers(res.data.data || []);
    } catch {}
  }, []);

  const loadModels = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/models");
      setProviders(res.data.data || []);
    } catch {}
    setModelsLoading(false);
  }, []);

  useEffect(() => {
    Promise.all([loadAgent(), loadMcpServers(), loadModels()]).finally(() => setLoading(false));
  }, [loadAgent, loadMcpServers, loadModels]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiClient.put(`/api/v1/agents/${id}`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        model: form.model,
        instructions: form.instructions.trim() || null,
        memory_enabled: form.memory_enabled,
        max_steps: form.max_steps,
        is_active: form.is_active,
        webhook_url: form.webhook_url.trim() || null,
        welcome_message: form.welcome_message.trim() || null,
        suggestions_enabled: form.suggestions_enabled,
        tools: form.tools,
        primary_colour: form.primary_colour || "#6366f1",
        logo_url: form.logo_url.trim() || null,
        dark_mode: form.dark_mode,
        show_branding: form.show_branding,
        font_family: form.font_family || "system-ui",
        bubble_style: form.bubble_style || "rounded",
        placeholder_text: form.placeholder_text.trim() || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const set = (field: string, value: unknown) =>
    setForm((p) => ({ ...p, [field]: value }));

  const toggleTool = (key: string) =>
    setForm((p) => ({ ...p, tools: { ...p.tools, [key]: !p.tools[key] } }));

  const toggleMcp = async (server: MCPServer) => {
    await apiClient.patch(`/api/v1/mcp-servers/${server.id}`, { is_active: !server.is_active });
    await loadMcpServers();
  };

  const deleteMcp = async (serverId: string) => {
    if (!confirm("Remove this MCP server?")) return;
    await apiClient.delete(`/api/v1/mcp-servers/${serverId}`);
    await loadMcpServers();
  };

  const discoverTools = async (serverId: string) => {
    setLoadingMcpId(serverId);
    try {
      const res = await apiClient.get(`/api/v1/mcp-servers/${serverId}/tools`);
      setMcpTools((t) => ({ ...t, [serverId]: res.data.data || [] }));
    } catch {}
    setLoadingMcpId(null);
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const enabledCount   = Object.values(form.tools).filter(Boolean).length;
  const activeMcpCount = mcpServers.filter((s) => s.is_active).length;

  return (
    <div className="flex flex-col min-h-full">
      {/* ── Sticky top bar ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 backdrop-blur px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-base font-semibold leading-tight truncate">{form.name || "Configure Agent"}</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Agent Builder → Configure</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {error && (
            <p className="hidden sm:flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="h-3.5 w-3.5" />{error}
            </p>
          )}
          <Button
            variant="outline" size="sm"
            onClick={() => router.push(`/dashboard/agents/${id}/knowledge`)}
            className="hidden sm:flex"
          >
            <BookOpen className="h-3.5 w-3.5 mr-1.5" />
            Knowledge
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => setTestChatOpen(true)}
            className="hidden sm:flex"
          >
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Test Chat
          </Button>
          <Button
            variant="outline" size="sm"
            onClick={() => router.push(`/dashboard/agents/run/${id}`)}
            className="hidden sm:flex"
          >
            <Terminal className="h-3.5 w-3.5 mr-1.5" />
            Test Run
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving} className="min-w-[80px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> :
             saved  ? <><Check className="h-3.5 w-3.5 mr-1" />Saved</> :
                      <><Save className="h-3.5 w-3.5 mr-1" />Save</>}
          </Button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 sm:px-6 py-6 max-w-4xl mx-auto w-full">
        <Tabs defaultValue="identity" className="space-y-6">
          {/* Row 1: Identity · Model · Tools · MCP */}
          {/* Row 2: Design · Advanced — split so all tabs stay readable */}
          <div className="space-y-1">
            <TabsList className="flex w-full h-auto gap-1 p-1 rounded-xl bg-muted">
              <TabsTrigger value="identity" className="flex-1 text-xs sm:text-sm py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Settings className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                <span className="hidden xs:inline">Identity</span>
                <span className="xs:hidden">ID</span>
              </TabsTrigger>
              <TabsTrigger value="model" className="flex-1 text-xs sm:text-sm py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Brain className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Model
              </TabsTrigger>
              <TabsTrigger value="tools" className="flex-1 text-xs sm:text-sm py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Zap className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Tools
                {enabledCount > 0 && (
                  <Badge className="ml-1.5 text-[9px] px-1.5 py-0 h-4">{enabledCount}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="mcp" className="flex-1 text-xs sm:text-sm py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Plug className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                MCP
                {activeMcpCount > 0 && (
                  <Badge className="ml-1.5 text-[9px] px-1.5 py-0 h-4 bg-emerald-500">{activeMcpCount}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <TabsList className="flex w-full h-auto gap-1 p-1 rounded-xl bg-muted">
              <TabsTrigger value="design" className="flex-1 text-xs sm:text-sm py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Palette className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Design &amp; Branding
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex-1 text-xs sm:text-sm py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Webhook className="h-3.5 w-3.5 mr-1.5 shrink-0" />
                Advanced
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Identity ────────────────────────────────────────────────────── */}
          <TabsContent value="identity" className="space-y-5">
            <SectionHeader
              icon={<Settings className="h-4 w-4" />}
              title="Agent Identity"
              description="Name, description, and status of this agent"
            />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>Name <span className="text-destructive">*</span></Label>
                <Input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Customer Support Agent"
                  className="text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What does this agent do? Who is it for?"
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Agent Status</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Inactive agents cannot be run or called via API
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${form.is_active ? "text-emerald-600" : "text-muted-foreground"}`}>
                    {form.is_active ? "Active" : "Inactive"}
                  </span>
                  <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Welcome Message</Label>
                <Textarea
                  value={form.welcome_message}
                  onChange={(e) => set("welcome_message", e.target.value)}
                  placeholder="e.g. Hi! I'm here to help with orders, shipping, and product questions. What can I help you with?"
                  rows={2}
                  maxLength={500}
                  className="text-sm resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Shown as the first message before the visitor types anything, on the public share
                  page and in Test Chat.
                </p>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Suggested Reply Buttons</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    After each response, show 3-4 tappable follow-up suggestions tailored to the
                    conversation so far.
                  </p>
                </div>
                <Switch
                  checked={form.suggestions_enabled}
                  onCheckedChange={(v) => set("suggestions_enabled", v)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>System Prompt / Instructions</Label>
                <Textarea
                  value={form.instructions}
                  onChange={(e) => set("instructions", e.target.value)}
                  placeholder="You are a helpful assistant. When the user asks about orders, use the HTTP tool to check the order API at https://api.example.com/orders..."
                  rows={10}
                  className="font-mono text-xs resize-y"
                />
                <p className="text-xs text-muted-foreground">
                  Define the agent's personality, goals, and how it should use its tools.
                </p>
              </div>
            </div>
          </TabsContent>

          {/* ── Model & Memory ──────────────────────────────────────────────── */}
          <TabsContent value="model" className="space-y-5">
            <SectionHeader
              icon={<Brain className="h-4 w-4" />}
              title="Model & Memory"
              description="Choose the AI model and configure execution settings"
            />

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>AI Model</Label>
                {modelsLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading available models…
                  </div>
                ) : providers.filter((p) => p.available).length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2 dark:border-amber-900 dark:bg-amber-950/20">
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-amber-900 dark:text-amber-400">
                        No providers configured
                      </p>
                      <p className="text-[11px] text-amber-800 dark:text-amber-500 mt-0.5">
                        Add an API key in{" "}
                        <Link href="/dashboard/settings/integrations" className="underline">
                          Integrations
                        </Link>{" "}
                        to enable model selection.
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Select
                      value={isSelfHostedModel ? SELF_HOSTED_OPTION : form.model}
                      onValueChange={(v) =>
                        set("model", v === SELF_HOSTED_OPTION ? SELF_HOSTED_PREFIX : v)
                      }
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {providers
                          .filter((p) => p.available)
                          .map((p) => (
                            <div key={p.provider}>
                              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {p.label}
                              </div>
                              {p.custom_model_input ? (
                                <SelectItem value={SELF_HOSTED_OPTION} className="text-sm">
                                  Custom model…
                                </SelectItem>
                              ) : (
                                p.models.map((m) => (
                                  <SelectItem
                                    key={m.id}
                                    value={m.id}
                                    disabled={m.allowed === false}
                                    className="text-sm"
                                  >
                                    <span>{m.name}</span>
                                    {m.allowed === false && (
                                      <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">
                                        Upgrade
                                      </Badge>
                                    )}
                                  </SelectItem>
                                ))
                              )}
                            </div>
                          ))}
                      </SelectContent>
                    </Select>
                    {isSelfHostedModel && (
                      <Input
                        type="text"
                        placeholder="Model name on your server, e.g. llama3.1:8b"
                        value={form.model.slice(SELF_HOSTED_PREFIX.length)}
                        onChange={(e) => set("model", SELF_HOSTED_PREFIX + e.target.value)}
                        className="text-sm font-mono mt-2"
                      />
                    )}
                  </>
                )}
                {!modelsLoading && form.model && !isSelfHostedModel &&
                  !providers.some((p) => p.models.some((m) => m.id === form.model)) && (
                  <p className="text-[11px] text-amber-700 flex items-center gap-1 mt-1">
                    <AlertCircle className="h-3 w-3" />
                    Currently saved model <code className="font-mono">{form.model}</code> is not
                    in any known provider.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>Max Reasoning Turns</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number" min={1} max={30}
                    value={form.max_steps}
                    onChange={(e) => set("max_steps", Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                    className="w-28 text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    How many times the model can think + call tools before finishing (1–30). Each turn is one LLM call and may fire multiple tools. Higher = deeper reasoning + higher cost.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Persistent Memory</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Remember facts and context across separate conversations
                  </p>
                </div>
                <Switch
                  checked={form.memory_enabled}
                  onCheckedChange={(v) => set("memory_enabled", v)}
                />
              </div>
            </div>
          </TabsContent>

          {/* ── Tools ───────────────────────────────────────────────────────── */}
          <TabsContent value="tools" className="space-y-5">
            <SectionHeader
              icon={<Zap className="h-4 w-4" />}
              title="Built-in Tools"
              description={`${enabledCount} of ${TOOLS.length} tools enabled — toggle what this agent can do`}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {TOOLS.map((tool) => (
                <ToolToggle
                  key={tool.key}
                  tool={tool}
                  enabled={!!form.tools[tool.key]}
                  onToggle={() => toggleTool(tool.key)}
                />
              ))}
            </div>

            {enabledCount === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">
                No tools selected — this agent will respond from its knowledge only.
              </p>
            )}
          </TabsContent>

          {/* ── MCP Servers ─────────────────────────────────────────────────── */}
          <TabsContent value="mcp" className="space-y-5">
            <div className="flex items-start justify-between gap-3">
              <SectionHeader
                icon={<Plug className="h-4 w-4" />}
                title="MCP Servers"
                description="Active MCP servers are automatically available to all your agents"
              />
              <Link href="/dashboard/settings/mcp" className="shrink-0">
                <Button variant="outline" size="sm" className="text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Add Server
                  <ExternalLink className="h-3 w-3 ml-1.5 opacity-60" />
                </Button>
              </Link>
            </div>

            {mcpServers.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Globe className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">No MCP servers configured</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Connect external tool servers to give agents access to custom capabilities like databases, APIs, or proprietary tools.
                    </p>
                  </div>
                  <Link href="/dashboard/settings/mcp">
                    <Button size="sm" variant="outline" className="mt-1">
                      <Plus className="h-3.5 w-3.5 mr-1.5" />
                      Connect MCP Server
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-muted/50 px-4 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Active servers are automatically injected into this agent's tool set. Toggle to enable or disable per server.
                </div>
                {mcpServers.map((server) => (
                  <MCPServerCard
                    key={server.id}
                    server={server}
                    tools={mcpTools[server.id]}
                    loadingTools={loadingMcpId === server.id}
                    onToggle={() => toggleMcp(server)}
                    onDelete={() => deleteMcp(server.id)}
                    onDiscover={() => discoverTools(server.id)}
                  />
                ))}
                <p className="text-xs text-muted-foreground text-center pt-1">
                  {activeMcpCount} of {mcpServers.length} server{mcpServers.length !== 1 ? "s" : ""} active
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── Design ──────────────────────────────────────────────────────── */}
          <TabsContent value="design" className="space-y-5">
            <SectionHeader
              icon={<Palette className="h-4 w-4" />}
              title="Design & Branding"
              description="Customise colours, fonts, and appearance for your public agent page and widget"
            />

            <div className="space-y-4">
              {/* Primary colour */}
              <div className="space-y-1.5">
                <Label>Primary Colour</Label>
                <div className="flex items-center gap-3">
                  <div className="relative h-9 w-9 shrink-0 rounded-lg border overflow-hidden cursor-pointer">
                    <input
                      type="color"
                      value={form.primary_colour}
                      onChange={e => set("primary_colour", e.target.value)}
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0"
                    />
                    <div className="w-full h-full rounded-lg" style={{ backgroundColor: form.primary_colour }} />
                  </div>
                  <input
                    type="text"
                    value={form.primary_colour}
                    onChange={e => set("primary_colour", e.target.value)}
                    placeholder="#6366f1"
                    maxLength={7}
                    className="flex-1 border rounded-md px-3 py-2 text-sm font-mono bg-background"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Used for the header, user messages, and send button.</p>
              </div>

              {/* Logo URL */}
              <div className="space-y-1.5">
                <Label>Logo URL</Label>
                <div className="flex items-center gap-3">
                  {form.logo_url && (
                    <img src={form.logo_url} alt="logo preview"
                         className="h-9 w-9 rounded-lg object-cover shrink-0 border"
                         onError={e => (e.currentTarget.style.display = "none")} />
                  )}
                  <input
                    type="url"
                    value={form.logo_url}
                    onChange={e => set("logo_url", e.target.value)}
                    placeholder="https://example.com/logo.png"
                    className="flex-1 border rounded-md px-3 py-2 text-sm font-mono bg-background"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Shown in the chat header. Leave blank to use the bot icon.</p>
              </div>

              {/* Font family */}
              <div className="space-y-1.5">
                <Label>Font</Label>
                <Select value={form.font_family} onValueChange={v => set("font_family", v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["system-ui", "Inter", "Roboto", "Open Sans", "Lato", "Poppins", "Georgia", "monospace"].map(f => (
                      <SelectItem key={f} value={f} className="text-sm" style={{ fontFamily: f }}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bubble style */}
              <div className="space-y-1.5">
                <Label>Message Bubble Style</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: "rounded", label: "Rounded", style: "12px" },
                    { key: "pill",    label: "Pill",    style: "9999px" },
                    { key: "square",  label: "Square",  style: "4px" },
                  ].map(({ key, label, style }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => set("bubble_style", key)}
                      className={`border rounded-lg p-3 flex flex-col items-center gap-2 transition-all ${
                        form.bubble_style === key
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-muted-foreground/30"
                      }`}
                    >
                      <div className="px-3 py-1.5 text-xs font-medium text-white"
                           style={{ backgroundColor: form.primary_colour, borderRadius: style }}>
                        Hello
                      </div>
                      <span className="text-xs font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Placeholder text */}
              <div className="space-y-1.5">
                <Label>Input Placeholder</Label>
                <input
                  type="text"
                  value={form.placeholder_text}
                  onChange={e => set("placeholder_text", e.target.value)}
                  placeholder="Type a message…"
                  maxLength={200}
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                />
              </div>

              {/* Dark mode */}
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Dark Mode</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Use a dark background on the public chat page</p>
                </div>
                <Switch checked={form.dark_mode} onCheckedChange={v => set("dark_mode", v)} />
              </div>

              {/* Show branding */}
              <div className="flex items-center justify-between rounded-xl border p-4">
                <div>
                  <p className="text-sm font-medium">Show "Powered by" Branding</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Display a small footer link on the public page</p>
                </div>
                <Switch checked={form.show_branding} onCheckedChange={v => set("show_branding", v)} />
              </div>

              {/* Live preview strip */}
              <div className="rounded-xl border overflow-hidden">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 pt-3 pb-2">Preview</p>
                <div className="p-4 space-y-2" style={{ backgroundColor: form.dark_mode ? "#18181b" : "#f4f4f5", fontFamily: form.font_family }}>
                  {/* Bot bubble */}
                  <div className="flex justify-start">
                    <div className="px-3 py-2 text-xs max-w-[70%]"
                         style={{
                           backgroundColor: form.dark_mode ? "#27272a" : "#ffffff",
                           color: form.dark_mode ? "#f4f4f5" : "#09090b",
                           borderRadius: form.bubble_style === "pill" ? "9999px" : form.bubble_style === "square" ? "4px" : "12px",
                           borderBottomLeftRadius: "2px",
                         }}>
                      Hi! How can I help you today?
                    </div>
                  </div>
                  {/* User bubble */}
                  <div className="flex justify-end">
                    <div className="px-3 py-2 text-xs max-w-[70%]"
                         style={{
                           backgroundColor: form.primary_colour,
                           color: (() => {
                             const c = form.primary_colour.replace("#", "");
                             if (c.length < 6) return "#fff";
                             const r = parseInt(c.slice(0,2),16), g = parseInt(c.slice(2,4),16), b = parseInt(c.slice(4,6),16);
                             return (0.299*r + 0.587*g + 0.114*b)/255 > 0.55 ? "#09090b" : "#ffffff";
                           })(),
                           borderRadius: form.bubble_style === "pill" ? "9999px" : form.bubble_style === "square" ? "4px" : "12px",
                           borderBottomRightRadius: "2px",
                         }}>
                      {form.placeholder_text || "Type a message…"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* ── Advanced ────────────────────────────────────────────────────── */}
          <TabsContent value="advanced" className="space-y-5">
            <SectionHeader
              icon={<Webhook className="h-4 w-4" />}
              title="Advanced Settings"
              description="Webhook notifications and integration options"
            />

            <div className="space-y-1.5">
              <Label>Webhook URL</Label>
              <Input
                value={form.webhook_url}
                onChange={(e) => set("webhook_url", e.target.value)}
                placeholder="https://your-server.com/agent-webhook"
                type="url"
                className="text-sm font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Receive a POST request after each agent run completes. Payload includes the full run transcript.
              </p>
            </div>

            <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-900 dark:bg-amber-950/20">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" />
                  Danger Zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs mb-3">
                  These actions are permanent and cannot be undone.
                </CardDescription>
                <Button
                  variant="destructive" size="sm"
                  onClick={async () => {
                    if (!confirm("Delete this agent? This cannot be undone.")) return;
                    await apiClient.delete(`/api/v1/agents/${id}`);
                    router.push("/dashboard/agents");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Agent
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Sticky bottom save bar (mobile) ─────────────────────────────────── */}
      <div className="sticky bottom-0 sm:hidden border-t bg-background/95 backdrop-blur px-4 py-3 flex gap-2">
        <Button variant="outline" className="flex-1" onClick={() => router.push(`/dashboard/agents/run/${id}`)}>
          <Terminal className="h-4 w-4 mr-2" />
          Test Run
        </Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> :
           saved  ? <Check className="h-4 w-4 mr-2" /> :
                    <Save className="h-4 w-4 mr-2" />}
          {saved ? "Saved!" : "Save"}
        </Button>
      </div>

      <TestChatDrawer
        agentId={id}
        agentName={form.name || "Agent"}
        welcomeMessage={form.welcome_message}
        open={testChatOpen}
        onClose={() => setTestChatOpen(false)}
      />
    </div>
  );
}
