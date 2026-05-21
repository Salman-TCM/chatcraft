"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Zap, Plus, Loader2, Pencil, Trash2, ToggleLeft, ToggleRight, X, Check,
  ChevronDown, ChevronRight, History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Automation {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_config: Record<string, string>;
  action_type: string;
  action_config: Record<string, string>;
  enabled: boolean;
  execution_count: number;
  last_executed_at: string | null;
}

interface AutomationRun {
  id: string;
  trigger_type: string;
  action_type: string;
  status: "success" | "failed";
  error: string | null;
  executed_at: string;
}

const TRIGGERS: { value: string; label: string }[] = [
  { value: "new_contact",           label: "New Contact" },
  { value: "tag_added",             label: "Tag Added" },
  { value: "field_updated",         label: "Field Updated" },
  { value: "conversation_opened",   label: "Conversation Opened" },
  { value: "conversation_closed",   label: "Conversation Closed" },
  { value: "pipeline_stage_changed",label: "Pipeline Stage Changed" },
  { value: "payment_received",      label: "Payment Received" },
  { value: "form_submitted",        label: "Form Submitted" },
];

const ACTIONS: { value: string; label: string }[] = [
  { value: "trigger_flow",    label: "Trigger Flow" },
  { value: "send_message",    label: "Send Message" },
  { value: "add_tag",         label: "Add Tag" },
  { value: "set_field",       label: "Set Custom Field" },
  { value: "add_to_pipeline", label: "Add to Pipeline" },
  { value: "send_webhook",    label: "Send Webhook" },
];

const TRIGGER_COLORS: Record<string, string> = {
  new_contact: "bg-green-100 text-green-700",
  tag_added: "bg-purple-100 text-purple-700",
  field_updated: "bg-blue-100 text-blue-700",
  conversation_opened: "bg-sky-100 text-sky-700",
  conversation_closed: "bg-slate-100 text-slate-700",
  pipeline_stage_changed: "bg-orange-100 text-orange-700",
  payment_received: "bg-emerald-100 text-emerald-700",
  form_submitted: "bg-pink-100 text-pink-700",
};

const ACTION_COLORS: Record<string, string> = {
  trigger_flow: "bg-indigo-100 text-indigo-700",
  send_message: "bg-blue-100 text-blue-700",
  add_tag: "bg-purple-100 text-purple-700",
  set_field: "bg-cyan-100 text-cyan-700",
  add_to_pipeline: "bg-amber-100 text-amber-700",
  send_webhook: "bg-teal-100 text-teal-700",
};

