"use client";

import { useEffect, useRef, useState } from "react";
import {
  Plus, ChevronDown, Trash2, Pencil, User, DollarSign, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Stage { id: string; name: string; color: string; order: number }

interface DealContact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
}

interface Deal {
  id: string;
  pipeline_id: string;
  stage_id: string;
  notes: string | null;
  deal_value: number | null;
  order: number;
  contact: DealContact;
  created_at: string;
  updated_at: string;
}

interface Pipeline {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  stages: Stage[];
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function contactName(c: { first_name: string | null; last_name: string | null; email: string | null }) {
  return [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || "Unknown";
}

function timeInStage(updatedAt: string) {
  const ms = Date.now() - new Date(updatedAt).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function PipelinesPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activePipeline, setActivePipeline] = useState<Pipeline | null>(null);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);

  // Pipeline create modal
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const [pipelineName, setPipelineName] = useState("");
  const [pipelineColor, setPipelineColor] = useState("#6366f1");
  const [savingPipeline, setSavingPipeline] = useState(false);

  // Deal create modal
  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [dealStageId, setDealStageId] = useState("");
  const [dealContactId, setDealContactId] = useState("");
  const [dealNotes, setDealNotes] = useState("");
  const [dealValue, setDealValue] = useState("");
  const [savingDeal, setSavingDeal] = useState(false);

