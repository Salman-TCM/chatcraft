"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GitFork,
  Play,
  Pause,
  Copy,
  Trash2,
  Plus,
  Loader2,
  Clock,
  CheckCircle2,
  XCircle,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

interface FlowItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string | null;
  chatbot_id: string | null;
  updated_at: string;
}

const TRIGGER_LABELS: Record<string, string> = {
  keyword: "Keyword",
  webhook: "Webhook",
  manual: "Manual",
  opt_in: "Opt-in",
};

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/v1/flows");
      setFlows(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createFlow() {
    setCreating(true);
    try {
      const { data } = await apiClient.post("/api/v1/flows", { name: "Untitled Flow" });
      router.push(`/dashboard/flows/${data.data.id}/edit`);
    } finally {
      setCreating(false);
    }
  }

  async function toggleFlow(id: string, current: boolean) {
    await apiClient.post(`/api/v1/flows/${id}/toggle`);
    setFlows(prev => prev.map(f => f.id === id ? { ...f, is_active: !current } : f));
  }

  async function duplicateFlow(id: string) {
    const { data } = await apiClient.post(`/api/v1/flows/${id}/duplicate`);
    setFlows(prev => [data.data, ...prev]);
  }

  async function deleteFlow(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await apiClient.delete(`/api/v1/flows/${id}`);
    setFlows(prev => prev.filter(f => f.id !== id));
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Flow Builder</h1>
          <p className="text-sm text-muted-foreground">
            Visual drag-and-drop conversation automation
          </p>
        </div>
        <Button size="sm" onClick={createFlow} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          New Flow
        </Button>
      </div>

      {/* Empty state */}
      {flows.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <GitFork className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No flows yet</p>
          <p className="text-sm text-muted-foreground">
            Create your first flow to automate conversations
          </p>
          <Button size="sm" onClick={createFlow} disabled={creating}>
            <Plus className="h-4 w-4" /> Create Flow
          </Button>
        </Card>
      )}

      {/* Flow grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {flows.map((flow) => (
          <Card key={flow.id} className="flex flex-col gap-0 overflow-hidden">
            <div className="flex items-start justify-between p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      flow.is_active ? "bg-green-500" : "bg-muted-foreground/30"
                    }`}
                  />
                  <p className="truncate font-medium text-sm">{flow.name}</p>
                </div>
                {flow.description && (
                  <p className="mt-1 truncate text-xs text-muted-foreground">{flow.description}</p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {flow.trigger_type && (
                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {TRIGGER_LABELS[flow.trigger_type] ?? flow.trigger_type}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(flow.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center border-t bg-muted/30 px-3 py-2 gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 gap-1 text-xs flex-1"
                onClick={() => router.push(`/dashboard/flows/${flow.id}/edit`)}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title={flow.is_active ? "Pause" : "Activate"}
                onClick={() => toggleFlow(flow.id, flow.is_active)}
              >
                {flow.is_active
                  ? <Pause className="h-3.5 w-3.5 text-amber-600" />
                  : <Play className="h-3.5 w-3.5 text-green-600" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Duplicate"
                onClick={() => duplicateFlow(flow.id)}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                title="Delete"
                onClick={() => deleteFlow(flow.id, flow.name)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
