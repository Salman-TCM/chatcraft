"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash, Plus, Loader2, Pencil, Trash2, X, Check, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Keyword {
  id: string;
  keywords: string[];
  match_type: string;
  response_type: string;
  response_text: string | null;
  flow_id: string | null;
  is_active: boolean;
  priority: number;
  chatbot_id: string | null;
}

const EMPTY: Partial<Keyword> & { _kw_input?: string } = {
  keywords: [],
  match_type: "contains",
  response_type: "text",
  response_text: "",
  flow_id: null,
  is_active: true,
  priority: 0,
  _kw_input: "",
};

const MATCH_LABELS: Record<string, string> = {
  exact: "Exact match",
  contains: "Contains",
  starts_with: "Starts with",
};

const RESPONSE_COLORS: Record<string, string> = {
  text: "bg-blue-100 text-blue-700",
  flow: "bg-indigo-100 text-indigo-700",
};

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<(Partial<Keyword> & { _kw_input?: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/v1/keywords");
      setKeywords(data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() { setModal({ ...EMPTY, keywords: [] }); }
  function openEdit(k: Keyword) { setModal({ ...k, _kw_input: "" }); }

  function setField(key: string, val: any) {
    setModal(prev => prev ? { ...prev, [key]: val } : prev);
  }

  function addKw() {
    const kw = (modal?._kw_input ?? "").trim();
    if (!kw) return;
    setModal(prev => prev ? { ...prev, keywords: [...(prev.keywords ?? []), kw], _kw_input: "" } : prev);
  }

  function removeKw(kw: string) {
    setModal(prev => prev ? { ...prev, keywords: (prev.keywords ?? []).filter(k => k !== kw) } : prev);
  }

  async function save() {
    if (!modal) return;
    setSaving(true);
    const payload = { ...modal };
    delete (payload as any)._kw_input;
    try {
      if (modal.id) {
        const { data } = await apiClient.patch(`/api/v1/keywords/${modal.id}`, payload);
        setKeywords(prev => prev.map(k => k.id === modal.id ? data.data : k));
      } else {
        const { data } = await apiClient.post("/api/v1/keywords", payload);
        setKeywords(prev => [data.data, ...prev]);
      }
      setModal(null);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, current: boolean) {
    const { data } = await apiClient.patch(`/api/v1/keywords/${id}`, { is_active: !current });
    setKeywords(prev => prev.map(k => k.id === id ? data.data : k));
  }

  async function remove(id: string) {
    if (!confirm("Delete this keyword rule?")) return;
    await apiClient.delete(`/api/v1/keywords/${id}`);
    setKeywords(prev => prev.filter(k => k.id !== id));
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
          <h1 className="text-xl font-semibold">Keywords</h1>
          <p className="text-sm text-muted-foreground">Auto-reply when messages match keywords (runs before AI)</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> New Keyword Rule</Button>
      </div>

      {keywords.length === 0 && (
        <Card className="flex flex-col items-center gap-3 py-16 text-center">
          <Hash className="h-10 w-10 text-muted-foreground/40" />
          <p className="font-medium">No keyword rules yet</p>
          <p className="text-sm text-muted-foreground">Intercept messages with exact keywords or phrases</p>
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4" /> Create Rule</Button>
        </Card>
      )}

      <div className="space-y-3">
        {keywords.map(kw => (
          <Card key={kw.id} className={`flex items-center gap-4 p-4 ${!kw.is_active ? "opacity-60" : ""}`}>
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap gap-1.5">
                {kw.keywords.map(k => (
                  <span key={k} className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono font-medium">{k}</span>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium">{MATCH_LABELS[kw.match_type]}</span>
                <span>→</span>
                <span className={`rounded px-1.5 py-0.5 font-medium ${RESPONSE_COLORS[kw.response_type]}`}>
                  {kw.response_type === "flow" ? "Trigger Flow" : "Text Reply"}
                </span>
                {kw.response_type === "text" && kw.response_text && (
                  <span className="truncate max-w-xs italic">"{kw.response_text}"</span>
                )}
                <span className="ml-auto">Priority {kw.priority}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => toggle(kw.id, kw.is_active)} title={kw.is_active ? "Disable" : "Enable"}>
                {kw.is_active
                  ? <ToggleRight className="h-5 w-5 text-primary" />
                  : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
              </button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(kw)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => remove(kw.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-background shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-semibold">{modal.id ? "Edit Keyword Rule" : "New Keyword Rule"}</h2>
              <button onClick={() => setModal(null)}><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4 px-5 py-4">
              {/* Keywords input */}
              <div className="space-y-2">
                <Label className="text-xs">Keywords</Label>
                <div className="flex gap-2">
                  <Input
                    className="h-8 text-sm flex-1"
                    value={modal._kw_input ?? ""}
                    onChange={e => setField("_kw_input", e.target.value)}
                    onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKw())}
                    placeholder="Type keyword + Enter"
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={addKw}>Add</Button>
                </div>
                {(modal.keywords ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(modal.keywords ?? []).map(k => (
                      <span key={k} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
                        {k}
                        <button onClick={() => removeKw(k)} className="text-muted-foreground hover:text-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Match type */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Match type</Label>
                  <select className="w-full rounded-md border text-sm px-3 py-2" value={modal.match_type ?? "contains"} onChange={e => setField("match_type", e.target.value)}>
                    <option value="contains">Contains</option>
                    <option value="exact">Exact match</option>
                    <option value="starts_with">Starts with</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Priority (higher = first)</Label>
                  <Input type="number" className="h-9 text-sm" value={modal.priority ?? 0} onChange={e => setField("priority", parseInt(e.target.value) || 0)} />
                </div>
              </div>

              {/* Response type */}
              <div className="space-y-1.5">
                <Label className="text-xs">Response type</Label>
                <div className="flex gap-2">
                  {["text", "flow"].map(t => (
                    <button
                      key={t}
                      onClick={() => setField("response_type", t)}
                      className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${
                        modal.response_type === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                      }`}
                    >
                      {t === "text" ? "Text reply" : "Trigger Flow"}
                    </button>
                  ))}
                </div>
              </div>

              {modal.response_type === "text" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Reply text</Label>
                  <textarea
                    className="w-full rounded-md border text-sm px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                    value={modal.response_text ?? ""}
                    onChange={e => setField("response_text", e.target.value)}
                    placeholder="Hello! Here's what you need to know…"
                  />
                </div>
              )}

              {modal.response_type === "flow" && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Flow ID</Label>
                  <Input className="h-9 text-sm font-mono" value={modal.flow_id ?? ""} onChange={e => setField("flow_id", e.target.value || null)} placeholder="UUID of the flow to trigger" />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-3">
              <Button variant="outline" size="sm" onClick={() => setModal(null)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving || (modal.keywords ?? []).length === 0}>
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
