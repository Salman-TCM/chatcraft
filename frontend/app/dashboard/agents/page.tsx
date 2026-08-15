"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, Settings2, Loader2,
  Globe, Code2, Chrome, Sheet, Mail, Link2,
  Smartphone, ShieldCheck, Zap, Circle, Play,
  MoreHorizontal, ExternalLink, MessageCircle, PanelRight,
  Mic, LayoutTemplate, Copy, QrCode, PauseCircle, PlayCircle,
  Trash2, Check, BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import { AgentConfigModal } from "./components/AgentConfigModal";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  tools: Record<string, boolean>;
  instructions: string | null;
  memory_enabled: boolean;
  max_steps: number;
  is_published: boolean;
  is_active: boolean;
  share_enabled: boolean;
  share_token: string | null;
  webhook_url: string | null;
  welcome_message: string | null;
  suggestions_enabled: boolean;
  created_at: string;
}

type EmbedType = "direct" | "bubble" | "sidetab" | "voice" | "iframe";

interface EmbedModal {
  agent: Agent;
  type: EmbedType;
}

const TOOL_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  web_search:    { icon: Globe,        label: "Web Search",    color: "text-blue-500" },
  browser:       { icon: Chrome,       label: "Browser",       color: "text-orange-500" },
  search_kb:     { icon: BookOpen,     label: "Knowledge Base",color: "text-teal-500" },
  code:          { icon: Code2,        label: "Run Code",      color: "text-purple-500" },
  http:          { icon: Link2,        label: "HTTP",          color: "text-green-500" },
  sheets:        { icon: Sheet,        label: "Sheets",        color: "text-emerald-500" },
  email:         { icon: Mail,         label: "Email",         color: "text-rose-500" },
  sms:           { icon: Smartphone,   label: "SMS",           color: "text-violet-500" },
  verification:  { icon: ShieldCheck,  label: "Verification",  color: "text-amber-500" },
  agent_builder: { icon: Bot,          label: "Agent Builder", color: "text-sky-500" },
};

function modelShortName(model: string) {
  if (model.startsWith("claude-opus"))   return "Opus";
  if (model.startsWith("claude-sonnet")) return "Sonnet";
  if (model.startsWith("claude-haiku"))  return "Haiku";
  if (model.startsWith("gpt-4o-mini"))   return "GPT-4o mini";
  if (model.startsWith("gpt-4o"))        return "GPT-4o";
  if (model.startsWith("gemini"))        return model.replace("gemini-", "Gemini ");
  return model;
}

function modelBadgeColor(model: string) {
  if (model.startsWith("claude"))  return "bg-indigo-100 text-indigo-700";
  if (model.startsWith("gpt"))     return "bg-emerald-100 text-emerald-700";
  if (model.startsWith("gemini"))  return "bg-blue-100 text-blue-700";
  return "bg-muted text-muted-foreground";
}

const POSITION_OPTIONS = [
  { value: "bottom-right", label: "Bottom Right" },
  { value: "bottom-left",  label: "Bottom Left"  },
  { value: "top-right",    label: "Top Right"    },
  { value: "top-left",     label: "Top Left"     },
  { value: "center-right", label: "Center Right" },
  { value: "center-left",  label: "Center Left"  },
];

function getEmbedContent(agent: Agent, type: EmbedType, position = "bottom-right"): { title: string; description: string; code: string } | null {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://yourplatform.com";

  if (!agent.share_token || !agent.share_enabled) {
    return null;
  }

  const shareUrl = `${origin}/agent/${agent.share_token}`;

  switch (type) {
    case "direct":
      return {
        title: "Direct Link",
        description: "Share this URL directly with users to open the agent in a full-page view.",
        code: shareUrl,
      };
    case "bubble":
      return {
        title: "Floating Bubble",
        description: "Add a floating chat bubble to any website. Paste before </body>.",
        code: `<script
  src="${origin}/widget.js"
  data-agent-token="${agent.share_token}"
  data-type="bubble"
  data-position="${position}">
</script>`,
      };
    case "sidetab":
      return {
        title: "Side Tab",
        description: "A clickable tab on the edge of the page that slides open a chat panel.",
        code: `<script
  src="${origin}/widget.js"
  data-agent-token="${agent.share_token}"
  data-type="sidetab"
  data-label="Chat with us">
</script>`,
      };
    case "voice":
      return {
        title: "Voice Launcher",
        description: "A microphone button that opens a voice conversation with the agent.",
        code: `<script
  src="${origin}/widget.js"
  data-agent-token="${agent.share_token}"
  data-type="voice-launcher"
  data-position="${position}">
</script>`,
      };
    case "iframe":
      return {
        title: "iFrame Embed",
        description: "Embed the agent inside any page using an inline iFrame.",
        code: `<iframe
  src="${origin}/agent/${agent.share_token}"
  width="400"
  height="600"
  frameborder="0"
  allow="microphone">
</iframe>`,
      };
  }
}

