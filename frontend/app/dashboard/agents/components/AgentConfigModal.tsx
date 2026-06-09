"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Globe, Code2, Link2, Mail, Smartphone, ShieldCheck, Bot,
  Loader2, Check, X, Brain, Zap, Settings, Plug,
  Webhook, RefreshCw, Trash2, Plus, ExternalLink,
  AlertCircle, ChevronDown, ChevronUp, Wrench, Sheet,
} from "lucide-react";
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

interface AgentConfigModalProps {
  agent: Agent;
  open: boolean;
  onClose: () => void;
  onUpdate: (agent: Agent) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

interface ToolConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "research" | "compute" | "integration" | "communication" | "meta";
}

const TOOLS: ToolConfig[] = [
  { key: "web_search",   label: "Web Search",     description: "Search the internet for current information", icon: Globe,       category: "research" },
  { key: "browser",      label: "Browser",        description: "Visit and extract content from web pages",    icon: Globe,       category: "research" },
  { key: "code",         label: "Code Execution", description: "Execute Python code for data processing",     icon: Code2,       category: "compute" },
  { key: "http",         label: "HTTP Requests",  description: "Make API calls to external services",         icon: Link2,       category: "integration" },
  { key: "sheets",       label: "Google Sheets",  description: "Read and write spreadsheet data",             icon: Sheet,       category: "integration" },
  { key: "email",        label: "Email",          description: "Send emails via configured service",          icon: Mail,        category: "communication" },
  { key: "sms",          label: "SMS",            description: "Send text messages via Twilio",               icon: Smartphone,  category: "communication" },
  { key: "verification", label: "Verification",   description: "Send and verify OTP codes",                   icon: ShieldCheck, category: "communication" },
  { key: "agent_builder",label: "Agent Builder",  description: "Create and manage other agents",              icon: Bot,         category: "meta" },
];

