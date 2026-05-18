"use client";

import { useCallback, useEffect, useState } from "react";
import {
  List, Plus, Loader2, Pencil, Trash2, X, Check, ChevronDown, ChevronUp, GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Step {
  id: string;
  delay_amount: number;
  delay_unit: string;
  message_text: string;
}

interface Sequence {
  id: string;
  name: string;
  description: string | null;
  auto_enroll: boolean;
  reply_behavior: string;
  steps: Step[];
  chatbot_id: string | null;
  updated_at: string;
}

const EMPTY_SEQ: Partial<Sequence> = {
  name: "",
  description: "",
  auto_enroll: false,
  reply_behavior: "stop",
  steps: [],
};

function newStep(): Step {
  return { id: crypto.randomUUID(), delay_amount: 1, delay_unit: "hours", message_text: "" };
}

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Sequence> | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedStats, setExpandedStats] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, any>>({});

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/v1/sequences");
      setSequences(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadStats(seqId: string) {
    if (stats[seqId]) { setExpandedStats(s => s === seqId ? null : seqId); return; }
    const { data } = await apiClient.get(`/api/v1/sequences/${seqId}/enrollments`);
    setStats(prev => ({ ...prev, [seqId]: data }));
    setExpandedStats(seqId);
  }

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      if (editing.id) {
        const { data } = await apiClient.patch(`/api/v1/sequences/${editing.id}`, editing);
        setSequences(prev => prev.map(s => s.id === editing.id ? data.data : s));
      } else {
        const { data } = await apiClient.post("/api/v1/sequences", editing);
        setSequences(prev => [data.data, ...prev]);
      }
      setEditing(null);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete sequence "${name}"?`)) return;
    await apiClient.delete(`/api/v1/sequences/${id}`);
    setSequences(prev => prev.filter(s => s.id !== id));
  }

  function setEdField(key: string, val: any) {
    setEditing(prev => prev ? { ...prev, [key]: val } : prev);
  }

  function updateStep(idx: number, key: string, val: any) {
    setEditing(prev => {
      if (!prev) return prev;
      const steps = [...(prev.steps ?? [])];
      steps[idx] = { ...steps[idx], [key]: val };
      return { ...prev, steps };
    });
  }

  function addStep() {
    setEditing(prev => prev ? { ...prev, steps: [...(prev.steps ?? []), newStep()] } : prev);
  }

  function removeStep(idx: number) {
    setEditing(prev => {
      if (!prev) return prev;
      const steps = [...(prev.steps ?? [])];
      steps.splice(idx, 1);
      return { ...prev, steps };
    });
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
          <h1 className="text-xl font-semibold">Sequences</h1>
          <p className="text-sm text-muted-foreground">Drip message sequences delivered over time</p>
        </div>
        <Button size="sm" onClick={() => setEditing({ ...EMPTY_SEQ, steps: [newStep()] })}>
          <Plus className="h-4 w-4" /> New Sequence
        </Button>
      </div>

      {sequences.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <List className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No sequences yet</p>
          <p className="text-sm text-muted-foreground">Create drip campaigns to nurture contacts</p>
          <Button size="sm" onClick={() => setEditing({ ...EMPTY_SEQ, steps: [newStep()] })}>
            <Plus className="h-4 w-4" /> Create Sequence
          </Button>
        </Card>
      )}

      <div className="space-y-3">
        {sequences.map(seq => {
          const seqStats = stats[seq.id];
          const isExpanded = expandedStats === seq.id;
          return (
            <Card key={seq.id} className="overflow-hidden">
              <div className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{seq.name}</p>
                  {seq.description && <p className="text-xs text-muted-foreground truncate">{seq.description}</p>}
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span>{seq.steps.length} step{seq.steps.length !== 1 ? "s" : ""}</span>
                    <span>·</span>
                    <span>On reply: {seq.reply_behavior}</span>
                    {seq.auto_enroll && <span className="text-primary">· Auto-enroll</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => loadStats(seq.id)}>
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Stats
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing({ ...seq })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(seq.id, seq.name)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {isExpanded && seqStats && (
                <div className="border-t bg-muted/30 px-4 py-3 flex gap-6 text-sm">
                  <div className="text-center">
                    <p className="text-lg font-semibold">{seqStats.stats?.active ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{seqStats.stats?.completed ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{seqStats.stats?.total ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total enrolled</p>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Editor modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-background shadow-xl flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
              <h2 className="font-semibold">{editing.id ? "Edit Sequence" : "New Sequence"}</h2>
              <button onClick={() => setEditing(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">Name</Label>
                  <Input className="h-9" value={editing.name ?? ""} onChange={e => setEdField("name", e.target.value)} placeholder="Onboarding drip" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">On reply</Label>
                  <select className="w-full rounded-md border text-sm px-3 py-2" value={editing.reply_behavior ?? "stop"} onChange={e => setEdField("reply_behavior", e.target.value)}>
                    <option value="stop">Stop sequence</option>
                    <option value="pause">Pause sequence</option>
                    <option value="continue">Continue sequence</option>
                  </select>
                </div>
                <div className="flex items-end gap-2 pb-0.5">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={editing.auto_enroll ?? false} onChange={e => setEdField("auto_enroll", e.target.checked)} className="rounded" />
                    Auto-enroll new contacts
                  </label>
                </div>
              </div>

              {/* Steps */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps</p>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addStep}>
                    <Plus className="h-3 w-3" /> Add Step
                  </Button>
                </div>
                {(editing.steps ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4 border rounded-lg border-dashed">
                    No steps yet — click Add Step to begin
                  </p>
                )}
                {(editing.steps ?? []).map((step, idx) => (
                  <div key={step.id} className="rounded-lg border bg-muted/20 p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Step {idx + 1}</span>
                      <button onClick={() => removeStep(idx)} className="text-destructive hover:text-destructive/80">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 space-y-1">
                        <Label className="text-xs">Wait</Label>
                        <Input type="number" min="0" className="h-8 text-xs" value={step.delay_amount} onChange={e => updateStep(idx, "delay_amount", parseInt(e.target.value) || 0)} />
                      </div>
                      <div className="w-28 space-y-1">
                        <Label className="text-xs">Unit</Label>
                        <select className="w-full rounded-md border text-xs px-2 py-1.5" value={step.delay_unit} onChange={e => updateStep(idx, "delay_unit", e.target.value)}>
                          {["seconds","minutes","hours","days"].map(u => <option key={u}>{u}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Message</Label>
                      <textarea
                        className="w-full rounded-md border text-xs px-3 py-2 min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                        value={step.message_text}
                        onChange={e => updateStep(idx, "message_text", e.target.value)}
                        placeholder="Hi {{first_name}}, just checking in…"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {editing.id ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
