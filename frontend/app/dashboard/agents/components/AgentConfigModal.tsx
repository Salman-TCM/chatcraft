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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Globe, Code2, Link2, Mail, Smartphone, ShieldCheck, Bot,
  Loader2, Check, Brain, Zap, Settings, Plug,
  Webhook, RefreshCw, Trash2, Plus, ExternalLink,
  AlertCircle, ChevronDown, ChevronUp, Wrench, Sheet, BookOpen, FilePenLine, Scale, Palette,
  ShoppingCart, X,
  Store, Key, TestTube2, TriangleAlert,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { AgentKnowledgeManager } from "./AgentKnowledgeManager";

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
  welcome_message: string | null;
  suggestions_enabled: boolean;
  primary_colour?: string;
  logo_url?: string | null;
  dark_mode?: boolean;
  show_branding?: boolean;
  font_family?: string;
  bubble_style?: string;
  placeholder_text?: string;
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

interface Store {
  id: string;
  name: string;
  slug: string;
  agent_id: string | null;
}

interface AgentFunction {
  id: string;
  name: string;
  description: string;
  parameters_schema: { type?: string; properties?: Record<string, unknown>; required?: string[] };
  webhook_url: string;
  webhook_method: string;
  has_headers: boolean;
  is_active: boolean;
}

interface ParamRow {
  name: string;
  type: "string" | "number" | "boolean";
  description: string;
  required: boolean;
}

const FUNCTION_TEMPLATES: {
  label: string; name: string; description: string; webhook_method: string; params: ParamRow[];
}[] = [
  {
    label: "Book a service",
    name: "book_service",
    description: "Book an appointment for a service at a given date and time.",
    webhook_method: "POST",
    params: [
      { name: "service", type: "string", description: "Which service to book", required: true },
      { name: "date", type: "string", description: "Preferred date (YYYY-MM-DD)", required: true },
      { name: "time", type: "string", description: "Preferred time", required: true },
      { name: "customer_name", type: "string", description: "Customer's full name", required: true },
      { name: "customer_email", type: "string", description: "Customer's email", required: true },
    ],
  },
  {
    label: "Create account",
    name: "create_account",
    description: "Create a new customer account.",
    webhook_method: "POST",
    params: [
      { name: "name", type: "string", description: "Full name", required: true },
      { name: "email", type: "string", description: "Email address", required: true },
      { name: "phone", type: "string", description: "Phone number", required: false },
    ],
  },
  {
    label: "Sell from external store",
    name: "purchase_product",
    description: "Buy a product from our store and start checkout. Use this instead of the "
      + "built-in commerce tools when products live on a separate platform.",
    webhook_method: "POST",
    params: [
      { name: "product_name", type: "string", description: "Name or SKU of the product", required: true },
      { name: "quantity", type: "number", description: "How many to buy", required: false },
      { name: "customer_email", type: "string", description: "Customer's email for the order", required: true },
    ],
  },
];

const EMPTY_FUNCTION_FORM = { name: "", description: "", webhook_method: "POST", webhook_url: "", credential_id: "" };
const EMPTY_RAW_SCHEMA = '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}';

