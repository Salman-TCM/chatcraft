"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Radio, Plus, Loader2, Pencil, Trash2, Send, X, BarChart2,
  Mail, MessageSquare, Phone, Bell, CheckCircle2,
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
  scheduled: "bg-blue-100 text-blue-700",
  sending:   "bg-yellow-100 text-yellow-700",
  sent:      "bg-green-100 text-green-700",
  failed:    "bg-red-100 text-red-600",
};

export default function BroadcastPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeChannel, setActiveChannel] = useState<string>("all");
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [statsTarget, setStatsTarget] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [sending, setSending] = useState<string | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeChannel === "all"
        ? "/api/v1/broadcasts?limit=100"
        : `/api/v1/broadcasts?channel=${activeChannel}&limit=100`;
      const res = await apiClient.get(url);
      setCampaigns(res.data.data ?? []);
    } catch {}
    setLoading(false);
  }, [activeChannel]);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setFName(""); setFChannel("email"); setFSubject(""); setFMessage("");
    setFHtml(""); setFScheduled(""); setFTags(""); setFSegment("all");
    setShowModal(true);
  }

  function openEdit(c: Campaign) {
    setEditing(c);
    setFName(c.name); setFChannel(c.channel);
    setFSubject(c.subject ?? ""); setFMessage(c.message_template);
    setFHtml(c.html_content ?? ""); setFScheduled(c.scheduled_at ?? "");
    setFTags((c.target_filter.tags as string[] ?? []).join(", "));
    setFSegment((c.target_filter.segment as string) ?? "all");
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
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{c.name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[c.status] ?? ""}`}>
                          {c.status}
                        </span>
                        <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{ch?.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{c.message_template || "(no message)"}</p>
                      {c.status === "sent" && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {c.sent_count} sent · {c.failed_count} failed
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {(c.status === "draft" || c.status === "scheduled") && (
                      <Button variant="ghost" size="sm" onClick={() => sendCampaign(c.id)} disabled={sending === c.id} title="Send now">
                        {sending === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
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

      {/* Create / Edit Modal */}
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
                  <Label>HTML Content <span className="text-muted-foreground font-normal">(optional, overrides message)</span></Label>
                  <textarea
                    className="w-full h-24 p-2 text-xs font-mono rounded-md border bg-background resize-none"
                    value={fHtml} onChange={(e) => setFHtml(e.target.value)}
                    placeholder="<h1>Hello {{first_name}}</h1>..."
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Filter by Tags <span className="text-muted-foreground font-normal">(comma-separated)</span></Label>
                  <Input value={fTags} onChange={(e) => setFTags(e.target.value)} placeholder="vip, summer" />
                </div>
                <div className="space-y-1">
                  <Label>Schedule <span className="text-muted-foreground font-normal">(leave empty to send now)</span></Label>
                  <Input type="datetime-local" value={fScheduled} onChange={(e) => setFScheduled(e.target.value)} />
                </div>
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

      {/* Stats modal */}
      {statsTarget && stats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">{statsTarget.name} — Stats</h2>
              <button onClick={() => { setStatsTarget(null); setStats(null); }}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              {[
                { label: "Sent", value: stats.sent_count as number, color: "text-green-600" },
                { label: "Failed", value: stats.failed_count as number, color: "text-red-500" },
                { label: "Total", value: stats.total as number, color: "" },
                { label: "Delivery Rate", value: `${stats.delivery_rate}%`, color: "text-primary" },
              ].map((s) => (
                <div key={s.label} className="bg-muted rounded-lg p-3 text-center">
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
