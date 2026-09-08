"use client";

import { useCallback, useEffect, useState } from "react";
import { Hash, Plus, Loader2, Pencil, Trash2, X, Check, ToggleLeft, ToggleRight } from "lucide-react";
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

const MATCH_LABELS: Record<string, string> = {
  exact: "Exact match",
  contains: "Contains",
  starts_with: "Starts with",
};

const RESPONSE_COLORS: Record<string, string> = {
  text: "bg-blue-100 text-blue-700",
  flow: "bg-indigo-100 text-indigo-700",
};

// Kept in sync with KeywordMatchType / KeywordResponseType Literal unions on
// the backend (backend/app/schemas/automations.py).
const MATCH_TYPE_VALUES = ["exact", "contains", "starts_with"] as const;
const RESPONSE_TYPE_VALUES = ["text", "flow"] as const;

const keywordSchema = z
  .object({
    keywords: z.array(z.string()).min(1, "Add at least one keyword"),
    match_type: z.enum(MATCH_TYPE_VALUES),
    response_type: z.enum(RESPONSE_TYPE_VALUES),
    response_text: z.string().optional(),
    flow_id: z.string().optional(),
    is_active: z.boolean(),
    priority: z.coerce.number().int(),
  })
  .superRefine((data, ctx) => {
    if (data.response_type === "text" && !data.response_text?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Reply text is required",
        path: ["response_text"],
      });
    }
    if (data.response_type === "flow" && !data.flow_id?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Flow ID is required",
        path: ["flow_id"],
      });
    }
  });

type KeywordFormData = z.infer<typeof keywordSchema>;

const DEFAULT_FORM_VALUES: KeywordFormData = {
  keywords: [],
  match_type: "contains",
  response_type: "text",
  response_text: "",
  flow_id: "",
  is_active: true,
  priority: 0,
};

export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [kwInput, setKwInput] = useState("");
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors },
  } = useForm<KeywordFormData>({
    resolver: zodResolver(keywordSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const responseType = watch("response_type");
  const currentKeywords = watch("keywords");

  const load = useCallback(async () => {
    try {
      const { data } = await apiClient.get("/api/v1/keywords");
      setKeywords(data.data);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load keyword rules", description: getErrorMessage(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditingId(null);
    setKwInput("");
    reset(DEFAULT_FORM_VALUES);
    setModalOpen(true);
  }

  function openEdit(k: Keyword) {
    setEditingId(k.id);
    setKwInput("");
    reset({
      keywords: k.keywords,
      match_type: k.match_type as KeywordFormData["match_type"],
      response_type: k.response_type as KeywordFormData["response_type"],
      response_text: k.response_text ?? "",
      flow_id: k.flow_id ?? "",
      is_active: k.is_active,
      priority: k.priority,
    });
    setModalOpen(true);
  }

  function addKw() {
    const kw = kwInput.trim();
    if (!kw) return;
    setValue("keywords", [...currentKeywords, kw], { shouldValidate: true });
    setKwInput("");
  }

  function removeKw(kw: string) {
    setValue("keywords", currentKeywords.filter(k => k !== kw), { shouldValidate: true });
  }

  async function onSubmit(values: KeywordFormData) {
    setSaving(true);
    const payload = {
      ...values,
      flow_id: values.response_type === "flow" ? (values.flow_id || null) : null,
      response_text: values.response_type === "text" ? values.response_text : null,
    };
    try {
      if (editingId) {
        const { data } = await apiClient.patch(`/api/v1/keywords/${editingId}`, payload);
        setKeywords(prev => prev.map(k => k.id === editingId ? data.data : k));
      } else {
        const { data } = await apiClient.post("/api/v1/keywords", payload);
        setKeywords(prev => [data.data, ...prev]);
      }
      setModalOpen(false);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setError(field as keyof KeywordFormData, { message });
      });
      toast({
        variant: "destructive",
        title: editingId ? "Failed to update keyword rule" : "Failed to create keyword rule",
        description: getErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggle(id: string, current: boolean) {
    try {
      const { data } = await apiClient.patch(`/api/v1/keywords/${id}`, { is_active: !current });
      setKeywords(prev => prev.map(k => k.id === id ? data.data : k));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to toggle keyword rule", description: getErrorMessage(err) });
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this keyword rule?")) return;
    try {
      await apiClient.delete(`/api/v1/keywords/${id}`);
      setKeywords(prev => prev.filter(k => k.id !== id));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete keyword rule", description: getErrorMessage(err) });
    }
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
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-background shadow-xl">
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h2 className="font-semibold">{editingId ? "Edit Keyword Rule" : "New Keyword Rule"}</h2>
                <button className="inline-flex items-center justify-center" type="button" onClick={() => setModalOpen(false)}><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-4 px-5 py-4">
                {/* Keywords input */}
                <div className="space-y-2">
                  <Label className="text-xs">Keywords</Label>
                  <div className="flex gap-2">
                    <Input
                      className="h-8 text-sm flex-1"
                      value={kwInput}
                      onChange={e => setKwInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addKw())}
                      placeholder="Type keyword + Enter"
                    />
                    <Button type="button" size="sm" variant="outline" className="h-8" onClick={addKw}>Add</Button>
                  </div>
                  {currentKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {currentKeywords.map(k => (
                        <span key={k} className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-mono">
                          {k}
                          <button type="button" onClick={() => removeKw(k)} className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {errors.keywords && <p className="text-xs text-destructive">{errors.keywords.message}</p>}
                </div>

                {/* Match type */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Match type</Label>
                    <select className="w-full rounded-md border text-sm px-3 py-2" {...register("match_type")}>
                      <option value="contains">Contains</option>
                      <option value="exact">Exact match</option>
                      <option value="starts_with">Starts with</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Priority (higher = first)</Label>
                    <Input type="number" className="h-9 text-sm" {...register("priority")} />
                    {errors.priority && <p className="text-xs text-destructive">{errors.priority.message}</p>}
                  </div>
                </div>

                {/* Response type */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Response type</Label>
                  <div className="flex gap-2">
                    {(["text", "flow"] as const).map(t => (
                      <button
                        type="button"
                        key={t}
                        onClick={() => setValue("response_type", t, { shouldValidate: true })}
                        className={`flex-1 rounded-lg border py-2 text-sm font-medium capitalize transition-colors ${
                          responseType === t ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
                        }`}
                      >
                        {t === "text" ? "Text reply" : "Trigger Flow"}
                      </button>
                    ))}
                  </div>
                </div>

                {responseType === "text" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Reply text</Label>
                    <textarea
                      className="w-full rounded-md border text-sm px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                      {...register("response_text")}
                      placeholder="Hello! Here's what you need to know…"
                    />
                    {errors.response_text && <p className="text-xs text-destructive">{errors.response_text.message}</p>}
                  </div>
                )}

                {responseType === "flow" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Flow ID</Label>
                    <Input className="h-9 text-sm font-mono" {...register("flow_id")} placeholder="UUID of the flow to trigger" />
                    {errors.flow_id && <p className="text-xs text-destructive">{errors.flow_id.message}</p>}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 border-t px-5 py-3">
                <Button type="button" variant="outline" size="sm" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm" disabled={saving || currentKeywords.length === 0}>
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
