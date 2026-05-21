"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Radio, Plus, Loader2, Pencil, Trash2, Send, X, BarChart2,
  Mail, MessageSquare, Phone, Bell, Eye, FlaskConical,
  Clock, Users, Tag, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  message_template: string;
  html_content: string | null;
  subject: string | null;
  target_filter: Record<string, unknown>;
  scheduled_at: string | null;
  sent_at: string | null;
  sent_count: number;
  failed_count: number;
  created_at: string;
}

interface Chatbot {
  id: string;
  name: string;
}

const CHANNELS = [
  { value: "email",     label: "Email",     icon: Mail },
  { value: "sms",       label: "SMS",       icon: MessageSquare },
  { value: "telegram",  label: "Telegram",  icon: MessageSquare },
  { value: "whatsapp",  label: "WhatsApp",  icon: MessageSquare },
  { value: "messenger", label: "Messenger", icon: MessageSquare },
  { value: "push",      label: "Push",      icon: Bell },
  { value: "phone",     label: "Phone",     icon: Phone },
];

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  sending:   "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  sent:      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  failed:    "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};

function renderPreview(message: string, html: string | null): string {
  const sample = { first_name: "Jane", last_name: "Doe", email: "jane@example.com" };
  let text = html || message || "";
  Object.entries(sample).forEach(([k, v]) => {
    text = text.replaceAll(`{{${k}}}`, v);
  });
  return text;
}

