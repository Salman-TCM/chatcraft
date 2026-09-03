"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MessageCircle, Plus, Loader2, Pencil, Trash2, X, ToggleLeft, ToggleRight,
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

interface CommentAutomation {
  id: string;
  platform: string;
  page_id: string;
  page_name: string | null;
  enabled: boolean;
  ai_prompt: string | null;
  response_type: string;
  response_text: string | null;
  keyword_triggers: string[];
  delay_seconds: number;
  also_send_dm: boolean;
  dm_message: string | null;
}

// facebook / instagram / ai / text — mirrors CommentPlatform / ResponseType in
// backend/app/schemas/broadcast.py.
const automationSchema = z
  .object({
    platform: z.enum(["facebook", "instagram"]),
    page_id: z.string().trim().min(1, "Page ID is required").max(255),
    page_name: z.string().max(255).optional(),
    response_type: z.enum(["ai", "text"]),
    ai_prompt: z.string().optional(),
    response_text: z.string().optional(),
    delay_seconds: z.coerce.number().int("Must be a whole number").min(0, "Must be 0 or greater"),
    also_send_dm: z.boolean(),
    dm_message: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.response_type === "ai" && !data.ai_prompt?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "AI prompt is required", path: ["ai_prompt"] });
    }
    if (data.response_type === "text" && !data.response_text?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Response text is required", path: ["response_text"] });
    }
  });
type FormData = z.infer<typeof automationSchema>;

const DEFAULT_FORM_VALUES: FormData = {
  platform: "facebook",
  page_id: "",
  page_name: "",
  response_type: "ai",
  ai_prompt: "",
  response_text: "",
  delay_seconds: 0,
  also_send_dm: false,
  dm_message: "",
};

