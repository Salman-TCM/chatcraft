"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Plus, Trash2, Settings2, Loader2,
  Globe, Code2, Chrome, Sheet, Mail, Link2,
  ToggleLeft, ToggleRight,
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
  created_at: string;
}

const TOOL_ICONS: Record<string, React.ElementType> = {
  web_search: Globe,
  browser: Chrome,
  code: Code2,
  http: Link2,
  sheets: Sheet,
  email: Mail,
};

const TOOL_LABELS: Record<string, string> = {
  web_search: "Web Search",
  browser: "Browser",
  code: "Code",
  http: "HTTP",
  sheets: "Sheets",
  email: "Email",
};

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
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(agent: Agent) {
    try {
      await apiClient.put(`/api/v1/agents/${agent.id}`, { is_active: !agent.is_active });
      setAgents(prev => prev.map(a => a.id === agent.id ? { ...a, is_active: !a.is_active } : a));
    } catch {
      setError("Failed to update agent.");
    }
  }

  async function deleteAgent(id: string) {
    if (!confirm("Delete this agent? This cannot be undone.")) return;
    try {
      await apiClient.delete(`/api/v1/agents/${id}`);
      setAgents(prev => prev.filter(a => a.id !== id));
    } catch {
      setError("Failed to delete agent.");
    }
  }

  const activeTools = (agent: Agent) =>
    Object.entries(agent.tools).filter(([, v]) => v).map(([k]) => k);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Agent Builder</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create autonomous AI agents with custom tools, instructions, and knowledge.
          </p>
        </div>
        <Button size="sm" onClick={createAgent} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Agent
        </Button>
      </div>

      {/* Empty state */}
      {agents.length === 0 && (
        <Card className="flex flex-col items-center justify-center py-16 text-center">
          <Bot className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="font-medium text-sm">No agents yet</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Build your first AI agent — give it tools, instructions, and a knowledge base.
          </p>
          <Button size="sm" className="mt-4" onClick={createAgent} disabled={creating}>
            <Plus className="h-3.5 w-3.5" />
            Create Agent
          </Button>
        </Card>
      )}

      {/* Agent cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {agents.map((agent) => {
          const tools = activeTools(agent);
          return (
            <Card key={agent.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100">
                    <Bot className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{agent.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {agent.model}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => toggleActive(agent)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title={agent.is_active ? "Deactivate" : "Activate"}
                  >
                    {agent.is_active
                      ? <ToggleRight className="h-5 w-5 text-green-500" />
                      : <ToggleLeft className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {agent.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{agent.description}</p>
              )}

              {/* Active tools */}
              {tools.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {tools.map((t) => {
                    const Icon = TOOL_ICONS[t] ?? Globe;
                    return (
                      <span key={t} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        <Icon className="h-2.5 w-2.5" />
                        {TOOL_LABELS[t] ?? t}
                      </span>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center gap-2 pt-1 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-1"
                  onClick={() => router.push(`/dashboard/agents/${agent.id}`)}
                >
                  <Settings2 className="h-3 w-3" />
                  Configure
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                  onClick={() => deleteAgent(agent.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