  // Deal edit modal
  const [editDeal, setEditDeal] = useState<Deal | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editValue, setEditValue] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Delete pipeline confirm
  const [deletePipeline, setDeletePipeline] = useState<Pipeline | null>(null);

  // DnD state
  const dragDeal = useRef<Deal | null>(null);

  async function loadPipelines() {
    const res = await apiClient.get("/api/v1/pipelines");
    const all: Pipeline[] = res.data.data;
    setPipelines(all);
    return all;
  }

  async function loadDeals(pipelineId: string) {
    const res = await apiClient.get(`/api/v1/pipelines/${pipelineId}/deals`);
    setDeals(res.data.data);
  }

  async function loadContacts() {
    const res = await apiClient.get("/api/v1/contacts?limit=200");
    setContacts(res.data.data);
  }

  useEffect(() => {
    setLoading(true);
    Promise.all([loadPipelines(), loadContacts()]).then(([all]) => {
      if (all.length > 0) {
        setActivePipeline(all[0]);
        loadDeals(all[0].id);
      }
    }).finally(() => setLoading(false));
  }, []);

  async function selectPipeline(p: Pipeline) {
    setActivePipeline(p);
    await loadDeals(p.id);
  }

  // ── Create Pipeline ────────────────────────────────────────────────────────
  async function handleCreatePipeline() {
    if (!pipelineName.trim()) return;
    setSavingPipeline(true);
    try {
      await apiClient.post("/api/v1/pipelines", { name: pipelineName.trim(), color: pipelineColor, stages: [] });
      const all = await loadPipelines();
      const created = all.find((p) => p.name === pipelineName.trim()) ?? all[all.length - 1];
      if (created) {
        setActivePipeline(created);
        await loadDeals(created.id);
      }
      setPipelineModalOpen(false);
      setPipelineName("");
    } finally {
      setSavingPipeline(false);
    }
  }

  // ── Delete Pipeline ────────────────────────────────────────────────────────
  async function handleDeletePipeline() {
    if (!deletePipeline) return;
    await apiClient.delete(`/api/v1/pipelines/${deletePipeline.id}`);
    setDeletePipeline(null);
    const all = await loadPipelines();
    if (all.length > 0) {
      setActivePipeline(all[0]);
      await loadDeals(all[0].id);
    } else {
      setActivePipeline(null);
      setDeals([]);
    }
  }

  // ── Create Deal ────────────────────────────────────────────────────────────
  async function handleCreateDeal() {
    if (!activePipeline || !dealContactId || !dealStageId) return;
    setSavingDeal(true);
    try {
      await apiClient.post(`/api/v1/pipelines/${activePipeline.id}/deals`, {
        contact_id: dealContactId,
        stage_id: dealStageId,
        notes: dealNotes || null,
        deal_value: dealValue ? parseFloat(dealValue) : null,
      });
      setDealModalOpen(false);
      setDealContactId("");
      setDealNotes("");
      setDealValue("");
      await loadDeals(activePipeline.id);
    } finally {
      setSavingDeal(false);
    }
  }

  // ── Edit Deal ──────────────────────────────────────────────────────────────
  async function handleSaveDeal() {
    if (!editDeal || !activePipeline) return;
    setSavingEdit(true);
    try {
      await apiClient.patch(`/api/v1/pipelines/${activePipeline.id}/deals/${editDeal.id}`, {
        notes: editNotes || null,
        deal_value: editValue ? parseFloat(editValue) : null,
      });
      setEditDeal(null);
      await loadDeals(activePipeline.id);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleRemoveDeal(dealId: string) {
    if (!activePipeline) return;
    await apiClient.delete(`/api/v1/pipelines/${activePipeline.id}/deals/${dealId}`);
    await loadDeals(activePipeline.id);
  }

  // ── Drag and Drop ──────────────────────────────────────────────────────────
  function onDragStart(deal: Deal) {
    dragDeal.current = deal;
  }

  async function onDrop(stageId: string) {
    const deal = dragDeal.current;
    if (!deal || !activePipeline || deal.stage_id === stageId) return;
    dragDeal.current = null;
    // Optimistic update
    setDeals((prev) => prev.map((d) => d.id === deal.id ? { ...d, stage_id: stageId } : d));
    try {
      await apiClient.patch(`/api/v1/pipelines/${activePipeline.id}/deals/${deal.id}`, { stage_id: stageId });
    } catch {
      await loadDeals(activePipeline.id);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }

  const stageDeals = (stageId: string) => deals.filter((d) => d.stage_id === stageId);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Pipelines</h1>

        {/* Pipeline selector */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="flex items-center gap-1 overflow-x-auto">
            {pipelines.map((p) => (
              <button
                key={p.id}
                onClick={() => selectPipeline(p)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium whitespace-nowrap transition-colors ${
                  activePipeline?.id === p.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                {p.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activePipeline && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setDealStageId(activePipeline.stages[0]?.id ?? "");
                  setDealModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add Deal
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeletePipeline(activePipeline)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setPipelineModalOpen(true)}>
            <Plus className="h-4 w-4" /> New Pipeline
          </Button>
        </div>
      </div>

      {/* Kanban Board */}
      {!activePipeline ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
          <p className="text-sm text-muted-foreground">No pipelines yet. Create one to get started.</p>
          <Button onClick={() => setPipelineModalOpen(true)}>
            <Plus className="h-4 w-4" /> New Pipeline
          </Button>
        </div>
      ) : (
        <div className="flex flex-1 gap-4 overflow-x-auto p-6">
          {activePipeline.stages.map((stage) => {
            const stageDls = stageDeals(stage.id);
            const stageTotal = stageDls.reduce((sum, d) => sum + (d.deal_value ?? 0), 0);

            return (
              <div
                key={stage.id}
                className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30"
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(stage.id)}
              >
                {/* Stage header */}
                <div className="flex items-center gap-2 rounded-t-xl px-3 py-2.5 border-b">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="flex-1 text-sm font-semibold truncate">{stage.name}</span>
                  <span className="text-xs text-muted-foreground">{stageDls.length}</span>
                </div>
                {stageTotal > 0 && (
                  <div className="px-3 py-1 text-xs text-muted-foreground border-b">
                    ${stageTotal.toLocaleString()} total
                  </div>
                )}

                {/* Cards */}
                <div className="flex flex-col gap-2 flex-1 overflow-y-auto p-2">
                  {stageDls.map((deal) => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={() => onDragStart(deal)}
                      className="cursor-grab rounded-lg border bg-background p-3 shadow-sm hover:shadow-md active:cursor-grabbing transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                            <User className="h-3 w-3" />
                          </div>
                          <span className="text-sm font-medium truncate">{contactName(deal.contact)}</span>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            className="rounded p-0.5 hover:bg-muted"
                            onClick={() => {
                              setEditDeal(deal);
                              setEditNotes(deal.notes ?? "");
                              setEditValue(deal.deal_value ? String(deal.deal_value) : "");
                            }}
                          >
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </button>
                          <button
                            className="rounded p-0.5 hover:bg-muted"
                            onClick={() => handleRemoveDeal(deal.id)}
                          >
                            <Trash2 className="h-3 w-3 text-muted-foreground" />
                          </button>
                        </div>
                      </div>
                      {deal.contact.email && (
                        <p className="mt-1 text-xs text-muted-foreground truncate">{deal.contact.email}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
                        {deal.deal_value != null && (
                          <span className="flex items-center gap-0.5">
                            <DollarSign className="h-3 w-3" />{deal.deal_value.toLocaleString()}
                          </span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-3 w-3" />{timeInStage(deal.updated_at)}
                        </span>
                      </div>
                      {deal.notes && (
                        <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{deal.notes}</p>
                      )}
                    </div>
                  ))}
                  {stageDls.length === 0 && (
                    <div className="flex h-16 items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/20 text-xs text-muted-foreground">
                      Drop here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New Pipeline Modal */}
      <Dialog open={pipelineModalOpen} onOpenChange={setPipelineModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>New Pipeline</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={pipelineName}
                onChange={(e) => setPipelineName(e.target.value)}
                placeholder="e.g. Sales, Onboarding"
                onKeyDown={(e) => e.key === "Enter" && handleCreatePipeline()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={pipelineColor} onChange={(e) => setPipelineColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-input" />
                <span className="text-sm font-mono text-muted-foreground">{pipelineColor}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">5 default stages will be created automatically (New Lead → Closed).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPipelineModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreatePipeline} disabled={savingPipeline || !pipelineName.trim()}>
              {savingPipeline ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Deal Modal */}
      <Dialog open={dealModalOpen} onOpenChange={setDealModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Deal</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Stage</Label>
              <select
                value={dealStageId}
                onChange={(e) => setDealStageId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {activePipeline?.stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Contact</Label>
              <select
                value={dealContactId}
                onChange={(e) => setDealContactId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">— Select a contact —</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {contactName(c)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Deal Value <span className="text-muted-foreground">(optional)</span></Label>
              <Input type="number" value={dealValue} onChange={(e) => setDealValue(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea value={dealNotes} onChange={(e) => setDealNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDealModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDeal} disabled={savingDeal || !dealContactId || !dealStageId}>
              {savingDeal ? "Adding…" : "Add Deal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Deal Modal */}
      <Dialog open={!!editDeal} onOpenChange={() => setEditDeal(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Deal — {editDeal ? contactName(editDeal.contact) : ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Deal Value</Label>
              <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Move to Stage</Label>
              <select
                value={editDeal?.stage_id ?? ""}
                onChange={async (e) => {
                  if (!editDeal || !activePipeline) return;
                  const newStageId = e.target.value;
                  setEditDeal((d) => d ? { ...d, stage_id: newStageId } : d);
                  await apiClient.patch(`/api/v1/pipelines/${activePipeline.id}/deals/${editDeal.id}`, { stage_id: newStageId });
                  await loadDeals(activePipeline.id);
                }}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {activePipeline?.stages.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDeal(null)}>Cancel</Button>
            <Button onClick={handleSaveDeal} disabled={savingEdit}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Pipeline confirm */}
      <Dialog open={!!deletePipeline} onOpenChange={() => setDeletePipeline(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Archive pipeline?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will archive <strong>{deletePipeline?.name}</strong> and hide it from view.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePipeline(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeletePipeline}>Archive</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