const EMPTY: Partial<Automation> = {
  name: "",
  description: "",
  trigger_type: "new_contact",
  trigger_config: {},
  action_type: "send_message",
  action_config: {},
  enabled: true,
};

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<Partial<Automation> | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Record<string, AutomationRun[]>>({});
  const [runsLoading, setRunsLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/v1/automations");
      setAutomations(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleHistory(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!runs[id]) {
      setRunsLoading(id);
      try {
        const { data } = await apiClient.get(`/api/v1/automations/${id}/runs`);
        setRuns((prev) => ({ ...prev, [id]: data.data }));
      } finally {
        setRunsLoading(null);
      }
    }
  }

  function openCreate() { setModal({ ...EMPTY }); }
  function openEdit(a: Automation) { setModal({ ...a }); }

  async function save() {
    if (!modal) return;
    setSaving(true);
    try {
      if (modal.id) {
        const { data } = await apiClient.patch(`/api/v1/automations/${modal.id}`, modal);
        setAutomations(prev => prev.map(a => a.id === modal.id ? data.data : a));
      } else {
        const { data } = await apiClient.post("/api/v1/automations", modal);
        setAutomations(prev => [data.data, ...prev]);
      }
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string) {
    const { data } = await apiClient.post(`/api/v1/automations/${id}/toggle`);
    setAutomations(prev => prev.map(a => a.id === id ? { ...a, enabled: data.data.enabled } : a));
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete automation "${name}"?`)) return;
    await apiClient.delete(`/api/v1/automations/${id}`);
    setAutomations(prev => prev.filter(a => a.id !== id));
  }

  function setField(key: string, val: any) {
    setModal(prev => prev ? { ...prev, [key]: val } : prev);
  }

  function labelOf(arr: { value: string; label: string }[], val: string) {
    return arr.find(x => x.value === val)?.label ?? val;
  }

  if (loading) return (
    <div className="flex h-64 items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Automations</h1>
          <p className="text-sm text-muted-foreground">Event-driven actions that fire automatically</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> New Automation</Button>
      </div>

      {automations.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <Zap className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No automations yet</p>
          <p className="text-sm text-muted-foreground">Automate repetitive tasks based on events</p>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Create Automation</Button>
        </Card>
      )}

      <div className="space-y-3">
        {automations.map(a => (
          <Card key={a.id} className="overflow-hidden">
            <div className="flex items-center gap-4 p-4">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm truncate">{a.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${TRIGGER_COLORS[a.trigger_type] ?? "bg-muted text-muted-foreground"}`}>
                    {labelOf(TRIGGERS, a.trigger_type)}
                  </span>
                  <span className="text-muted-foreground text-xs">→</span>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${ACTION_COLORS[a.action_type] ?? "bg-muted text-muted-foreground"}`}>
                    {labelOf(ACTIONS, a.action_type)}
                  </span>
                </div>
                {a.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.description}</p>}
                <p className="text-[10px] text-muted-foreground mt-1">
                  Fired {a.execution_count} time{a.execution_count !== 1 ? "s" : ""}
                  {a.last_executed_at && ` · Last: ${new Date(a.last_executed_at).toLocaleDateString()}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  size="icon" variant="ghost" className="h-7 w-7"
                  title="Execution history"
                  onClick={() => toggleHistory(a.id)}
                >
                  {expandedId === a.id
                    ? <ChevronDown className="h-3.5 w-3.5" />
                    : <History className="h-3.5 w-3.5" />}
                </Button>
                <button onClick={() => toggle(a.id)} title={a.enabled ? "Disable" : "Enable"}>
                  {a.enabled
                    ? <ToggleRight className="h-5 w-5 text-primary" />
                    : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                </button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(a.id, a.name)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Execution history */}
            {expandedId === a.id && (
              <div className="border-t bg-muted/30 px-4 py-3">
                {runsLoading === a.id ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
                  </div>
                ) : !runs[a.id]?.length ? (
                  <p className="text-xs text-muted-foreground">No executions recorded yet.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        <th className="text-left pb-2 font-medium w-40">Time</th>
                        <th className="text-left pb-2 font-medium">Action</th>
                        <th className="text-left pb-2 font-medium w-20">Status</th>
                        <th className="text-left pb-2 font-medium">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {runs[a.id].map(r => (
                        <tr key={r.id}>
                          <td className="py-1.5 text-muted-foreground tabular-nums">
                            {new Date(r.executed_at).toLocaleString()}
                          </td>
                          <td className="py-1.5">{labelOf(ACTIONS, r.action_type)}</td>
                          <td className="py-1.5">
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              r.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-1.5 text-muted-foreground truncate max-w-xs">{r.error ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Create / Edit modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-semibold">{modal.id ? "Edit Automation" : "New Automation"}</h2>
              <button onClick={() => setModal(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 px-5 py-4 max-h-[70vh] overflow-y-auto">
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input className="h-9 text-sm" value={modal.name ?? ""} onChange={e => setField("name", e.target.value)} placeholder="e.g. Welcome new contacts" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Description (optional)</Label>
                <Input className="h-9 text-sm" value={modal.description ?? ""} onChange={e => setField("description", e.target.value)} />
              </div>

              {/* Trigger */}
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trigger</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">When this happens</Label>
                  <select className="w-full rounded-md border text-sm px-3 py-2" value={modal.trigger_type ?? "new_contact"} onChange={e => setField("trigger_type", e.target.value)}>
                    {TRIGGERS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                {modal.trigger_type === "tag_added" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tag name (leave blank for any tag)</Label>
                    <Input className="h-8 text-sm" value={(modal.trigger_config as any)?.tag ?? ""} onChange={e => setField("trigger_config", { ...modal.trigger_config, tag: e.target.value })} placeholder="VIP" />
                  </div>
                )}
                {modal.trigger_type === "field_updated" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Field key (leave blank for any field)</Label>
                    <Input className="h-8 text-sm font-mono" value={(modal.trigger_config as any)?.field_key ?? ""} onChange={e => setField("trigger_config", { ...modal.trigger_config, field_key: e.target.value })} placeholder="email" />
                  </div>
                )}
              </div>

              {/* Action */}
              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Action</p>
                <div className="space-y-1.5">
                  <Label className="text-xs">Do this</Label>
                  <select className="w-full rounded-md border text-sm px-3 py-2" value={modal.action_type ?? "send_message"} onChange={e => setField("action_type", e.target.value)}>
                    {ACTIONS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                {modal.action_type === "send_message" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Message text</Label>
                    <textarea className="w-full rounded-md border text-sm px-3 py-2 min-h-[60px] resize-y" value={(modal.action_config as any)?.text ?? ""} onChange={e => setField("action_config", { ...modal.action_config, text: e.target.value })} placeholder="Hello! Welcome aboard 🎉" />
                  </div>
                )}
                {modal.action_type === "trigger_flow" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Flow ID</Label>
                    <Input className="h-8 text-sm font-mono" value={(modal.action_config as any)?.flow_id ?? ""} onChange={e => setField("action_config", { ...modal.action_config, flow_id: e.target.value })} placeholder="UUID of the flow to trigger" />
                  </div>
                )}
                {modal.action_type === "add_tag" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Tag name</Label>
                    <Input className="h-8 text-sm" value={(modal.action_config as any)?.tag ?? ""} onChange={e => setField("action_config", { ...modal.action_config, tag: e.target.value })} placeholder="VIP" />
                  </div>
                )}
                {modal.action_type === "set_field" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Field key</Label>
                      <Input className="h-8 text-xs font-mono" value={(modal.action_config as any)?.field_key ?? ""} onChange={e => setField("action_config", { ...modal.action_config, field_key: e.target.value })} placeholder="status" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Value</Label>
                      <Input className="h-8 text-xs" value={(modal.action_config as any)?.value ?? ""} onChange={e => setField("action_config", { ...modal.action_config, value: e.target.value })} placeholder="active" />
                    </div>
                  </div>
                )}
                {modal.action_type === "send_webhook" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Webhook URL</Label>
                    <Input className="h-8 text-sm" value={(modal.action_config as any)?.url ?? ""} onChange={e => setField("action_config", { ...modal.action_config, url: e.target.value })} placeholder="https://hooks.zapier.com/..." />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {modal.id ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