function schemaFromParamRows(rows: ParamRow[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  rows.forEach((r) => {
    const name = r.name.trim();
    if (!name) return;
    properties[name] = { type: r.type, description: r.description };
    if (r.required) required.push(name);
  });
  return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/** Best-effort reverse of schemaFromParamRows. Returns null for any schema
 * shape the visual builder can't represent (nested objects, enums, arrays,
 * ...) so the caller falls back to raw-JSON editing instead of silently
 * dropping fields. */
function paramRowsFromSchema(schema: unknown): ParamRow[] | null {
  if (!schema || typeof schema !== "object") return null;
  const s = schema as { type?: string; properties?: Record<string, unknown>; required?: string[] };
  if (s.type !== "object" || !s.properties || typeof s.properties !== "object") return null;
  const required = Array.isArray(s.required) ? s.required : [];
  const rows: ParamRow[] = [];
  for (const [name, raw] of Object.entries(s.properties)) {
    if (!raw || typeof raw !== "object") return null;
    const v = raw as Record<string, unknown>;
    const extraKeys = Object.keys(v).filter((k) => k !== "type" && k !== "description");
    if (extraKeys.length > 0) return null;
    if (v.type !== "string" && v.type !== "number" && v.type !== "boolean") return null;
    rows.push({
      name,
      type: v.type,
      description: typeof v.description === "string" ? v.description : "",
      required: required.includes(name),
    });
  }
  return rows;
}

interface ProviderModels {
  provider: string;
  label: string;
  available: boolean;
  models: { id: string; name: string; allowed?: boolean }[];
  custom_model_input?: boolean;
}

const SELF_HOSTED_PREFIX = "self-hosted/";

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
  { key: "search_kb",    label: "Knowledge Base", description: "Search this agent's uploaded documents",      icon: BookOpen,    category: "research" },
  { key: "update_kb",    label: "Update Knowledge Base", description: "Create, replace, or append to a knowledge base document", icon: FilePenLine, category: "research" },
  { key: "code",         label: "Code Execution", description: "Execute Python code for data processing",     icon: Code2,       category: "compute" },
  { key: "faraid",       label: "Faraid Calculator", description: "Deterministic Islamic inheritance (Hanafi) share calculation", icon: Scale, category: "compute" },
  { key: "http",         label: "HTTP Requests",  description: "Make API calls to external services",         icon: Link2,       category: "integration" },
  { key: "sheets",       label: "Google Sheets",  description: "Read and write spreadsheet data",             icon: Sheet,       category: "integration" },
  { key: "commerce",     label: "Commerce",       description: "List products and hand out checkout links from a linked store", icon: ShoppingCart, category: "integration" },
  { key: "email",        label: "Email",          description: "Send emails via configured service",          icon: Mail,        category: "communication" },
  { key: "sms",          label: "SMS",            description: "Send text messages via Twilio",               icon: Smartphone,  category: "communication" },
  { key: "verification", label: "Verification",   description: "Send and verify OTP codes",                   icon: ShieldCheck, category: "communication" },
  { key: "agent_builder",label: "Agent Builder",  description: "Create and manage other agents",              icon: Bot,         category: "meta" },
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

// ─── Integration types & constants ────────────────────────────────────────────

interface IntegrationInfo {
  id: string;
  name: string;
  integration_type: "ecom_customer" | "ecom_admin";
  base_url: string;
  credential_id: string | null;
  auth_type: string;
  auth_header: string | null;
  has_credential: boolean;
  enabled_tool_groups: string[];
  enabled_tools: string[] | null;
  is_active: boolean;
  allow_destructive: boolean;
  health_status: "unknown" | "ok" | "error";
  last_tested_at: string | null;
  last_error: string | null;
}

interface CredentialInfo {
  id: string;
  name: string;
  auth_type: string;
  auth_header: string | null;
}

interface IntgDraft {
  id?: string;
  name: string;
  integration_type: "ecom_customer" | "ecom_admin";
  base_url: string;
  credential_id: string;
  new_cred_name: string;
  new_cred_auth_type: "none" | "api_key" | "bearer" | "basic";
  new_cred_auth_header: string;
  new_cred_value: string;
  enabled_tool_groups: string[];
  allow_destructive: boolean;
}

const INTEGRATION_TOOL_GROUPS: Record<"ecom_customer" | "ecom_admin", { key: string; label: string; count: number }[]> = {
  ecom_customer: [
    { key: "browse",     label: "Browse & Search",   count: 6 },
    { key: "cart",       label: "Cart & Checkout",   count: 5 },
    { key: "orders",     label: "Orders",            count: 5 },
    { key: "returns",    label: "Returns & Support", count: 4 },
    { key: "account",    label: "Account",           count: 3 },
    { key: "store_info", label: "Store Info",        count: 3 },
  ],
  ecom_admin: [
    { key: "catalog",     label: "Catalog",             count: 7 },
    { key: "pricing",     label: "Pricing",             count: 4 },
    { key: "orders",      label: "Orders",              count: 6 },
    { key: "customers",   label: "Customers",           count: 3 },
    { key: "inventory",   label: "Inventory & Reports", count: 3 },
    { key: "fulfillment", label: "Fulfillment",         count: 2 },
  ],
};

const BLANK_DRAFT: IntgDraft = {
  name: "",
  integration_type: "ecom_customer",
  base_url: "",
  credential_id: "",
  new_cred_name: "",
  new_cred_auth_type: "bearer",
  new_cred_auth_header: "",
  new_cred_value: "",
  enabled_tool_groups: [],
  allow_destructive: false,
};

function healthDot(status: string) {
  if (status === "ok")    return <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" title="Connected" />;
  if (status === "error") return <span className="h-2 w-2 rounded-full bg-destructive shrink-0" title="Error" />;
  return <span className="h-2 w-2 rounded-full bg-muted-foreground/40 shrink-0" title="Unknown" />;
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
    welcome_message: agent.welcome_message || "",
    suggestions_enabled: agent.suggestions_enabled,
    welcome_suggestions: ((agent as any).welcome_suggestions as string[] || []).join("\n"),
    tools: { ...agent.tools },
    primary_colour: agent.primary_colour || "#6366f1",
    logo_url: agent.logo_url || "",
    dark_mode: agent.dark_mode || false,
    show_branding: agent.show_branding ?? true,
    font_family: agent.font_family || "system-ui",
    bubble_style: agent.bubble_style || "rounded",
    placeholder_text: agent.placeholder_text || "",
  });
  const [saving, setSaving]           = useState(false);
  const [errors, setErrors]           = useState<Record<string, string>>({});
  const [activeTab, setActiveTab]     = useState("basic");

  const [mcpServers, setMcpServers]         = useState<MCPServer[]>([]);
  const [mcpTools, setMcpTools]             = useState<Record<string, MCPTool[]>>({});
  const [loadingMcpId, setLoadingMcpId]     = useState<string | null>(null);

  const [providers, setProviders]           = useState<ProviderModels[]>([]);
  const [modelsLoading, setModelsLoading]   = useState(true);

  const [stores, setStores]                 = useState<Store[]>([]);
  const [linkingStore, setLinkingStore]     = useState(false);

  const [customFunctions, setCustomFunctions] = useState<AgentFunction[]>([]);
  const [showAddFunction, setShowAddFunction] = useState(false);
  const [savingFunction, setSavingFunction]   = useState(false);
  const [editingFunctionId, setEditingFunctionId] = useState<string | null>(null);
  const [functionForm, setFunctionForm]       = useState(EMPTY_FUNCTION_FORM);
  const [paramRows, setParamRows]             = useState<ParamRow[]>([]);
  const [advancedJson, setAdvancedJson]       = useState(false);
  const [rawSchema, setRawSchema]             = useState(EMPTY_RAW_SCHEMA);
  const [headerRows, setHeaderRows]           = useState<{ key: string; value: string }[]>([]);
  const [functionError, setFunctionError]     = useState("");

  // Integrations tab state
  const [integrations, setIntegrations]     = useState<IntegrationInfo[]>([]);
  const [credentials, setCredentials]       = useState<CredentialInfo[]>([]);
  const [loadingIntg, setLoadingIntg]       = useState(false);
  const [expandedIntg, setExpandedIntg]     = useState<string | null>(null);
  const [intgDraft, setIntgDraft]           = useState<IntgDraft | null>(null);
  const [testingIntgId, setTestingIntgId]   = useState<string | null>(null);
  const [savingIntg, setSavingIntg]         = useState(false);
  const [intgError, setIntgError]           = useState("");

  const loadMcp = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/mcp-servers");
      setMcpServers(res.data.data || []);
    } catch {}
  }, []);

  const loadModels = useCallback(async () => {
    setModelsLoading(true);
    try {
      const res = await apiClient.get("/api/v1/models");
      setProviders(res.data.data || []);
    } catch {}
    setModelsLoading(false);
  }, []);

  const loadStores = useCallback(async () => {
    try {
      const res = await apiClient.get("/api/v1/stores");
      setStores(res.data.data || []);
    } catch {}
  }, []);

  const loadFunctions = useCallback(async () => {
    try {
      const res = await apiClient.get(`/api/agents/${agent.id}/functions`);
      setCustomFunctions(res.data.data || []);
    } catch {}
  }, [agent.id]);

  const loadIntegrations = useCallback(async () => {
    setLoadingIntg(true);
    try {
      const [intgRes, credRes] = await Promise.all([
        apiClient.get(`/api/v1/agents/${agent.id}/integrations`),
        apiClient.get(`/api/v1/agents/${agent.id}/credentials`),
      ]);
      setIntegrations(intgRes.data.data || []);
      setCredentials(credRes.data.data || []);
    } catch {}
    setLoadingIntg(false);
  }, [agent.id]);

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
        welcome_message: agent.welcome_message || "",
        suggestions_enabled: agent.suggestions_enabled,
        welcome_suggestions: ((agent as any).welcome_suggestions as string[] || []).join("\n"),
        tools: { ...agent.tools },
        primary_colour: agent.primary_colour || "#6366f1",
        logo_url: agent.logo_url || "",
        dark_mode: agent.dark_mode || false,
        show_branding: agent.show_branding ?? true,
        font_family: agent.font_family || "system-ui",
        bubble_style: agent.bubble_style || "rounded",
        placeholder_text: agent.placeholder_text || "",
      });
      setErrors({});
      setActiveTab("basic");
      setShowAddFunction(false);
      setEditingFunctionId(null);
      setFunctionForm(EMPTY_FUNCTION_FORM);
      setParamRows([]);
      setAdvancedJson(false);
      setRawSchema(EMPTY_RAW_SCHEMA);
      setHeaderRows([]);
      setFunctionError("");
      setIntegrations([]);
      setIntgDraft(null);
      setExpandedIntg(null);
      loadMcp();
      loadModels();
      loadStores();
      loadFunctions();
    }
  }, [agent, open, loadMcp, loadModels, loadStores, loadFunctions, loadIntegrations]);

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
        welcome_message: form.welcome_message.trim() || null,
        suggestions_enabled: form.suggestions_enabled,
        welcome_suggestions: form.welcome_suggestions.split("\n").map((s: string) => s.trim()).filter(Boolean).slice(0, 4),
        tools: form.tools,
        primary_colour: form.primary_colour || "#6366f1",
        logo_url: form.logo_url.trim() || null,
        dark_mode: form.dark_mode,
        show_branding: form.show_branding,
        font_family: form.font_family || "system-ui",
        bubble_style: form.bubble_style || "rounded",
        placeholder_text: form.placeholder_text.trim() || null,
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

  const linkedStore = stores.find((s) => s.agent_id === agent.id) || null;

  const linkStore = async (storeId: string) => {
    setLinkingStore(true);
    try {
      if (linkedStore) await apiClient.patch(`/api/v1/stores/${linkedStore.id}`, { agent_id: null });
      if (storeId) await apiClient.patch(`/api/v1/stores/${storeId}`, { agent_id: agent.id });
      await loadStores();
    } catch {}
    setLinkingStore(false);
  };

  const addHeaderRow = () => setHeaderRows((r) => [...r, { key: "", value: "" }]);
  const removeHeaderRow = (i: number) => setHeaderRows((r) => r.filter((_, idx) => idx !== i));
  const updateHeaderRow = (i: number, field: "key" | "value", val: string) =>
    setHeaderRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  const addParamRow = () =>
    setParamRows((r) => [...r, { name: "", type: "string", description: "", required: false }]);
  const removeParamRow = (i: number) => setParamRows((r) => r.filter((_, idx) => idx !== i));
  const updateParamRow = <K extends keyof ParamRow>(i: number, field: K, val: ParamRow[K]) =>
    setParamRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));

  const resetFunctionForm = () => {
    setFunctionForm(EMPTY_FUNCTION_FORM);
    setParamRows([]);
    setAdvancedJson(false);
    setRawSchema(EMPTY_RAW_SCHEMA);
    setHeaderRows([]);
    setFunctionError("");
    setEditingFunctionId(null);
  };

  const openAddForm = () => { resetFunctionForm(); setShowAddFunction(true); };

  const applyTemplate = (t: (typeof FUNCTION_TEMPLATES)[number]) => {
    setFunctionForm({
      name: t.name, description: t.description, webhook_method: t.webhook_method, webhook_url: "", credential_id: "",
    });
    setParamRows(t.params.map((p) => ({ ...p })));
    setAdvancedJson(false);
    setHeaderRows([]);
    setFunctionError("");
    setEditingFunctionId(null);
    setShowAddFunction(true);
  };

  const startEdit = (fn: AgentFunction) => {
    setFunctionForm({
      name: fn.name, description: fn.description,
      webhook_method: fn.webhook_method, webhook_url: fn.webhook_url,
      credential_id: (fn as any).credential_id || "",
    });
    const rows = paramRowsFromSchema(fn.parameters_schema);
    if (rows) {
      setParamRows(rows);
      setAdvancedJson(false);
    } else {
      setParamRows([]);
      setAdvancedJson(true);
      setRawSchema(JSON.stringify(fn.parameters_schema ?? {}, null, 2));
    }
    setHeaderRows([]);
    setFunctionError("");
    setEditingFunctionId(fn.id);
    setShowAddFunction(true);
  };

  const saveFunction = async () => {
    setFunctionError("");
    if (!functionForm.name.trim() || !functionForm.webhook_url.trim()) return;
    let parameters_schema: unknown;
    if (advancedJson) {
      try {
        parameters_schema = JSON.parse(rawSchema);
      } catch {
        setFunctionError("Parameters schema must be valid JSON.");
        return;
      }
    } else {
      parameters_schema = schemaFromParamRows(paramRows);
    }
    setSavingFunction(true);
    try {
      const webhook_headers = headerRows.reduce<Record<string, string>>((acc, r) => {
        if (r.key.trim()) acc[r.key.trim()] = r.value;
        return acc;
      }, {});
      const payload: Record<string, unknown> = {
        name: functionForm.name.trim(),
        description: functionForm.description.trim(),
        webhook_method: functionForm.webhook_method,
        webhook_url: functionForm.webhook_url.trim(),
        parameters_schema,
        credential_id: functionForm.credential_id || null,
      };
      if (Object.keys(webhook_headers).length) payload.webhook_headers = webhook_headers;

      if (editingFunctionId) {
        await apiClient.put(`/api/agents/${agent.id}/functions/${editingFunctionId}`, payload);
      } else {
        await apiClient.post(`/api/agents/${agent.id}/functions`, payload);
      }
      resetFunctionForm();
      setShowAddFunction(false);
      await loadFunctions();
    } catch (err) {
      const msg = (err as { response?: { data?: { detail?: { error?: string } } } })
        ?.response?.data?.detail?.error;
      setFunctionError(msg || "Could not save this tool.");
    }
    setSavingFunction(false);
  };

  const toggleFunction = async (fn: AgentFunction) => {
    await apiClient.post(`/api/agents/${agent.id}/functions/${fn.id}/toggle`);
    loadFunctions();
  };

  const deleteFunction = async (id: string) => {
    if (!confirm("Remove this custom tool?")) return;
    await apiClient.delete(`/api/agents/${agent.id}/functions/${id}`);
    loadFunctions();
  };

  // Lazy-load integrations the first time the tab is opened
  useEffect(() => {
    if (activeTab === "integrations" && integrations.length === 0 && !loadingIntg) {
      loadIntegrations();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

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
          <DialogTitle className="flex items-center gap-2 text-base">
            <Settings className="h-4 w-4" />
            Configure — <span className="text-muted-foreground font-normal truncate max-w-[200px]">{form.name}</span>
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex flex-col flex-1 overflow-hidden mt-4">
          <div className="px-5 shrink-0">
            <div className="flex flex-wrap gap-0.5 bg-muted p-1 rounded-lg">
              {[
                { v: "basic",     icon: <Settings  className="h-3.5 w-3.5 shrink-0" />, label: "Basic" },
                { v: "model",     icon: <Brain     className="h-3.5 w-3.5 shrink-0" />, label: "Model" },
                { v: "tools",     icon: <Zap       className="h-3.5 w-3.5 shrink-0" />, label: "Tools",
                  badge: enabledCount > 0 ? enabledCount : null },
                { v: "knowledge", icon: <BookOpen  className="h-3.5 w-3.5 shrink-0" />, label: "Knowledge" },
                { v: "mcp",       icon: <Plug      className="h-3.5 w-3.5 shrink-0" />, label: "MCP",
                  badge: activeMcpCount > 0 ? activeMcpCount : null, badgeGreen: true },
                { v: "design",    icon: <Palette   className="h-3.5 w-3.5 shrink-0" />, label: "Design" },
                { v: "integrations", icon: <Store  className="h-3.5 w-3.5 shrink-0" />, label: "APIs",
                  badge: integrations.filter(i => i.is_active).length || null, badgeGreen: true },
                { v: "advanced",  icon: <Webhook   className="h-3.5 w-3.5 shrink-0" />, label: "Advanced" },
              ].map(tab => (
                <button
                  key={tab.v}
                  type="button"
                  onClick={() => setActiveTab(tab.v)}
                  className={`flex-1 min-w-[60px] inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all ${
                    activeTab === tab.v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab.icon}{tab.label}
                  {tab.badge != null && (
                    <Badge className={`ml-0.5 h-4 px-1 text-[9px] ${(tab as any).badgeGreen ? "bg-emerald-500" : ""}`}>
                      {tab.badge}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab bodies — scrollable */}
          <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">

            {/* ── Basic ─────────────────────────────────────────────────────── */}
            {activeTab === "basic" && <div className="mt-0 space-y-4">
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
                <Label className="text-xs">Welcome Message</Label>
                <Textarea
                  value={form.welcome_message}
                  onChange={(e) => set("welcome_message", e.target.value)}
                  placeholder="Hi! How can I help you today?"
                  rows={2}
                  maxLength={500}
                  className="text-sm resize-none"
                />
                <p className="text-[11px] text-muted-foreground">
                  Shown as the agent's first message when a chat starts.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Quick Reply Suggestions <span className="text-muted-foreground font-normal">(with welcome message)</span></Label>
                <Textarea
                  value={form.welcome_suggestions}
                  onChange={(e) => set("welcome_suggestions", e.target.value)}
                  placeholder={"Find a product\nCheck my order\nShipping info\nContact support"}
                  rows={4}
                  className="text-sm resize-none font-mono"
                />
                <p className="text-[11px] text-muted-foreground">
                  One suggestion per line · max 4 · shown as tappable chips below the welcome message.
                </p>
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
            </div>}

            {/* ── Model ─────────────────────────────────────────────────────── */}
            {activeTab === "model" && <div className="mt-0 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs">AI Model</Label>
                {modelsLoading ? (
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs text-muted-foreground">
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
                        <Link href="/dashboard/settings/integrations" onClick={onClose} className="underline">
                          Integrations
                        </Link>{" "}
                        to enable model selection.
                      </p>
                    </div>
                  </div>
                ) : (
                  <Select value={form.model} onValueChange={(v) => set("model", v)}>
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
                              form.model.startsWith(SELF_HOSTED_PREFIX) && (
                                <SelectItem value={form.model} className="text-sm font-mono">
                                  {form.model.slice(SELF_HOSTED_PREFIX.length)}
                                </SelectItem>
                              )
                            ) : (
                              p.models.map((m) => (
                                <SelectItem
                                  key={m.id}
                                  value={m.id}
                                  disabled={m.allowed === false}
                                  className="text-sm"
                                >
                                  {m.name}
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
                )}
              </div>

              {!modelsLoading && providers.filter((p) => p.available).length > 0 && (
                <div className="space-y-4">
                  {providers
                    .filter((p) => p.available)
                    .map((p) => (
                      <div key={p.provider}>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          {p.label}
                        </p>
                        {p.custom_model_input ? (
                          <Input
                            type="text"
                            placeholder="Model name on your server, e.g. llama3.1:8b"
                            value={form.model.startsWith(SELF_HOSTED_PREFIX) ? form.model.slice(SELF_HOSTED_PREFIX.length) : ""}
                            onChange={(e) => set("model", SELF_HOSTED_PREFIX + e.target.value)}
                            className="text-sm font-mono"
                          />
                        ) : (
                          <div className="space-y-2">
                            {p.models.map((m) => {
                              const disabled = m.allowed === false;
                              const selected = form.model === m.id;
                              return (
                                <button
                                  key={m.id}
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => set("model", m.id)}
                                  className={`w-full flex items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors ${
                                    disabled
                                      ? "opacity-50 cursor-not-allowed"
                                      : selected
                                      ? "border-primary bg-primary/5"
                                      : "hover:bg-muted/40"
                                  }`}
                                >
                                  <div className="min-w-0">
                                    <p className={`text-sm font-medium truncate ${selected ? "text-primary" : ""}`}>
                                      {m.name}
                                    </p>
                                    <p className="text-[10px] text-muted-foreground font-mono truncate">
                                      {m.id}
                                    </p>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {disabled && (
                                      <Badge variant="outline" className="text-[10px] px-1.5">
                                        Upgrade
                                      </Badge>
                                    )}
                                    <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                                      selected ? "border-primary bg-primary" : "border-muted-foreground/30"
                                    }`}>
                                      {selected && <Check className="h-2.5 w-2.5 text-white" />}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border p-3.5">
                <div>
                  <p className="text-sm font-medium">Max Reasoning Turns</p>
                  <p className="text-xs text-muted-foreground">LLM think+tool-call rounds (1–30). Each round can fire multiple tools.</p>
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

              <div className="flex items-center justify-between rounded-xl border p-3.5">
                <div>
                  <p className="text-sm font-medium">Suggested Reply Buttons</p>
                  <p className="text-xs text-muted-foreground">
                    After each response, show 3-4 tappable follow-up suggestions
                  </p>
                </div>
                <Switch
                  checked={form.suggestions_enabled}
                  onCheckedChange={(v) => set("suggestions_enabled", v)}
                />
              </div>
            </div>}

            {/* ── Tools ─────────────────────────────────────────────────────── */}
            {activeTab === "tools" && <div className="mt-0 space-y-4">
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

              {/* Commerce store link */}
              {form.tools.commerce && (
                <div className="rounded-xl border p-3.5 space-y-2">
                  <div>
                    <p className="text-sm font-medium">Built-in Store</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Link one of your ChatCraft stores and the agent gets list_products,
                      buy_product, and check_order_status for free. Selling on a different
                      platform instead? Skip this and add a custom tool below — try the
                      &quot;Sell from external store&quot; quick start.
                    </p>
                  </div>
                  <Select
                    value={linkedStore?.id || "none"}
                    onValueChange={(v) => linkStore(v === "none" ? "" : v)}
                    disabled={linkingStore}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="No store linked" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No store linked</SelectItem>
                      {stores.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {stores.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      No stores yet —{" "}
                      <Link href="/dashboard/stores" onClick={onClose} className="underline">
                        create one
                      </Link>.
                    </p>
                  )}
                </div>
              )}

              {/* Custom webhook tools */}
              <div className="rounded-xl border p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Custom Tools</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Point a tool at your own API — a booking system, CRM, or an external
                      store. Runs only in authenticated chats, never on a public share link.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs h-7 shrink-0"
                    onClick={() => (showAddFunction ? setShowAddFunction(false) : openAddForm())}>
                    {showAddFunction
                      ? "Cancel"
                      : <><Plus className="h-3 w-3 mr-1" />Add</>}
                  </Button>
                </div>

                {customFunctions.length > 0 && (
                  <div className="space-y-1.5">
                    {customFunctions.map((fn) => (
                      <div key={fn.id} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${
                        fn.is_active ? "" : "opacity-50"
                      }`}>
                        <Webhook className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <button type="button" className="flex-1 min-w-0 text-left" onClick={() => startEdit(fn)}>
                          <p className="text-[11px] font-mono font-semibold truncate">{fn.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {fn.webhook_method} {fn.webhook_url}
                          </p>
                        </button>
                        <Switch checked={fn.is_active} onCheckedChange={() => toggleFunction(fn)} />
                        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => deleteFunction(fn.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {showAddFunction && (
                  <div className="rounded-lg bg-muted/30 border p-3 space-y-3">
                    {!editingFunctionId && (
                      <div className="space-y-1">
                        <Label className="text-[11px]">Quick start</Label>
                        <div className="flex flex-wrap gap-1.5">
                          {FUNCTION_TEMPLATES.map((t) => (
                            <Button key={t.name} type="button" size="sm" variant="outline"
                              className="h-6 text-[11px] px-2" onClick={() => applyTemplate(t)}>
                              {t.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[11px]">Tool name</Label>
                        <Input className="h-8 text-xs font-mono" placeholder="add_to_cart"
                          value={functionForm.name}
                          onChange={(e) => setFunctionForm((p) => ({ ...p, name: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Method</Label>
                        <Select value={functionForm.webhook_method}
                          onValueChange={(v) => setFunctionForm((p) => ({ ...p, webhook_method: v }))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="GET">GET</SelectItem>
                            <SelectItem value="POST">POST</SelectItem>
                            <SelectItem value="PUT">PUT</SelectItem>
                            <SelectItem value="PATCH">PATCH</SelectItem>
                            <SelectItem value="DELETE">DELETE</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">Description <span className="text-muted-foreground font-normal">(tells the model when to call this)</span></Label>
                      <Input className="h-8 text-xs" placeholder="Add a product to the customer's cart"
                        value={functionForm.description}
                        onChange={(e) => setFunctionForm((p) => ({ ...p, description: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px]">URL <span className="text-muted-foreground font-normal">(use {"{param}"} for path variables)</span></Label>
                      <Input className="h-8 text-xs font-mono" placeholder="https://api.mystore.com/cart/{id}/"
                        value={functionForm.webhook_url}
                        onChange={(e) => setFunctionForm((p) => ({ ...p, webhook_url: e.target.value }))} />
                      <p className="text-[10px] text-muted-foreground">
                        Path variables like {"{id}"} are substituted automatically from the model's inputs.
                      </p>
                    </div>

                    {/* Credential picker */}
                    <div className="space-y-1">
                      <Label className="text-[11px] flex items-center gap-1"><Key className="h-3 w-3" />Credential <span className="text-muted-foreground font-normal">(auto-injects auth header)</span></Label>
                      <Select value={functionForm.credential_id || "__none__"}
                        onValueChange={(v) => setFunctionForm((p) => ({ ...p, credential_id: v === "__none__" ? "" : v }))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="None" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__" className="text-xs">None (no authentication)</SelectItem>
                          {credentials.map(c => (
                            <SelectItem key={c.id} value={c.id} className="text-xs">{c.name} ({c.auth_type})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {credentials.length === 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          No credentials yet — add one in the <button type="button" className="underline" onClick={() => setActiveTab("integrations")}>APIs tab</button>.
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Custom headers <span className="text-muted-foreground font-normal">(optional — use credential above for auth)</span></Label>
                        <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={addHeaderRow}>
                          <Plus className="h-2.5 w-2.5 mr-1" />Add
                        </Button>
                      </div>
                      {editingFunctionId && headerRows.length === 0 && (
                        <p className="text-[10px] text-muted-foreground">
                          Leave empty to keep existing headers. Add a row to replace them.
                        </p>
                      )}
                      {headerRows.map((row, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Input className="h-7 text-[11px] font-mono" placeholder="X-Custom-Header"
                            value={row.key} onChange={(e) => updateHeaderRow(i, "key", e.target.value)} />
                          <Input className="h-7 text-[11px] font-mono" placeholder="value" type="password"
                            value={row.value} onChange={(e) => updateHeaderRow(i, "value", e.target.value)} />
                          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeHeaderRow(i)}>
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label className="text-[11px]">Parameters</Label>
                        <button type="button" className="text-[10px] text-muted-foreground underline"
                          onClick={() => setAdvancedJson((v) => !v)}>
                          {advancedJson ? "Use visual builder" : "Edit raw JSON"}
                        </button>
                      </div>
                      {advancedJson ? (
                        <Textarea className="text-[11px] font-mono min-h-[80px]"
                          value={rawSchema} onChange={(e) => setRawSchema(e.target.value)} />
                      ) : (
                        <div className="space-y-1.5">
                          {paramRows.length === 0 && (
                            <p className="text-[11px] text-muted-foreground">
                              No parameters — the tool takes no input.
                            </p>
                          )}
                          {paramRows.map((row, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <Input className="h-7 text-[11px] font-mono flex-1" placeholder="param_name"
                                value={row.name} onChange={(e) => updateParamRow(i, "name", e.target.value)} />
                              <Select value={row.type}
                                onValueChange={(v) => updateParamRow(i, "type", v as ParamRow["type"])}>
                                <SelectTrigger className="h-7 text-[11px] w-[90px] shrink-0"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="string">string</SelectItem>
                                  <SelectItem value="number">number</SelectItem>
                                  <SelectItem value="boolean">boolean</SelectItem>
                                </SelectContent>
                              </Select>
                              <Input className="h-7 text-[11px] flex-1" placeholder="description"
                                value={row.description} onChange={(e) => updateParamRow(i, "description", e.target.value)} />
                              <button type="button" title="Toggle required"
                                onClick={() => updateParamRow(i, "required", !row.required)}
                                className={`h-7 shrink-0 rounded-md border px-1.5 text-[10px] font-medium ${
                                  row.required ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground"
                                }`}>
                                {row.required ? "Req" : "Opt"}
                              </button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeParamRow(i)}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={addParamRow}>
                            <Plus className="h-2.5 w-2.5 mr-1" />Parameter
                          </Button>
                        </div>
                      )}
                    </div>
                    {functionError && (
                      <p className="text-[11px] text-destructive">{functionError}</p>
                    )}
                    <div className="flex justify-end gap-2 pt-1">
                      <Button size="sm" variant="ghost" className="text-xs h-7"
                        onClick={() => setShowAddFunction(false)}>Cancel</Button>
                      <Button size="sm" className="text-xs h-7" onClick={saveFunction} disabled={savingFunction}>
                        {savingFunction ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                        {editingFunctionId ? "Save changes" : "Save tool"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>}

            {/* ── Knowledge ─────────────────────────────────────────────────── */}
            {activeTab === "knowledge" && <div className="mt-0">
              <AgentKnowledgeManager agentId={agent.id} showTestSearch={false} />
            </div>}

            {/* ── MCP ───────────────────────────────────────────────────────── */}
            {activeTab === "mcp" && <div className="mt-0 space-y-4">
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
            </div>}

            {/* ── Advanced ──────────────────────────────────────────────────── */}
            {/* ── Design ────────────────────────────────────────────────────── */}
            {activeTab === "design" && <div className="mt-0 space-y-4">
              {/* Primary colour */}
              <div className="space-y-1.5">
                <Label className="text-xs">Primary Colour</Label>
                <div className="flex items-center gap-2">
                  <div className="relative h-8 w-8 shrink-0 rounded-lg border overflow-hidden cursor-pointer">
                    <input type="color" value={form.primary_colour}
                      onChange={e => set("primary_colour", e.target.value)}
                      className="absolute inset-0 w-full h-full cursor-pointer opacity-0" />
                    <div className="w-full h-full rounded-lg" style={{ backgroundColor: form.primary_colour }} />
                  </div>
                  <Input value={form.primary_colour} onChange={e => set("primary_colour", e.target.value)}
                    placeholder="#6366f1" maxLength={7} className="text-xs font-mono flex-1" />
                </div>
              </div>

              {/* Logo URL */}
              <div className="space-y-1.5">
                <Label className="text-xs">Logo URL</Label>
                <div className="flex items-center gap-2">
                  {form.logo_url && (
                    <img src={form.logo_url} alt="logo" className="h-8 w-8 rounded-lg object-cover shrink-0 border"
                      onError={e => (e.currentTarget.style.display = "none")} />
                  )}
                  <Input value={form.logo_url} onChange={e => set("logo_url", e.target.value)}
                    placeholder="https://example.com/logo.png" className="text-xs font-mono flex-1" />
                </div>
              </div>

              {/* Font */}
              <div className="space-y-1.5">
                <Label className="text-xs">Font</Label>
                <Select value={form.font_family} onValueChange={v => set("font_family", v)}>
                  <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["system-ui","Inter","Roboto","Open Sans","Lato","Poppins","Georgia","monospace"].map(f => (
                      <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Bubble style */}
              <div className="space-y-1.5">
                <Label className="text-xs">Message Bubble Style</Label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { key: "rounded", label: "Rounded", r: "12px" },
                    { key: "pill",    label: "Pill",    r: "9999px" },
                    { key: "square",  label: "Square",  r: "4px" },
                  ].map(({ key, label, r }) => (
                    <button key={key} type="button" onClick={() => set("bubble_style", key)}
                      className={`border rounded-lg p-2 flex flex-col items-center gap-1.5 transition-all ${
                        form.bubble_style === key ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
                      }`}>
                      <div className="px-2.5 py-1 text-[10px] font-medium text-white"
                        style={{ backgroundColor: form.primary_colour, borderRadius: r }}>Hi</div>
                      <span className="text-[10px] font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Placeholder */}
              <div className="space-y-1.5">
                <Label className="text-xs">Input Placeholder</Label>
                <Input value={form.placeholder_text} onChange={e => set("placeholder_text", e.target.value)}
                  placeholder="Type a message…" maxLength={200} className="text-xs" />
              </div>

              {/* Dark mode */}
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-xs font-medium">Dark Mode</p>
                  <p className="text-[11px] text-muted-foreground">Use dark background on public page</p>
                </div>
                <Switch checked={form.dark_mode} onCheckedChange={v => set("dark_mode", v)} />
              </div>

              {/* Show branding */}
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="text-xs font-medium">Show "Powered by" Branding</p>
                  <p className="text-[11px] text-muted-foreground">Display footer link on public page</p>
                </div>
                <Switch checked={form.show_branding} onCheckedChange={v => set("show_branding", v)} />
              </div>
            </div>}

            {/* ── Integrations (APIs) ───────────────────────────────────────── */}
            {activeTab === "integrations" && <div className="mt-0 space-y-3">

              {/* Header */}
              <div className="rounded-xl border bg-muted/30 p-3 space-y-1">
                <p className="text-xs font-medium flex items-center gap-1.5"><Key className="h-3.5 w-3.5 text-primary" />API Credentials</p>
                <p className="text-[11px] text-muted-foreground">
                  Store API keys and tokens here. Select them in <button type="button" className="underline font-medium" onClick={() => setActiveTab("tools")}>Custom Tools</button> to auto-inject auth on every request — the value is encrypted and never exposed to the model.
                </p>
              </div>

              {/* Credential list */}
              {loadingIntg
                ? <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />Loading…
                  </div>
                : <>
                  {credentials.length === 0 && !intgDraft && (
                    <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                      <Key className="h-8 w-8 opacity-20" />
                      <p className="text-xs">No credentials yet.</p>
                      <p className="text-[11px]">Add one to use in your Custom Tools.</p>
                    </div>
                  )}

                  {credentials.map(cred => (
                    <div key={cred.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                        <Key className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{cred.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {cred.auth_type === "bearer" ? "Bearer token" :
                           cred.auth_type === "api_key" ? `API key — ${cred.auth_header || "X-Api-Key"}` :
                           cred.auth_type === "basic" ? "Basic auth" : "No auth"} · ••••••••
                        </p>
                      </div>
                      <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive shrink-0"
                        onClick={async () => {
                          if (!confirm(`Delete credential "${cred.name}"?`)) return;
                          await apiClient.delete(`/api/v1/agents/${agent.id}/credentials/${cred.id}`);
                          setCredentials(prev => prev.filter(c => c.id !== cred.id));
                        }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}

                  {/* Add credential form */}
                  {intgDraft && (
                    <div className="rounded-xl border-2 border-dashed border-primary/30 p-3 space-y-2.5">
                      <p className="text-xs font-medium text-primary">New Credential</p>
                      {intgError && <div className="text-xs text-destructive bg-destructive/5 rounded-lg p-2">{intgError}</div>}
                      <div className="space-y-1">
                        <Label className="text-[11px]">Name</Label>
                        <Input value={intgDraft.new_cred_name}
                          onChange={e => setIntgDraft(d => d && ({...d, new_cred_name: e.target.value}))}
                          className="text-xs h-8" placeholder="My Store Bearer Token" />
                      </div>
                      <div className="grid grid-cols-2 gap-1.5">
                        <div className="space-y-1">
                          <Label className="text-[11px]">Auth type</Label>
                          <Select value={intgDraft.new_cred_auth_type}
                            onValueChange={v => setIntgDraft(d => d && ({...d, new_cred_auth_type: v as "none"|"api_key"|"bearer"|"basic"}))}>
                            <SelectTrigger className="text-xs h-8"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bearer"  className="text-xs">Bearer Token</SelectItem>
                              <SelectItem value="api_key" className="text-xs">API Key (header)</SelectItem>
                              <SelectItem value="basic"   className="text-xs">Basic Auth</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {intgDraft.new_cred_auth_type === "api_key" && (
                          <div className="space-y-1">
                            <Label className="text-[11px]">Header name</Label>
                            <Input value={intgDraft.new_cred_auth_header}
                              onChange={e => setIntgDraft(d => d && ({...d, new_cred_auth_header: e.target.value}))}
                              className="text-xs h-8" placeholder="X-Api-Key" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[11px]">Value</Label>
                        <Input type="password" value={intgDraft.new_cred_value}
                          onChange={e => setIntgDraft(d => d && ({...d, new_cred_value: e.target.value}))}
                          className="text-xs h-8 font-mono" placeholder="Token / key / username:password" />
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" className="flex-1 text-xs h-8" disabled={savingIntg}
                          onClick={async () => {
                            if (!intgDraft?.new_cred_name || !intgDraft.new_cred_value) return;
                            setIntgError(""); setSavingIntg(true);
                            try {
                              const res = await apiClient.post(`/api/v1/agents/${agent.id}/credentials`, {
                                name: intgDraft.new_cred_name,
                                auth_type: intgDraft.new_cred_auth_type,
                                auth_header: intgDraft.new_cred_auth_header || null,
                                auth_value: intgDraft.new_cred_value,
                              });
                              setCredentials(c => [...c, res.data.data]);
                              setIntgDraft(null);
                            } catch (e: any) {
                              setIntgError(e?.response?.data?.detail || "Failed to save credential");
                            }
                            setSavingIntg(false);
                          }}>
                          {savingIntg ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                          Save Credential
                        </Button>
                        <Button size="sm" variant="outline" className="text-xs h-8"
                          onClick={() => { setIntgDraft(null); setIntgError(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}

                  {!intgDraft && (
                    <Button size="sm" variant="outline" className="w-full text-xs h-8 border-dashed"
                      onClick={() => {
                        if (credentials.length === 0) loadIntegrations();
                        setIntgDraft({ ...BLANK_DRAFT });
                        setIntgError("");
                      }}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" />Add Credential
                    </Button>
                  )}
                </>
              }
            </div>}


            {activeTab === "advanced" && <div className="mt-0 space-y-4">
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
            </div>}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