const MODELS = [
  { value: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6",  note: "Recommended" },
  { value: "claude-opus-4-7",           label: "Claude Opus 4.7",    note: "Most powerful" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5",   note: "Fastest" },
  { value: "gpt-4o",                    label: "GPT-4o",             note: null },
  { value: "gpt-4o-mini",              label: "GPT-4o Mini",        note: null },
];

const CATEGORY_LABELS: Record<string, string> = {
  research: "Research",
  compute: "Compute",
  integration: "Integration",
  communication: "Communication",
  meta: "Meta",
};

// ─── MCP Server card inside modal ─────────────────────────────────────────────

function MCPCard({
  server, tools, loadingTools, onToggle, onDelete, onDiscover,
}: {
  server: MCPServer;
  tools?: MCPTool[];
  loadingTools: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onDiscover: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`rounded-xl border transition-colors ${
      server.is_active
        ? "border-emerald-200 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/20"
        : "border-border bg-muted/20"
    }`}>
      <div className="flex items-center gap-3 p-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          server.is_active
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-400"
            : "bg-muted text-muted-foreground"
        }`}>
          <Globe className="h-3.5 w-3.5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium truncate">{server.name}</p>
            {tools && tools.length > 0 && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 gap-0.5 h-4">
                <Wrench className="h-2.5 w-2.5" />{tools.length}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground font-mono truncate">{server.server_url}</p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onDiscover} disabled={loadingTools} title="Discover tools">
            <RefreshCw className={`h-3 w-3 ${loadingTools ? "animate-spin" : ""}`} />
          </Button>
          {tools && tools.length > 0 && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen((o) => !o)}>
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </Button>
          )}
          <Switch checked={server.is_active} onCheckedChange={onToggle} />
          <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {open && tools && tools.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 px-3 pb-3 border-t pt-2">
          {tools.map((t) => (
            <div key={t.name} className="rounded-lg bg-background border px-2.5 py-2">
              <p className="text-[11px] font-mono font-semibold text-primary truncate">{t.name}</p>
              {t.description && (
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{t.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main modal ───────────────────────────────────────────────────────────────

export function AgentConfigModal({ agent, open, onClose, onUpdate }: AgentConfigModalProps) {
  const [form, setForm] = useState({
    name: agent.name,
    description: agent.description || "",
    model: agent.model,
    instructions: agent.instructions || "",
    memory_enabled: agent.memory_enabled,
    max_steps: agent.max_steps,
    is_active: agent.is_active,
    webhook_url: agent.webhook_url || "",
    tools: { ...agent.tools },
  });
  const [saving, setSaving]           = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [activeTab, setActiveTab]     = useState("basic");

  const [mcpServers, setMcpServers]         = useState<MCPServer[]>([]);
  const [mcpTools, setMcpTools]             = useState<Record<string, MCPTool[]>>({});
  const [loadingMcpId, setLoadingMcpId]     = useState<string | null>(null);

  const loadMcp = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/mcp-servers");
      setMcpServers(res.data.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    if (open) {
      setForm({
        name: agent.name,
        description: agent.description || "",
        model: agent.model,
        instructions: agent.instructions || "",
        memory_enabled: agent.memory_enabled,
        max_steps: agent.max_steps,
        is_active: agent.is_active,
        webhook_url: agent.webhook_url || "",
        tools: { ...agent.tools },
      });
      setErrors({});
      setActiveTab("basic");
      loadMcp();
    }
  }, [agent, open, loadMcp]);

  const set = (field: string, value: unknown) => {
    setForm((p) => ({ ...p, [field]: value }));
    if (errors[field]) setErrors((p) => ({ ...p, [field]: "" }));
  };

  const toggleTool = (key: string) =>
    setForm((p) => ({ ...p, tools: { ...p.tools, [key]: !p.tools[key] } }));

  const handleSave = async () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Name is required";
    if (form.max_steps < 1 || form.max_steps > 30) errs.max_steps = "Must be 1–30";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const res = await apiClient.put(`/api/v1/agents/${agent.id}`, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        model: form.model,
        instructions: form.instructions.trim() || null,
        memory_enabled: form.memory_enabled,
        max_steps: form.max_steps,
        is_active: form.is_active,
        webhook_url: form.webhook_url.trim() || null,
        tools: form.tools,
      });
      onUpdate(res.data.data);
      onClose();
    } catch {}
    setSaving(false);
  };

  const toggleMcp = async (server: MCPServer) => {
    await apiClient.patch(`/api/v1/mcp-servers/${server.id}`, { is_active: !server.is_active });
    loadMcp();
  };

  const deleteMcp = async (id: string) => {
    if (!confirm("Remove this MCP server?")) return;
    await apiClient.delete(`/api/v1/mcp-servers/${id}`);
    loadMcp();
  };

  const discoverTools = async (id: string) => {
    setLoadingMcpId(id);
    try {
      const res = await apiClient.get(`/api/v1/mcp-servers/${id}/tools`);
      setMcpTools((t) => ({ ...t, [id]: res.data.data || [] }));
    } catch {}
    setLoadingMcpId(null);
  };

  const enabledCount   = Object.values(form.tools).filter(Boolean).length;
  const activeMcpCount = mcpServers.filter((s) => s.is_active).length;
  const groupedTools   = TOOLS.reduce<Record<string, ToolConfig[]>>((acc, t) => {
    (acc[t.category] ??= []).push(t); return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-5 pb-0 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Settings className="h-4 w-4" />
              Configure — <span className="text-muted-foreground font-normal truncate max-w-[200px]">{form.name}</span>
            </DialogTitle>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col flex-1 overflow-hidden mt-4">
          <div className="px-5 shrink-0">
            <TabsList className="w-full h-9 gap-0.5 bg-muted p-1 rounded-lg overflow-x-auto flex">
              <TabsTrigger value="basic"    className="flex-1 text-xs h-7 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Settings className="h-3.5 w-3.5 mr-1 shrink-0" />Basic
              </TabsTrigger>
              <TabsTrigger value="model"   className="flex-1 text-xs h-7 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Brain className="h-3.5 w-3.5 mr-1 shrink-0" />Model
              </TabsTrigger>
              <TabsTrigger value="tools"   className="flex-1 text-xs h-7 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Zap className="h-3.5 w-3.5 mr-1 shrink-0" />Tools
                {enabledCount > 0 && <Badge className="ml-1 h-4 px-1 text-[9px]">{enabledCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="mcp"     className="flex-1 text-xs h-7 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Plug className="h-3.5 w-3.5 mr-1 shrink-0" />MCP
                {activeMcpCount > 0 && <Badge className="ml-1 h-4 px-1 text-[9px] bg-emerald-500">{activeMcpCount}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="advanced" className="flex-1 text-xs h-7 rounded-md data-[state=active]:bg-background data-[state=active]:shadow-sm">
                <Webhook className="h-3.5 w-3.5 mr-1 shrink-0" />
                <span className="hidden sm:inline">Advanced</span>
                <span className="sm:hidden">Adv</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Tab bodies — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">

            {/* ── Basic ─────────────────────────────────────────────────────── */}
            <TabsContent value="basic" className="mt-0 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Name <span className="text-destructive">*</span></Label>
                  <Input
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                    placeholder="e.g. Support Agent"
                    className={`text-sm ${errors.name ? "border-destructive" : ""}`}
                  />
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Status</Label>
                  <div className={`flex h-9 items-center justify-between rounded-lg border px-3 ${form.is_active ? "border-emerald-200 bg-emerald-50/50" : ""}`}>
                    <span className={`text-xs font-medium ${form.is_active ? "text-emerald-700" : "text-muted-foreground"}`}>
                      {form.is_active ? "Active" : "Inactive"}
                    </span>
                    <Switch checked={form.is_active} onCheckedChange={(v) => set("is_active", v)} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="What does this agent do?"
                  rows={2}
                  className="text-sm resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">System Instructions</Label>
                <Textarea
                  value={form.instructions}
                  onChange={(e) => set("instructions", e.target.value)}
                  placeholder="You are a helpful assistant. Use the web_search tool when asked about current events..."
                  rows={9}
                  className="text-xs font-mono resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  Define the agent's persona, goals, and how it should use its tools.
                </p>
              </div>
            </TabsContent>

            {/* ── Model ─────────────────────────────────────────────────────── */}
            <TabsContent value="model" className="mt-0 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">AI Model</Label>
                <Select value={form.model} onValueChange={(v) => set("model", v)}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value} className="text-sm">
                        {m.label}
                        {m.note && <Badge variant="outline" className="ml-2 text-[10px] px-1 py-0">{m.note}</Badge>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                {MODELS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => set("model", m.value)}
                    className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                      form.model === m.value ? "border-primary bg-primary/5" : "hover:bg-muted/40"
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-medium ${form.model === m.value ? "text-primary" : ""}`}>{m.label}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {m.note && <Badge variant="outline" className="text-[10px] px-1.5">{m.note}</Badge>}
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        form.model === m.value ? "border-primary bg-primary" : "border-muted-foreground/30"
                      }`}>
                        {form.model === m.value && <Check className="h-2.5 w-2.5 text-white" />}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3.5">
                <div>
                  <p className="text-sm font-medium">Max Steps</p>
                  <p className="text-xs text-muted-foreground">Tool-use iterations per run (1–30)</p>
                </div>
                <Input
                  type="number" min={1} max={30}
                  value={form.max_steps}
                  onChange={(e) => set("max_steps", Math.max(1, Math.min(30, parseInt(e.target.value) || 1)))}
                  className={`w-20 text-sm text-center ${errors.max_steps ? "border-destructive" : ""}`}
                />
              </div>

              <div className="flex items-center justify-between rounded-xl border p-3.5">
                <div>
                  <p className="text-sm font-medium">Persistent Memory</p>
                  <p className="text-xs text-muted-foreground">Remember context across conversations</p>
                </div>
                <Switch checked={form.memory_enabled} onCheckedChange={(v) => set("memory_enabled", v)} />
              </div>
            </TabsContent>

            {/* ── Tools ─────────────────────────────────────────────────────── */}
            <TabsContent value="tools" className="mt-0 space-y-4">
              {enabledCount === 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-700 dark:bg-amber-950/20 dark:border-amber-900 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  No tools enabled — agent will rely on its knowledge only.
                </div>
              )}
              {Object.entries(groupedTools).map(([cat, tools]) => (
                <div key={cat}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    {CATEGORY_LABELS[cat]}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {tools.map((tool) => {
                      const Icon = tool.icon;
                      const on = !!form.tools[tool.key];
                      return (
                        <button
                          key={tool.key}
                          type="button"
                          onClick={() => toggleTool(tool.key)}
                          className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                            on ? "border-primary/50 bg-primary/5" : "hover:border-muted-foreground/30 hover:bg-muted/30"
                          }`}
                        >
                          <Icon className={`h-4 w-4 shrink-0 ${on ? "text-primary" : "text-muted-foreground"}`} />
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-medium leading-tight ${on ? "text-primary" : ""}`}>{tool.label}</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug truncate">{tool.description}</p>
                          </div>
                          <div className={`h-4 w-4 shrink-0 rounded-full border-2 flex items-center justify-center ${
                            on ? "border-primary bg-primary" : "border-muted-foreground/30"
                          }`}>
                            {on && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </TabsContent>

            {/* ── MCP ───────────────────────────────────────────────────────── */}
            <TabsContent value="mcp" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">MCP Servers</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Active servers are automatically available to all agents
                  </p>
                </div>
                <Link href="/dashboard/settings/mcp" onClick={onClose}>
                  <Button variant="outline" size="sm" className="text-xs h-7">
                    <Plus className="h-3 w-3 mr-1" />Add
                    <ExternalLink className="h-2.5 w-2.5 ml-1 opacity-60" />
                  </Button>
                </Link>
              </div>

              {mcpServers.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-10 gap-3 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">No MCP servers configured</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                      Connect external tool servers to extend agent capabilities
                    </p>
                  </div>
                  <Link href="/dashboard/settings/mcp" onClick={onClose}>
                    <Button size="sm" variant="outline" className="text-xs">
                      <Plus className="h-3 w-3 mr-1" />Connect MCP Server
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 rounded-lg bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    Toggle servers on/off — active ones inject tools into this agent automatically.
                  </div>
                  {mcpServers.map((s) => (
                    <MCPCard
                      key={s.id}
                      server={s}
                      tools={mcpTools[s.id]}
                      loadingTools={loadingMcpId === s.id}
                      onToggle={() => toggleMcp(s)}
                      onDelete={() => deleteMcp(s.id)}
                      onDiscover={() => discoverTools(s.id)}
                    />
                  ))}
                  <p className="text-[11px] text-muted-foreground text-center pt-1">
                    {activeMcpCount} of {mcpServers.length} server{mcpServers.length !== 1 ? "s" : ""} active
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ── Advanced ──────────────────────────────────────────────────── */}
            <TabsContent value="advanced" className="mt-0 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Webhook URL</Label>
                <Input
                  value={form.webhook_url}
                  onChange={(e) => set("webhook_url", e.target.value)}
                  placeholder="https://your-server.com/agent-webhook"
                  type="url"
                  className="text-xs font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  Receive a POST after each run completes. Payload includes the full transcript.
                </p>
              </div>

              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                <p className="text-sm font-medium text-destructive">Danger Zone</p>
                <p className="text-xs text-muted-foreground">This action is permanent and cannot be undone.</p>
                <Button
                  variant="destructive" size="sm"
                  onClick={async () => {
                    if (!confirm("Delete this agent? This cannot be undone.")) return;
                    await apiClient.delete(`/api/v1/agents/${agent.id}`);
                    onClose();
                    window.location.href = "/dashboard/agents";
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />Delete Agent
                </Button>
              </div>
            </TabsContent>
          </div>

          {/* Footer */}
          <div className="shrink-0 flex items-center justify-between border-t px-5 py-3 bg-background">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className="min-w-[100px]">
              {saving
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
                : <><Check className="h-3.5 w-3.5 mr-1.5" />Save Changes</>}
            </Button>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