export default function BroadcastPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string>("all");

  // Compose modal
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [fName, setFName] = useState("");
  const [fChannel, setFChannel] = useState("email");
  const [fSubject, setFSubject] = useState("");
  const [fMessage, setFMessage] = useState("");
  const [fHtml, setFHtml] = useState("");
  const [fScheduled, setFScheduled] = useState("");
  const [fTags, setFTags] = useState("");
  const [fSegment, setFSegment] = useState("all");
  const [fChatbotId, setFChatbotId] = useState("");

  // Preview modal
  const [previewTarget, setPreviewTarget] = useState<Campaign | null>(null);

  // Test send
  const [testTarget, setTestTarget] = useState<Campaign | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Stats modal
  const [statsTarget, setStatsTarget] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);

  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeChannel === "all"
        ? "/api/v1/broadcasts?limit=100"
        : `/api/v1/broadcasts?channel=${activeChannel}&limit=100`;
      const [campRes, botRes] = await Promise.all([
        apiClient.get(url),
        apiClient.get("/api/chatbots?limit=50"),
      ]);
      setCampaigns(campRes.data.data ?? []);
      setChatbots(botRes.data.data ?? []);
    } catch {}
    setLoading(false);
  }, [activeChannel]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setFName(""); setFChannel("email"); setFSubject(""); setFMessage("");
    setFHtml(""); setFScheduled(""); setFTags(""); setFSegment("all"); setFChatbotId("");
    setShowModal(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    setFName(c.name); setFChannel(c.channel);
    setFSubject(c.subject ?? ""); setFMessage(c.message_template);
    setFHtml(c.html_content ?? ""); setFScheduled(c.scheduled_at ?? "");
    setFTags(((c.target_filter.tags as string[]) ?? []).join(", "));
    setFSegment((c.target_filter.segment as string) ?? "all");
    setFChatbotId((c.target_filter.chatbot_id as string) ?? "");
    setShowModal(true);
  }

  async function save() {
    if (!fName.trim()) return;
    setSaving(true);
    const payload = {
      name: fName.trim(), channel: fChannel,
      subject: fSubject || null, message_template: fMessage,
      html_content: fHtml || null,
      scheduled_at: fScheduled || null,
      target_filter: {
        segment: fSegment,
        chatbot_id: fChatbotId || null,
        tags: fTags ? fTags.split(",").map((s) => s.trim()).filter(Boolean) : [],
      },
    };
    try {
      if (editing) {
        await apiClient.patch(`/api/v1/broadcasts/${editing.id}`, payload);
      } else {
        await apiClient.post("/api/v1/broadcasts", payload);
      }
      setShowModal(false);
      await load();
    } catch {}
    setSaving(false);
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign?")) return;
    try {
      await apiClient.delete(`/api/v1/broadcasts/${id}`);
      setCampaigns((p) => p.filter((c) => c.id !== id));
    } catch {}
  }

  async function sendCampaign(id: string) {
    setSending(id);
    try {
      const res = await apiClient.post(`/api/v1/broadcasts/${id}/send`);
      setCampaigns((p) => p.map((c) => c.id === id ? { ...c, ...res.data.data } : c));
      await load();
    } catch {}
    setSending(null);
  }

  async function doTestSend() {
    if (!testTarget || !testTo.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      await apiClient.post(`/api/v1/broadcasts/${testTarget.id}/test`, { to: testTo.trim() });
      setTestResult("success");
    } catch {
      setTestResult("error");
    }
    setTestSending(false);
  }

  async function loadStats(c: Campaign) {
    setStatsTarget(c);
    try {
      const res = await apiClient.get(`/api/v1/broadcasts/${c.id}/stats`);
      setStats(res.data.data);
    } catch {}
  }

  const visible = activeChannel === "all" ? campaigns : campaigns.filter((c) => c.channel === activeChannel);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Radio className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Broadcast Hub</h1>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Campaign</Button>
      </div>

      {/* Channel tabs */}
      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {[{ value: "all", label: "All", icon: Radio }, ...CHANNELS].map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => setActiveChannel(value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap font-medium transition-colors ${
              activeChannel === value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80 text-muted-foreground"
            }`}
          >
            <Icon className="h-3.5 w-3.5" /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : visible.length === 0 ? (
        <Card className="p-12 text-center">
          <Radio className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No campaigns yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create a broadcast campaign to reach your audience.</p>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Campaign</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((c) => {
            const ch = CHANNELS.find((ch) => ch.value === c.channel);
            const Icon = ch?.icon ?? MessageSquare;
            const tags = (c.target_filter.tags as string[]) ?? [];
            const chatbotName = c.target_filter.chatbot_id
              ? chatbots.find((b) => b.id === c.target_filter.chatbot_id)?.name
              : null;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{c.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] ?? ""}`}>
                          {c.status}
                        </span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{ch?.label}</span>
                      </div>
                      {c.subject && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">Subject: {c.subject}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.message_template || "(no message)"}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                        {chatbotName && (
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {chatbotName}</span>
                        )}
                        {tags.length > 0 && (
                          <span className="flex items-center gap-1"><Tag className="h-3 w-3" /> {tags.join(", ")}</span>
                        )}
                        {c.scheduled_at && c.status !== "sent" && (
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(c.scheduled_at).toLocaleString()}</span>
                        )}
                        {c.status === "sent" && (
                          <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" /> {c.sent_count} sent · {c.failed_count} failed
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => setPreviewTarget(c)} title="Preview">
                      <Eye className="h-4 w-4" />
                    </Button>
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => { setTestTarget(c); setTestTo(""); setTestResult(null); }} title="Test send">
                          <FlaskConical className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => sendCampaign(c.id)} disabled={sending === c.id} title="Send now">
                          {sending === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                        </Button>
                      </>
                    )}
                    {c.status === "sent" && (
                      <Button variant="ghost" size="sm" onClick={() => loadStats(c)} title="Stats">
                        <BarChart2 className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => openEdit(c)} disabled={c.status === "sending" || c.status === "sent"}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteCampaign(c.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Compose / Edit Modal ───────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">{editing ? "Edit Campaign" : "New Campaign"}</h2>
              <button onClick={() => setShowModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>Campaign Name *</Label>
                  <Input value={fName} onChange={(e) => setFName(e.target.value)} placeholder="e.g. Summer Sale" />
                </div>
                <div className="space-y-1">
                  <Label>Channel</Label>
                  <select value={fChannel} onChange={(e) => setFChannel(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm" disabled={!!editing}>
                    {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>Audience Segment</Label>
                  <select value={fSegment} onChange={(e) => setFSegment(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                    <option value="all">All Contacts</option>
                    <option value="contacts">Contacts Only</option>
                    <option value="subscribers">Channel Subscribers</option>
                  </select>
                </div>
              </div>

              {/* Audience filters */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Filter by Agent</Label>
                  <select value={fChatbotId} onChange={(e) => setFChatbotId(e.target.value)}
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                    <option value="">All Agents</option>
                    {chatbots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Filter by Tags</Label>
                  <Input value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="vip, summer" />
                </div>
              </div>

              {fChannel === "email" && (
                <div className="space-y-1">
                  <Label>Subject Line</Label>
                  <Input value={fSubject} onChange={(e) => setFSubject(e.target.value)} placeholder="Your subject here" />
                </div>
              )}
              <div className="space-y-1">
                <Label>Message {`(supports {{first_name}}, {{last_name}}, {{email}})`}</Label>
                <textarea
                  className="w-full h-28 p-2 text-sm rounded-md border bg-background resize-none"
                  value={fMessage} onChange={(e) => setFMessage(e.target.value)}
                  placeholder="Hello {{first_name}}, ..."
                />
              </div>
              {fChannel === "email" && (
                <div className="space-y-1">
                  <Label>HTML Content <span className="text-muted-foreground font-normal">(optional, overrides plain text)</span></Label>
                  <textarea
                    className="w-full h-24 p-2 text-xs font-mono rounded-md border bg-background resize-none"
                    value={fHtml} onChange={(e) => setFHtml(e.target.value)}
                    placeholder="<h1>Hello {{first_name}}</h1>..."
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Schedule <span className="text-muted-foreground font-normal">(leave empty to send now)</span></Label>
                <Input type="datetime-local" value={fScheduled} onChange={(e) => setFScheduled(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={save} disabled={saving || !fName.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editing ? "Save Changes" : "Create Campaign"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Preview Modal ──────────────────────────────────────────────────── */}
      {previewTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="font-semibold">Preview — {previewTarget.name}</h2>
                {previewTarget.subject && (
                  <p className="text-xs text-muted-foreground mt-0.5">Subject: {previewTarget.subject}</p>
                )}
              </div>
              <button onClick={() => setPreviewTarget(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-auto p-5">
              {previewTarget.html_content ? (
                <div
                  className="prose prose-sm max-w-none dark:prose-invert border rounded-lg p-4 bg-white text-black text-sm"
                  dangerouslySetInnerHTML={{ __html: renderPreview(previewTarget.message_template, previewTarget.html_content) }}
                />
              ) : (
                <div className="whitespace-pre-wrap text-sm border rounded-lg p-4 bg-muted/30">
                  {renderPreview(previewTarget.message_template, null)}
                </div>
              )}
            </div>
            <div className="p-4 border-t flex justify-between items-center text-xs text-muted-foreground">
              <span>Preview uses sample data: Jane Doe &lt;jane@example.com&gt;</span>
              <Button variant="outline" size="sm" onClick={() => setPreviewTarget(null)}>Close</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Test Send Modal ────────────────────────────────────────────────── */}
      {testTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">Test Send — {testTarget.name}</h2>
              <button onClick={() => setTestTarget(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Send a test {testTarget.channel === "email" ? "email" : "message"} with sample data to verify your campaign looks correct before sending to your audience.
              </p>
              <div className="space-y-1">
                <Label>{testTarget.channel === "email" ? "Email Address" : "Phone / Chat ID"}</Label>
                <Input
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder={testTarget.channel === "email" ? "you@example.com" : "+1234567890"}
                />
              </div>
              {testResult === "success" && (
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" /> Test message sent successfully!
                </p>
              )}
              {testResult === "error" && (
                <p className="text-sm text-destructive">Failed to send test. Check your integration config.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setTestTarget(null)}>Cancel</Button>
              <Button onClick={doTestSend} disabled={testSending || !testTo.trim()}>
                {testSending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FlaskConical className="h-4 w-4 mr-1" />}
                Send Test
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Modal ────────────────────────────────────────────────────── */}
      {statsTarget && stats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">{statsTarget.name} — Delivery Report</h2>
              <button onClick={() => { setStatsTarget(null); setStats(null); }}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Sent",          value: stats.sent_count,    color: "text-green-600 dark:text-green-400" },
                  { label: "Failed",        value: stats.failed_count,  color: "text-destructive" },
                  { label: "Total",         value: stats.total,         color: "" },
                  { label: "Delivery Rate", value: `${stats.delivery_rate}%`, color: "text-primary" },
                ].map((s) => (
                  <div key={s.label} className="bg-muted rounded-lg p-3 text-center">
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value as string | number}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                ))}
              </div>
              {statsTarget.sent_at && (
                <p className="text-xs text-center text-muted-foreground">
                  Sent on {new Date(statsTarget.sent_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
