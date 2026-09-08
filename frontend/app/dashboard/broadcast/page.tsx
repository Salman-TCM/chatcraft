"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Radio, Plus, Loader2, Pencil, Trash2, Send, X, BarChart2,
  Mail, MessageSquare, Phone, Bell, Eye, FlaskConical,
  Clock, Users, Tag, CheckCircle2, Type, Image, MousePointerClick, Minus, AlignLeft, ChevronUp, ChevronDown,
} from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

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

const CHANNEL_VALUES = [
  "email", "sms", "telegram", "whatsapp", "messenger", "push", "phone",
] as const;

const CHANNELS: { value: (typeof CHANNEL_VALUES)[number]; label: string; icon: typeof Mail }[] = [
  { value: "email",     label: "Email",     icon: Mail },
  { value: "sms",       label: "SMS",       icon: MessageSquare },
  { value: "telegram",  label: "Telegram",  icon: MessageSquare },
  { value: "whatsapp",  label: "WhatsApp",  icon: MessageSquare },
  { value: "messenger", label: "Messenger", icon: MessageSquare },
  { value: "push",      label: "Push",      icon: Bell },
  { value: "phone",     label: "Phone",     icon: Phone },
];

const campaignSchema = z.object({
  name: z.string().min(1, "Campaign name is required"),
  channel: z.enum(CHANNEL_VALUES),
  subject: z.string().optional(),
  message_template: z.string().optional(),
  html_content: z.string().optional(),
  scheduled_at: z.string().optional(),
  tags: z.string().optional(),
  segment: z.string().optional(),
  chatbot_id: z.string().optional(),
});
type CampaignFormData = z.infer<typeof campaignSchema>;

