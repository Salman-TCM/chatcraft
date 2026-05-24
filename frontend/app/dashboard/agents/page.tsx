"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, Trash2, Settings2, Loader2,
  Globe, Code2, Chrome, Sheet, Mail, Link2,
  Smartphone, ShieldCheck, Zap, Circle, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  tools: Record<string, boolean>;
  is_published: boolean;
  is_active: boolean;
  max_steps: number;
  share_enabled: boolean;
  share_token: string | null;
  created_at: string;
}

const TOOL_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  web_search:   { icon: Globe,        label: "Web Search",    color: "text-blue-500" },
  browser:      { icon: Chrome,       label: "Browser",       color: "text-orange-500" },
  code:         { icon: Code2,        label: "Run Code",      color: "text-purple-500" },
  http:         { icon: Link2,        label: "HTTP",          color: "text-green-500" },
  sheets:       { icon: Sheet,        label: "Sheets",        color: "text-emerald-500" },
  email:        { icon: Mail,         label: "Email",         color: "text-rose-500" },
  sms:          { icon: Smartphone,   label: "SMS",           color: "text-violet-500" },
  verification: { icon: ShieldCheck,  label: "Verification",  color: "text-amber-500" },
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

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get("/api/v1/agents")
      .then(({ data }) => setAgents(data.data ?? []))
      .catch(() => setError("Failed to load agents. Please refresh."))
      .finally(() => setLoading(false));
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
      router.push(`/dashboard/agents/${data.data.id}`);
    } catch {
      setError("Failed to create agent. Please try again.");
      setCreating(false);
    }
  }

  async function deleteAgent(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    try {
      await apiClient.delete(`/api/v1/agents/${id}`);
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch {
      setError("Failed to delete agent.");
    }
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
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <button className="ml-2 underline text-xs" onClick={() => setError(null)}>Dismiss</button>
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
        <Button size="sm" onClick={createAgent} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Agent
        </Button>
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
              className="p-4 flex flex-col gap-3 cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
            >
              {/* Card header */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${agent.is_active ? "bg-indigo-100" : "bg-muted"}`}>
                    <Bot className={`h-4.5 w-4.5 ${agent.is_active ? "text-indigo-600" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{agent.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <Circle
                        className={`h-1.5 w-1.5 fill-current ${agent.is_active ? "text-green-500" : "text-muted-foreground/40"}`}
                      />
                      <span className="text-[10px] text-muted-foreground">
                        {agent.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => deleteAgent(e, agent.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-1 rounded"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
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
                  {agent.max_steps} steps max
                </span>
              </div>

              {/* Active tools */}
              {tools.length > 0 && (
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
              )}

              {tools.length === 0 && (
                <p className="text-[11px] text-muted-foreground/60 italic">No tools — instruction-only agent</p>
              )}

              {/* Footer */}
              <div className="pt-1 border-t flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={(e) => { e.stopPropagation(); router.push(`/dashboard/agents/${agent.id}`); }}
                >
                  <Settings2 className="h-3 w-3" />
                  Configure
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  title={agent.share_token ? "Open public preview" : "Enable sharing in Configure → Share tab"}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (agent.share_token) {
                      window.open(`/agent/${agent.share_token}`, "_blank");
                    } else {
                      router.push(`/dashboard/agents/${agent.id}?tab=share`);
                    }
                  }}
                >
                  <Eye className="h-3 w-3" />
                  Preview
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