export default function CommentAutomationPage() {
  const [automations, setAutomations] = useState<CommentAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CommentAutomation | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  // Keyword triggers aren't a plain form field (they're built up via an
  // add/remove tag input), so they're kept in local state and merged into
  // the payload on submit, same as trigger/action config in the automations page.
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(automationSchema),
    defaultValues: DEFAULT_FORM_VALUES,
  });

  const responseType = watch("response_type");
  const alsoSendDm = watch("also_send_dm");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/comment-automations");
      setAutomations(res.data.data ?? []);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load comment automations", description: getErrorMessage(err) });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setKeywords([]);
    setKeywordInput("");
    reset(DEFAULT_FORM_VALUES);
    setShowModal(true);
  }

  function openEdit(a: CommentAutomation) {
    setEditing(a);
    setKeywords([...a.keyword_triggers]);
    setKeywordInput("");
    reset({
      platform: a.platform as FormData["platform"],
      page_id: a.page_id,
      page_name: a.page_name ?? "",
      response_type: a.response_type as FormData["response_type"],
      ai_prompt: a.ai_prompt ?? "",
      response_text: a.response_text ?? "",
      delay_seconds: a.delay_seconds,
      also_send_dm: a.also_send_dm,
      dm_message: a.dm_message ?? "",
    });
    setShowModal(true);
  }

  function addKeyword() {
    const kw = keywordInput.trim();
    if (kw && !keywords.includes(kw)) {
      setKeywords((p) => [...p, kw]);
    }
    setKeywordInput("");
  }

  async function onSubmit(values: FormData) {
    setSaving(true);
    const payload = {
      platform: values.platform,
      page_id: values.page_id,
      page_name: values.page_name || null,
      response_type: values.response_type,
      ai_prompt: values.ai_prompt || null,
      response_text: values.response_text || null,
      keyword_triggers: keywords,
      delay_seconds: values.delay_seconds,
      also_send_dm: values.also_send_dm,
      dm_message: values.dm_message || null,
    };
    try {
      if (editing) {
        await apiClient.patch(`/api/v1/comment-automations/${editing.id}`, payload);
      } else {
        await apiClient.post("/api/v1/comment-automations", payload);
      }
      setShowModal(false);
      await load();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setError(field as keyof FormData, { message });
      });
      toast({
        variant: "destructive",
        title: editing ? "Failed to update automation" : "Failed to create automation",
        description: getErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(a: CommentAutomation) {
    setToggling(a.id);
    try {
      await apiClient.patch(`/api/v1/comment-automations/${a.id}`, { enabled: !a.enabled });
      setAutomations((p) => p.map((ca) => ca.id === a.id ? { ...ca, enabled: !a.enabled } : ca));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to toggle automation", description: getErrorMessage(err) });
    }
    setToggling(null);
  }

  async function deleteAutomation(id: string) {
    if (!confirm("Delete this comment automation?")) return;
    try {
      await apiClient.delete(`/api/v1/comment-automations/${id}`);
      setAutomations((p) => p.filter((a) => a.id !== id));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete automation", description: getErrorMessage(err) });
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Comment Automation</h1>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Automation</Button>
      </div>

      <p className="text-sm text-muted-foreground mb-5">
        Automatically reply to Facebook and Instagram comments with AI or fixed text. Optionally send a DM to the commenter.
      </p>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : automations.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageCircle className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No comment automations yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create an automation to auto-reply to social comments.</p>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Automation</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      a.platform === "facebook" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                    }`}>{a.platform}</span>
                    <p className="font-medium">{a.page_name || a.page_id}</p>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{a.response_type === "ai" ? "AI Reply" : "Fixed Text"}</span>
                  </div>
                  {a.keyword_triggers.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-xs text-muted-foreground">Keywords:</span>
                      {a.keyword_triggers.map((kw) => (
                        <span key={kw} className="text-xs bg-muted px-1.5 py-0.5 rounded">{kw}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Replies to all comments</p>
                  )}
                  {a.also_send_dm && <p className="text-xs text-primary mt-1">+ Sends DM</p>}
                  {a.delay_seconds > 0 && <p className="text-xs text-muted-foreground">Delay: {a.delay_seconds}s</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => toggleEnabled(a)} disabled={toggling === a.id} className="p-1">
                    {toggling === a.id
                      ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      : a.enabled
                        ? <ToggleRight className="h-5 w-5 text-green-600" />
                        : <ToggleLeft className="h-5 w-5 text-muted-foreground" />}
                  </button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteAutomation(a.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col min-h-0">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">{editing ? "Edit Automation" : "New Comment Automation"}</h2>
                <button className="inline-flex items-center justify-center" type="button" onClick={() => setShowModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Platform</Label>
                    <select
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                      disabled={!!editing}
                      {...register("platform")}
                    >
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                    </select>
                    {errors.platform && <p className="text-xs text-destructive">{errors.platform.message}</p>}
                  </div>
                  <div className="space-y-1">
                    <Label>Page ID *</Label>
                    <Input placeholder="123456789" disabled={!!editing} {...register("page_id")} />
                    {errors.page_id && <p className="text-xs text-destructive">{errors.page_id.message}</p>}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Page Name <span className="text-muted-foreground font-normal">(display only)</span></Label>
                  <Input placeholder="My Facebook Page" {...register("page_name")} />
                  {errors.page_name && <p className="text-xs text-destructive">{errors.page_name.message}</p>}
                </div>

                <div className="space-y-1">
                  <Label>Response Type</Label>
                  <div className="flex gap-3">
                    {(["ai", "text"] as const).map((t) => (
                      <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                        <input type="radio" value={t} {...register("response_type")} />
                        <span className="text-sm capitalize">{t === "ai" ? "AI Generated" : "Fixed Text"}</span>
                      </label>
                    ))}
                  </div>
                  {errors.response_type && <p className="text-xs text-destructive">{errors.response_type.message}</p>}
                </div>

                {responseType === "ai" ? (
                  <div className="space-y-1">
                    <Label>AI Prompt</Label>
                    <textarea
                      className="w-full h-20 p-2 text-sm rounded-md border bg-background resize-none"
                      placeholder="Reply in a friendly tone. Answer the comment and invite them to DM us for more details."
                      {...register("ai_prompt")}
                    />
                    {errors.ai_prompt && <p className="text-xs text-destructive">{errors.ai_prompt.message}</p>}
                  </div>
                ) : (
                  <div className="space-y-1">
                    <Label>Response Text</Label>
                    <textarea
                      className="w-full h-20 p-2 text-sm rounded-md border bg-background resize-none"
                      placeholder="Thanks for your comment! DM us for more info."
                      {...register("response_text")}
                    />
                    {errors.response_text && <p className="text-xs text-destructive">{errors.response_text.message}</p>}
                  </div>
                )}

                <div className="space-y-1">
                  <Label>Keyword Triggers <span className="text-muted-foreground font-normal">(leave empty to reply to all)</span></Label>
                  <div className="flex gap-2">
                    <Input
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      placeholder="Type keyword + Enter"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                      className="h-8 text-sm"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={addKeyword} className="shrink-0">Add</Button>
                  </div>
                  {keywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {keywords.map((kw) => (
                        <span key={kw} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                          {kw}
                          <button className="inline-flex items-center justify-center" type="button" onClick={() => setKeywords((p) => p.filter((k) => k !== kw))}>
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Delay (seconds)</Label>
                    <Input type="number" min="0" {...register("delay_seconds")} />
                    {errors.delay_seconds && <p className="text-xs text-destructive">{errors.delay_seconds.message}</p>}
                  </div>
                </div>

                <div className="border rounded-lg p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="send-dm" className="h-4 w-4" {...register("also_send_dm")} />
                    <Label htmlFor="send-dm" className="cursor-pointer">Also send a DM to the commenter</Label>
                  </div>
                  {alsoSendDm && (
                    <div className="space-y-1">
                      <Label className="text-xs">DM Message</Label>
                      <textarea
                        className="w-full h-16 p-2 text-sm rounded-md border bg-background resize-none"
                        placeholder="Hey! Thanks for your comment. Here's more info..."
                        {...register("dm_message")}
                      />
                      {errors.dm_message && <p className="text-xs text-destructive">{errors.dm_message.message}</p>}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editing ? "Save Changes" : "Create Automation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