const testSendSchema = z.object({
  to: z.string().min(1, "Recipient is required"),
});
type TestSendFormData = z.infer<typeof testSendSchema>;

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

  // Form
  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: "", channel: "email", subject: "", message_template: "",
      html_content: "", scheduled_at: "", tags: "", segment: "all", chatbot_id: "",
    },
  });
  const fChannel = form.watch("channel");

  // Preview modal
  const [previewTarget, setPreviewTarget] = useState<Campaign | null>(null);

  // Test send
  const [testTarget, setTestTarget] = useState<Campaign | null>(null);
  const testForm = useForm<TestSendFormData>({
    resolver: zodResolver(testSendSchema),
    defaultValues: { to: "" },
  });
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
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load campaigns", description: getErrorMessage(err) });
    }
    setLoading(false);
  }, [activeChannel]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    form.reset({
      name: "", channel: "email", subject: "", message_template: "",
      html_content: "", scheduled_at: "", tags: "", segment: "all", chatbot_id: "",
    });
    setShowModal(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    form.reset({
      name: c.name,
      channel: c.channel as CampaignFormData["channel"],
      subject: c.subject ?? "",
      message_template: c.message_template,
      html_content: c.html_content ?? "",
      scheduled_at: c.scheduled_at ?? "",
      tags: ((c.target_filter.tags as string[]) ?? []).join(", "),
      segment: (c.target_filter.segment as string) ?? "all",
      chatbot_id: (c.target_filter.chatbot_id as string) ?? "",
    });
    setShowModal(true);
  }

  async function onSubmit(data: CampaignFormData) {
    const payload = {
      name: data.name.trim(), channel: data.channel,
      subject: data.subject || null, message_template: data.message_template ?? "",
      html_content: data.html_content || null,
      scheduled_at: data.scheduled_at || null,
      target_filter: {
        segment: data.segment ?? "all",
        chatbot_id: data.chatbot_id || null,
        tags: data.tags ? data.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
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
    } catch (err) {
      toast({
        variant: "destructive",
        title: editing ? "Failed to update campaign" : "Failed to create campaign",
        description: getErrorMessage(err),
      });
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        form.setError(field as keyof CampaignFormData, { message });
      });
    }
  }

  async function deleteCampaign(id: string) {
    if (!confirm("Delete this campaign?")) return;
    try {
      await apiClient.delete(`/api/v1/broadcasts/${id}`);
      setCampaigns((p) => p.filter((c) => c.id !== id));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete campaign", description: getErrorMessage(err) });
    }
  }

  async function sendCampaign(id: string) {
    setSending(id);
    try {
      const res = await apiClient.post(`/api/v1/broadcasts/${id}/send`);
      setCampaigns((p) => p.map((c) => c.id === id ? { ...c, ...res.data.data } : c));
      await load();
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to send campaign", description: getErrorMessage(err) });
    }
    setSending(null);
  }

  async function onTestSubmit(data: TestSendFormData) {
    if (!testTarget) return;
    setTestResult(null);
    try {
      await apiClient.post(`/api/v1/broadcasts/${testTarget.id}/test`, { to: data.to.trim() });
      setTestResult("success");
    } catch (err) {
      setTestResult("error");
      toast({ variant: "destructive", title: "Failed to send test", description: getErrorMessage(err) });
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        testForm.setError(field as keyof TestSendFormData, { message });
      });
    }
  }

  async function loadStats(c: Campaign) {
    setStatsTarget(c);
    try {
      const res = await apiClient.get(`/api/v1/broadcasts/${c.id}/stats`);
      setStats(res.data.data);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load stats", description: getErrorMessage(err) });
      setStatsTarget(null);
    }
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
                        <Button variant="ghost" size="sm" onClick={() => { setTestTarget(c); testForm.reset({ to: "" }); setTestResult(null); }} title="Test send">
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
              <button className="inline-flex items-center justify-center" onClick={() => setShowModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 min-h-0">
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1 col-span-2">
                    <Label>Campaign Name *</Label>
                    <Input {...form.register("name")} placeholder="e.g. Summer Sale" />
                    {form.formState.errors.name && (
                      <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Channel</Label>
                    <select {...form.register("channel")}
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm" disabled={!!editing}>
                      {CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                    {form.formState.errors.channel && (
                      <p className="text-sm text-destructive">{form.formState.errors.channel.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Audience Segment</Label>
                    <select {...form.register("segment")}
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
                    <select {...form.register("chatbot_id")}
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                      <option value="">All Agents</option>
                      {chatbots.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Filter by Tags</Label>
                    <Input {...form.register("tags")} placeholder="vip, summer" />
                  </div>
                </div>

                {fChannel === "email" && (
                  <div className="space-y-1">
                    <Label>Subject Line</Label>
                    <Input {...form.register("subject")} placeholder="Your subject here" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Message {`(supports {{first_name}}, {{last_name}}, {{email}})`}</Label>
                  <textarea
                    className="w-full h-28 p-2 text-sm rounded-md border bg-background resize-none"
                    {...form.register("message_template")}
                    placeholder="Hello {{first_name}}, ..."
                  />
                </div>
                {fChannel === "email" && (
                  <div className="space-y-1">
                    <Label>Email Template <span className="text-muted-foreground font-normal">(drag-and-drop builder)</span></Label>
                    <Controller
                      control={form.control}
                      name="html_content"
                      render={({ field }) => (
                        <EmailTemplateBuilder value={field.value ?? ""} onChange={field.onChange} />
                      )}
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Schedule <span className="text-muted-foreground font-normal">(leave empty to send now)</span></Label>
                  <Input type="datetime-local" {...form.register("scheduled_at")} />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editing ? "Save Changes" : "Create Campaign"}
                </Button>
              </div>
            </form>
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
              <button className="inline-flex items-center justify-center" onClick={() => setPreviewTarget(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
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
              <button className="inline-flex items-center justify-center" onClick={() => setTestTarget(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Send a test {testTarget.channel === "email" ? "email" : "message"} with sample data to verify your campaign looks correct before sending to your audience.
              </p>
              <div className="space-y-1">
                <Label>{testTarget.channel === "email" ? "Email Address" : "Phone / Chat ID"}</Label>
                <Input
                  {...testForm.register("to")}
                  placeholder={testTarget.channel === "email" ? "you@example.com" : "+1234567890"}
                />
                {testForm.formState.errors.to && (
                  <p className="text-sm text-destructive">{testForm.formState.errors.to.message}</p>
                )}
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
              <Button
                onClick={testForm.handleSubmit(onTestSubmit)}
                disabled={testForm.formState.isSubmitting || !testForm.watch("to")?.trim()}
              >
                {testForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <FlaskConical className="h-4 w-4 mr-1" />}
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
              <button className="inline-flex items-center justify-center" onClick={() => { setStatsTarget(null); setStats(null); }}><X className="h-5 w-5 text-muted-foreground" /></button>
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

// ── Email Template Builder ─────────────────────────────────────────────────────

type BlockType = "header" | "text" | "image" | "button" | "divider" | "footer";
interface EmailBlock { id: string; type: BlockType; content: string; props?: Record<string, string> }

const BLOCK_PALETTE: { type: BlockType; icon: React.ReactNode; label: string }[] = [
  { type: "header", icon: <Type className="h-3.5 w-3.5" />, label: "Header" },
  { type: "text", icon: <AlignLeft className="h-3.5 w-3.5" />, label: "Text" },
  { type: "image", icon: <Image className="h-3.5 w-3.5" />, label: "Image" },
  { type: "button", icon: <MousePointerClick className="h-3.5 w-3.5" />, label: "Button" },
  { type: "divider", icon: <Minus className="h-3.5 w-3.5" />, label: "Divider" },
  { type: "footer", icon: <AlignLeft className="h-3.5 w-3.5" />, label: "Footer" },
];

function blockToHtml(b: EmailBlock): string {
  switch (b.type) {
    case "header":
      return `<h1 style="font-family:sans-serif;font-size:28px;font-weight:700;color:#111;margin:0 0 16px">${b.content}</h1>`;
    case "text":
      return `<p style="font-family:sans-serif;font-size:15px;color:#444;line-height:1.7;margin:0 0 16px">${b.content}</p>`;
    case "image":
      return `<img src="${b.content}" alt="" style="max-width:100%;border-radius:8px;margin:0 0 16px;display:block" />`;
    case "button":
      return `<a href="${b.props?.href ?? "#"}" style="display:inline-block;background:#6366f1;color:#fff;font-family:sans-serif;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;margin:0 0 16px">${b.content}</a>`;
    case "divider":
      return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0" />`;
    case "footer":
      return `<p style="font-family:sans-serif;font-size:12px;color:#9ca3af;text-align:center;margin:16px 0 0">${b.content}</p>`;
    default:
      return b.content;
  }
}

function blocksToHtml(blocks: EmailBlock[]): string {
  const inner = blocks.map(blockToHtml).join("\n");
  return `<div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;font-family:sans-serif">${inner}</div>`;
}

function generateBlockId() { return Math.random().toString(36).slice(2, 8); }

function EmailTemplateBuilder({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [tab, setTab] = useState<"visual" | "html" | "preview">("visual");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const dragBlockType = useRef<BlockType | null>(null);

  // Sync from external value (when editing existing campaign) — only on mount
  useEffect(() => {
    if (value && blocks.length === 0) {
      // Can't reliably parse arbitrary HTML back to blocks — just show in HTML mode
      if (value.trim()) setTab("html");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addBlock(type: BlockType) {
    const defaults: Record<BlockType, { content: string; props?: Record<string, string> }> = {
      header: { content: "Your Email Headline" },
      text: { content: "Write your message here. Use {{first_name}} for personalization." },
      image: { content: "https://placehold.co/600x300/e5e7eb/6b7280?text=Image" },
      button: { content: "Click Here", props: { href: "https://example.com" } },
      divider: { content: "" },
      footer: { content: "© 2025 Your Company · Unsubscribe" },
    };
    const d = defaults[type];
    const block: EmailBlock = { id: generateBlockId(), type, content: d.content, props: d.props };
    setBlocks((prev) => {
      const next = [...prev, block];
      onChange(blocksToHtml(next));
      return next;
    });
    setEditingId(block.id);
  }

  function updateBlock(id: string, content: string, props?: Record<string, string>) {
    setBlocks((prev) => {
      const next = prev.map((b) => b.id === id ? { ...b, content, props: props ?? b.props } : b);
      onChange(blocksToHtml(next));
      return next;
    });
  }

  function removeBlock(id: string) {
    setBlocks((prev) => {
      const next = prev.filter((b) => b.id !== id);
      onChange(blocksToHtml(next));
      return next;
    });
    if (editingId === id) setEditingId(null);
  }

  function moveBlock(id: string, dir: -1 | 1) {
    setBlocks((prev) => {
      const idx = prev.findIndex((b) => b.id === id);
      if (idx < 0) return prev;
      const next = [...prev];
      const swap = idx + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      onChange(blocksToHtml(next));
      return next;
    });
  }

  const editingBlock = blocks.find((b) => b.id === editingId);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b bg-muted/30">
        {(["visual", "html", "preview"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-medium capitalize transition-colors ${tab === t ? "bg-background border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            {t === "visual" ? "Visual Builder" : t === "html" ? "Raw HTML" : "Preview"}
          </button>
        ))}
      </div>

      {tab === "visual" && (
        <div className="flex" style={{ minHeight: 320 }}>
          {/* Block palette */}
          <div className="w-28 border-r bg-muted/20 p-2 flex flex-col gap-1 shrink-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Blocks</p>
            {BLOCK_PALETTE.map((b) => (
              <button
                key={b.type}
                draggable
                onDragStart={() => { dragBlockType.current = b.type; }}
                onClick={() => addBlock(b.type)}
                className="flex items-center gap-1.5 text-xs px-2 py-1.5 rounded hover:bg-background border border-transparent hover:border-border transition-colors cursor-grab text-left"
              >
                {b.icon} {b.label}
              </button>
            ))}
          </div>

          {/* Canvas */}
          <div
            className={`flex-1 p-3 overflow-y-auto ${dragOver ? "bg-primary/5" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (dragBlockType.current) { addBlock(dragBlockType.current); dragBlockType.current = null; }
            }}
          >
            {blocks.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground border-2 border-dashed rounded-lg p-6 text-center">
                Click or drag blocks from the left panel to build your email
              </div>
            ) : (
              <div className="space-y-1">
                {blocks.map((b, i) => (
                  <div
                    key={b.id}
                    className={`group relative border rounded p-2 cursor-pointer transition-colors ${editingId === b.id ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"}`}
                    onClick={() => setEditingId(b.id === editingId ? null : b.id)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground capitalize font-medium">{b.type}</span>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, -1); }} disabled={i === 0} className="inline-flex items-center justify-center p-0.5 hover:text-foreground text-muted-foreground disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); moveBlock(b.id, 1); }} disabled={i === blocks.length - 1} className="inline-flex items-center justify-center p-0.5 hover:text-foreground text-muted-foreground disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                        <button onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }} className="inline-flex items-center justify-center p-0.5 hover:text-destructive text-muted-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    </div>
                    {b.type === "divider" ? (
                      <hr className="border-gray-200" />
                    ) : b.type === "image" ? (
                      <img src={b.content} alt="" className="max-h-16 rounded object-cover" />
                    ) : (
                      <p className="text-xs text-foreground truncate">{b.content}</p>
                    )}
                    {editingId === b.id && (
                      <div className="mt-2 space-y-1" onClick={(e) => e.stopPropagation()}>
                        {b.type !== "divider" && (
                          <textarea
                            className="w-full p-1.5 text-xs border rounded resize-none bg-background"
                            rows={b.type === "text" ? 4 : 2}
                            value={b.content}
                            onChange={(e) => updateBlock(b.id, e.target.value, b.props)}
                            placeholder={b.type === "image" ? "Image URL" : b.type === "button" ? "Button label" : "Content"}
                            autoFocus
                          />
                        )}
                        {b.type === "button" && (
                          <input
                            className="w-full p-1.5 text-xs border rounded bg-background"
                            value={b.props?.href ?? ""}
                            onChange={(e) => updateBlock(b.id, b.content, { ...b.props, href: e.target.value })}
                            placeholder="Button URL (https://...)"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "html" && (
        <textarea
          className="w-full p-3 text-xs font-mono bg-background resize-none"
          style={{ minHeight: 320 }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="<h1>Hello {{first_name}}</h1>..."
        />
      )}

      {tab === "preview" && (
        <div className="overflow-y-auto" style={{ minHeight: 320 }}>
          {value ? (
            <iframe
              srcDoc={`<!DOCTYPE html><html><body style="margin:0;background:#f3f4f6">${value}</body></html>`}
              className="w-full border-0"
              style={{ minHeight: 320 }}
              sandbox="allow-same-origin"
              title="Email preview"
            />
          ) : (
            <div className="flex items-center justify-center h-48 text-xs text-muted-foreground">No content yet. Build your email in the Visual Builder or Raw HTML tab.</div>
          )}
        </div>
      )}
    </div>
  );
}
