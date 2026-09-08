"use client";

import { useCallback, useEffect, useState } from "react";
import {
  List, Plus, Loader2, Pencil, Trash2, X, Check, ChevronDown, ChevronUp, GripVertical,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

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

function newStep(): Step {
  return { id: crypto.randomUUID(), delay_amount: 1, delay_unit: "hours", message_text: "" };
}

// Matches SequenceReplyBehavior on the backend (SequenceCreate/SequenceUpdate).
const sequenceSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  reply_behavior: z.enum(["stop", "pause", "continue"]),
  auto_enroll: z.boolean(),
});
type SequenceFormData = z.infer<typeof sequenceSchema>;

const DEFAULT_FORM_VALUES: SequenceFormData = {
  name: "",
  reply_behavior: "stop",
  auto_enroll: false,
};

export default function SequencesPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [saving, setSaving] = useState(false);
  const [expandedStats, setExpandedStats] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, any>>({});

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<SequenceFormData>({
    resolver: zodResolver(sequenceSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/v1/sequences");
      setSequences(data.data);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load sequences", description: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadStats(seqId: string) {
    if (stats[seqId]) { setExpandedStats(s => s === seqId ? null : seqId); return; }
    try {
      const { data } = await apiClient.get(`/api/v1/sequences/${seqId}/enrollments`);
      setStats(prev => ({ ...prev, [seqId]: data }));
      setExpandedStats(seqId);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load sequence stats", description: getErrorMessage(err) });
    }
  }

  function openCreate() {
    setEditingId(null);
    setSteps([newStep()]);
    reset(DEFAULT_FORM_VALUES);
    setModalOpen(true);
  }

  function openEdit(seq: Sequence) {
    setEditingId(seq.id);
    setSteps(seq.steps ?? []);
    reset({
      name: seq.name,
      reply_behavior: seq.reply_behavior as SequenceFormData["reply_behavior"],
      auto_enroll: seq.auto_enroll,
    });
    setModalOpen(true);
  }

  async function onSubmit(values: SequenceFormData) {
    setSaving(true);
    const payload = { ...values, steps };
    try {
      if (editingId) {
        const { data } = await apiClient.patch(`/api/v1/sequences/${editingId}`, payload);
        setSequences(prev => prev.map(s => s.id === editingId ? data.data : s));
      } else {
        const { data } = await apiClient.post("/api/v1/sequences", payload);
        setSequences(prev => [data.data, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setError(field as keyof SequenceFormData, { message });
      });
      toast({
        variant: "destructive",
        title: editingId ? "Failed to update sequence" : "Failed to create sequence",
        description: getErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete sequence "${name}"?`)) return;
    try {
      await apiClient.delete(`/api/v1/sequences/${id}`);
      setSequences(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete sequence", description: getErrorMessage(err) });
    }
  }

  function updateStep(idx: number, key: string, val: any) {
    setSteps(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: val };
      return next;
    });
  }

  function addStep() {
    setSteps(prev => [...prev, newStep()]);
  }

  function removeStep(idx: number) {
    setSteps(prev => {
      const next = [...prev];
      next.splice(idx, 1);
      return next;
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
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Sequence
        </Button>
      </div>

      {sequences.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <List className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No sequences yet</p>
          <p className="text-sm text-muted-foreground">Create drip campaigns to nurture contacts</p>
          <Button size="sm" onClick={openCreate}>
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
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(seq)}>
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
                    <p className="text-lg font-semibold text-primary">{seqStats.stats?.active ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Active</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-green-600">{seqStats.stats?.completed ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold text-muted-foreground">{seqStats.stats?.cancelled ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Cancelled</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-semibold">{seqStats.stats?.total ?? 0}</p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Editor modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-xl rounded-xl bg-background shadow-xl flex flex-col max-h-[90vh]">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b px-5 py-4 shrink-0">
                <h2 className="font-semibold">{editingId ? "Edit Sequence" : "New Sequence"}</h2>
                <button className="inline-flex items-center justify-center" type="button" onClick={() => setModalOpen(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input className="h-9" {...register("name")} placeholder="Onboarding drip" />
                    {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">On reply</Label>
                    <select className="w-full rounded-md border text-sm px-3 py-2" {...register("reply_behavior")}>
                      <option value="stop">Stop sequence</option>
                      <option value="pause">Pause sequence</option>
                      <option value="continue">Continue sequence</option>
                    </select>
                    {errors.reply_behavior && <p className="text-xs text-destructive">{errors.reply_behavior.message}</p>}
                  </div>
                  <div className="flex items-end gap-2 pb-0.5">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" {...register("auto_enroll")} className="rounded" />
                      Auto-enroll new contacts
                    </label>
                  </div>
                </div>

                {/* Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Steps</p>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addStep}>
                      <Plus className="h-3 w-3" /> Add Step
                    </Button>
                  </div>
                  {steps.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4 border rounded-lg border-dashed">
                      No steps yet — click Add Step to begin
                    </p>
                  )}
                  {steps.map((step, idx) => (
                    <div key={step.id} className="rounded-lg border bg-muted/20 p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Step {idx + 1}</span>
                        <button type="button" onClick={() => removeStep(idx)} className="inline-flex items-center justify-center text-destructive hover:text-destructive/80">
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
                <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {editingId ? "Save" : "Create"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
