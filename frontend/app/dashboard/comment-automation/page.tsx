"use client";

import { useCallback, useEffect, useState } from "react";
import {
  MessageCircle, Plus, Loader2, Pencil, Trash2, X, ToggleLeft, ToggleRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

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

export default function CommentAutomationPage() {
  const [automations, setAutomations] = useState<CommentAutomation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CommentAutomation | null>(null);
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);

  // Form state
  const [fPlatform, setFPlatform] = useState("facebook");
  const [fPageId, setFPageId] = useState("");
  const [fPageName, setFPageName] = useState("");
  const [fResponseType, setFResponseType] = useState("ai");
  const [fAiPrompt, setFAiPrompt] = useState("");
  const [fResponseText, setFResponseText] = useState("");
  const [fKeywords, setFKeywords] = useState<string[]>([]);
  const [fKeywordInput, setFKeywordInput] = useState("");
  const [fDelay, setFDelay] = useState("0");
  const [fSendDm, setFSendDm] = useState(false);
  const [fDmMessage, setFDmMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/comment-automations");
      setAutomations(res.data.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setFPlatform("facebook"); setFPageId(""); setFPageName("");
    setFResponseType("ai"); setFAiPrompt(""); setFResponseText("");
    setFKeywords([]); setFKeywordInput(""); setFDelay("0");
    setFSendDm(false); setFDmMessage("");
    setShowModal(true);
  }

  function openEdit(a: CommentAutomation) {
    setEditing(a);
    setFPlatform(a.platform); setFPageId(a.page_id); setFPageName(a.page_name ?? "");
    setFResponseType(a.response_type); setFAiPrompt(a.ai_prompt ?? "");
    setFResponseText(a.response_text ?? ""); setFKeywords([...a.keyword_triggers]);
    setFKeywordInput(""); setFDelay(String(a.delay_seconds));
    setFSendDm(a.also_send_dm); setFDmMessage(a.dm_message ?? "");
    setShowModal(true);
  }

  function addKeyword() {
    const kw = fKeywordInput.trim();
    if (kw && !fKeywords.includes(kw)) {
      setFKeywords((p) => [...p, kw]);
    }
    setFKeywordInput("");
  }

  async function save() {
    if (!fPageId.trim()) return;
    setSaving(true);
    const payload = {
      platform: fPlatform, page_id: fPageId, page_name: fPageName || null,
      response_type: fResponseType, ai_prompt: fAiPrompt || null,
      response_text: fResponseText || null, keyword_triggers: fKeywords,
      delay_seconds: parseInt(fDelay) || 0,
      also_send_dm: fSendDm, dm_message: fDmMessage || null,
    };
    try {
      if (editing) {
        await apiClient.patch(`/api/v1/comment-automations/${editing.id}`, payload);
      } else {
        await apiClient.post("/api/v1/comment-automations", payload);
      }
      setShowModal(false);
      await load();
    } catch {}
    setSaving(false);
  }

  async function toggleEnabled(a: CommentAutomation) {
    setToggling(a.id);
    try {
      await apiClient.patch(`/api/v1/comment-automations/${a.id}`, { enabled: !a.enabled });
      setAutomations((p) => p.map((ca) => ca.id === a.id ? { ...ca, enabled: !a.enabled } : ca));
    } catch {}
    setToggling(null);
  }

  async function deleteAutomation(id: string) {
    if (!confirm("Delete this comment automation?")) return;
    try {
      await apiClient.delete(`/api/v1/comment-automations/${id}`);
      setAutomations((p) => p.filter((a) => a.id !== id));
    } catch {}
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
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">{editing ? "Edit Automation" : "New Comment Automation"}</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Platform</Label>
                  <select value={fPlatform} onChange={(e) => setFPlatform(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm" disabled={!!editing}>
                    <option value="facebook">Facebook</option>
                    <option value="instagram">Instagram</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Page ID *</Label>
                  <Input value={fPageId} onChange={(e) => setFPageId(e.target.value)} placeholder="123456789" disabled={!!editing} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Page Name <span className="text-muted-foreground font-normal">(display only)</span></Label>
                <Input value={fPageName} onChange={(e) => setFPageName(e.target.value)} placeholder="My Facebook Page" />
              </div>

              <div className="space-y-1">
                <Label>Response Type</Label>
                <div className="flex gap-3">
                  {["ai", "text"].map((t) => (
                    <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" checked={fResponseType === t} onChange={() => setFResponseType(t)} />
                      <span className="text-sm capitalize">{t === "ai" ? "AI Generated" : "Fixed Text"}</span>
                    </label>
                  ))}
                </div>
              </div>

              {fResponseType === "ai" ? (
                <div className="space-y-1">
                  <Label>AI Prompt</Label>
                  <textarea
                    className="w-full h-20 p-2 text-sm rounded-md border bg-background resize-none"
                    value={fAiPrompt} onChange={(e) => setFAiPrompt(e.target.value)}
                    placeholder="Reply in a friendly tone. Answer the comment and invite them to DM us for more details."
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label>Response Text</Label>
                  <textarea
                    className="w-full h-20 p-2 text-sm rounded-md border bg-background resize-none"
                    value={fResponseText} onChange={(e) => setFResponseText(e.target.value)}
                    placeholder="Thanks for your comment! DM us for more info."
                  />
                </div>
              )}

              <div className="space-y-1">
                <Label>Keyword Triggers <span className="text-muted-foreground font-normal">(leave empty to reply to all)</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={fKeywordInput}
                    onChange={(e) => setFKeywordInput(e.target.value)}
                    placeholder="Type keyword + Enter"
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addKeyword())}
                    className="h-8 text-sm"
                  />
                  <Button size="sm" variant="outline" onClick={addKeyword} className="shrink-0">Add</Button>
                </div>
                {fKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {fKeywords.map((kw) => (
                      <span key={kw} className="flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-full">
                        {kw}
                        <button onClick={() => setFKeywords((p) => p.filter((k) => k !== kw))}>
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
                  <Input type="number" min="0" value={fDelay} onChange={(e) => setFDelay(e.target.value)} />
                </div>
              </div>

              <div className="border rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="send-dm" checked={fSendDm} onChange={(e) => setFSendDm(e.target.checked)} className="h-4 w-4" />
                  <Label htmlFor="send-dm" className="cursor-pointer">Also send a DM to the commenter</Label>
                </div>
                {fSendDm && (
                  <div className="space-y-1">
                    <Label className="text-xs">DM Message</Label>
                    <textarea
                      className="w-full h-16 p-2 text-sm rounded-md border bg-background resize-none"
                      value={fDmMessage} onChange={(e) => setFDmMessage(e.target.value)}
                      placeholder="Hey! Thanks for your comment. Here's more info..."
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !fPageId.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editing ? "Save Changes" : "Create Automation"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