// ─── Embed Modal ─────────────────────────────────────────────────────────────

const POSITION_NEEDS_SELECTOR: EmbedType[] = ["bubble", "voice"];

function EmbedDialog({
  modal,
  onClose,
}: {
  modal: EmbedModal;
  onClose: () => void;
}) {
  const [copied, setCopied]     = useState(false);
  const [position, setPosition] = useState("bottom-right");

  const showPositionPicker = POSITION_NEEDS_SELECTOR.includes(modal.type);
  const content = getEmbedContent(modal.agent, modal.type, position);

  const copy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{content?.title ?? "Sharing not enabled"}</DialogTitle>
          <DialogDescription>
            {content?.description ?? "Enable sharing for this agent first via Configure → share settings."}
          </DialogDescription>
        </DialogHeader>
        {content ? (
          <div className="space-y-3">
            {showPositionPicker && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Widget Position</p>
                <div className="grid grid-cols-3 gap-1.5">
                  {POSITION_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPosition(opt.value)}
                      className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        position === opt.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-muted-foreground/40 text-muted-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
              {content.code}
            </pre>
            <Button className="w-full" onClick={copy}>
              {copied ? (
                <><Check className="h-4 w-4 mr-2" /> Copied!</>
              ) : (
                <><Copy className="h-4 w-4 mr-2" /> Copy {modal.type === "direct" ? "Link" : "Code"}</>
              )}
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── QR Code Modal ───────────────────────────────────────────────────────────

function QrDialog({ agent, onClose }: { agent: Agent; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = agent.share_token && agent.share_enabled
    ? `${origin}/agent/${agent.share_token}`
    : null;
  const qrSrc = shareUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shareUrl)}`
    : null;

  const copy = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Code — {agent.name}</DialogTitle>
          <DialogDescription>
            {shareUrl ? "Scan to open this agent on any device." : "Enable sharing for this agent first."}
          </DialogDescription>
        </DialogHeader>
        {shareUrl && qrSrc ? (
          <div className="flex flex-col items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrSrc} alt="QR Code" className="rounded-lg border w-48 h-48" />
            <div className="w-full space-y-2">
              <p className="text-xs text-muted-foreground text-center break-all">{shareUrl}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={copy}>
                  {copied ? <><Check className="h-3.5 w-3.5 mr-1.5" /> Copied</> : <><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy URL</>}
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <a href={qrSrc} download={`qr-${agent.name}.png`}>
                    <QrCode className="h-3.5 w-3.5 mr-1.5" /> Download
                  </a>
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Options Dropdown ────────────────────────────────────────────────────────

function AgentOptionsMenu({
  agent,
  onEmbed,
  onQr,
  onDuplicate,
  onTogglePause,
  onDelete,
}: {
  agent: Agent;
  onEmbed: (type: EmbedType) => void;
  onQr: () => void;
  onDuplicate: () => void;
  onTogglePause: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-7 px-0 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-52"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Custom GPT submenu */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2">
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
            Custom GPT
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground pb-1">
              Deploy as
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => onEmbed("direct")} className="gap-2">
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
              Direct Link
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEmbed("bubble")} className="gap-2">
              <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
              Floating Bubble
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEmbed("sidetab")} className="gap-2">
              <PanelRight className="h-3.5 w-3.5 text-muted-foreground" />
              Side Tab
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEmbed("voice")} className="gap-2">
              <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              Voice Launcher
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEmbed("iframe")} className="gap-2">
              <LayoutTemplate className="h-3.5 w-3.5 text-muted-foreground" />
              iFrame
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={onDuplicate} className="gap-2">
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
          Duplicate
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onQr} className="gap-2">
          <QrCode className="h-3.5 w-3.5 text-muted-foreground" />
          QR Code
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onTogglePause} className="gap-2">
          {agent.is_active ? (
            <><PauseCircle className="h-3.5 w-3.5 text-muted-foreground" /> Pause Bot</>
          ) : (
            <><PlayCircle className="h-3.5 w-3.5 text-green-500" /> Resume Bot</>
          )}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          onClick={onDelete}
          className="gap-2 text-destructive focus:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [configAgent, setConfigAgent] = useState<Agent | null>(null);

  // Modals
  const [embedModal, setEmbedModal] = useState<EmbedModal | null>(null);
  const [qrAgent, setQrAgent] = useState<Agent | null>(null);

  async function loadAgents() {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/v1/agents");
      setAgents(data.data ?? []);
    } catch {
      setError("Failed to load agents. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
    const onVisible = () => { if (document.visibilityState === "visible") loadAgents(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  async function createAgent() {
    setCreating(true);
    try {
      const { data } = await apiClient.post("/api/v1/agents", {
        name: "New Agent",
        model: "claude-sonnet-4-6",
        tools: {},
        max_steps: 10,
      });
      setAgents(prev => [data.data, ...prev]);
      setConfigAgent(data.data);
    } catch {
      setError("Failed to create agent. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function duplicateAgent(agent: Agent) {
    try {
      const { data } = await apiClient.post("/api/v1/agents", {
        name: `${agent.name} (Copy)`,
        description: agent.description,
        model: agent.model,
        instructions: agent.instructions,
        memory_enabled: agent.memory_enabled,
        max_steps: agent.max_steps,
        tools: agent.tools,
      });
      setAgents(prev => [data.data, ...prev]);
    } catch {
      setError("Failed to duplicate agent.");
    }
  }

  async function togglePause(agent: Agent) {
    try {
      const { data } = await apiClient.put(`/api/v1/agents/${agent.id}`, {
        is_active: !agent.is_active,
      });
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_active: data.data.is_active } : a));
    } catch {
      setError("Failed to update agent status.");
    }
  }

  async function deleteAgent(agent: Agent) {
    if (!confirm(`Delete "${agent.name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/api/v1/agents/${agent.id}`);
      setAgents(prev => prev.filter(a => a.id !== agent.id));
    } catch {
      setError("Failed to delete agent.");
    }
  }

  function handleAgentUpdated(updated: Agent) {
    setAgents(prev => prev.map(a => a.id === updated.id ? { ...a, ...updated } : a));
    setConfigAgent(null);
  }

  const enabledTools = (agent: Agent) =>
    Object.entries(agent.tools).filter(([, v]) => v).map(([k]) => k);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive flex items-center justify-between">
          {error}
          <button className="underline text-xs ml-2" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agent Builder</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Build autonomous AI agents with tools, instructions, and knowledge.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={loadAgents} disabled={loading}>
            <Loader2 className={`h-4 w-4 ${loading ? "animate-spin" : "opacity-0 w-0"}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={createAgent} disabled={creating}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            New Agent
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {agents.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 mb-4">
            <Bot className="h-8 w-8 text-indigo-400" />
          </div>
          <h3 className="font-semibold text-sm">No agents yet</h3>
          <p className="text-xs text-muted-foreground mt-1.5 max-w-sm">
            Create an AI agent — give it tools like web search, code execution, or HTTP requests,
            write its instructions, and test it right away.
          </p>
          <Button size="sm" className="mt-5" onClick={createAgent} disabled={creating}>
            <Plus className="h-3.5 w-3.5" />
            Create your first agent
          </Button>
        </Card>
      )}

      {/* Agent grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => {
          const tools = enabledTools(agent);

          return (
            <Card
              key={agent.id}
              className="p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setConfigAgent(agent)}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${agent.is_active ? "bg-indigo-100" : "bg-muted"}`}>
                    <Bot className={`h-4.5 w-4.5 ${agent.is_active ? "text-indigo-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="font-semibold text-sm truncate">{agent.name}</p>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Circle
                        className={`h-1.5 w-1.5 fill-current ${agent.is_active ? "text-green-500" : "text-amber-400"}`}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {agent.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description */}
              {agent.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
              )}

              {/* Model badge + step count */}
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${modelBadgeColor(agent.model)}`}>
                  {modelShortName(agent.model)}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Zap className="h-2.5 w-2.5" />
                  {agent.max_steps} turns max
                </span>
              </div>

              {/* Active tools */}
              {tools.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {tools.map((t) => {
                    const meta = TOOL_META[t];
                    if (!meta) return null;
                    const Icon = meta.icon;
                    return (
                      <span
                        key={t}
                        className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
                      >
                        <Icon className={`h-2.5 w-2.5 ${meta.color}`} />
                        {meta.label}
                      </span>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground/60 italic">No tools — instruction-only agent</p>
              )}

              {/* Footer */}
              <div className="pt-1 border-t flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={(e) => { e.stopPropagation(); setConfigAgent(agent); }}
                >
                  <Settings2 className="h-3 w-3" />
                  Configure
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/agents/run/${agent.id}`); }}
                >
                  <Play className="h-3 w-3" />
                  Run
                </Button>
                <AgentOptionsMenu
                  agent={agent}
                  onEmbed={(type) => setEmbedModal({ agent, type })}
                  onQr={() => setQrAgent(agent)}
                  onDuplicate={() => duplicateAgent(agent)}
                  onTogglePause={() => togglePause(agent)}
                  onDelete={() => deleteAgent(agent)}
                />
              </div>
            </Card>
          );
        })}
      </div>

      {/* Config modal */}
      {configAgent && (
        <AgentConfigModal
          agent={configAgent}
          open={true}
          onClose={() => setConfigAgent(null)}
          onUpdate={handleAgentUpdated}
        />
      )}

      {/* Embed modal */}
      {embedModal && (
        <EmbedDialog
          modal={embedModal}
          onClose={() => setEmbedModal(null)}
        />
      )}

      {/* QR Code modal */}
      {qrAgent && (
        <QrDialog
          agent={qrAgent}
          onClose={() => setQrAgent(null)}
        />
      )}
    </div>
  );
}
