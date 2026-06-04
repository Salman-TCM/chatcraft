"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search, X, Send, StickyNote, UserCheck, UserX, CheckCheck,
  RotateCcw, ChevronDown, Inbox, Bot, User, Clock, Filter, Shuffle, Contact2, Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Contact { id: string; name: string | null; email: string | null; phone: string | null }
interface ContactDetail {
  id: string; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; company: string | null; tags: string[];
}

interface ConvSummary {
  id: string;
  chatbot_id: string;
  title: string | null;
  channel: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  contact: Contact | null;
  last_message: { role: string; content: string } | null;
  assigned_to: { id: string; email: string; name: string | null } | null;
}

interface Message { id: string; role: string; content: string; model: string | null; created_at: string }
interface Note { id: string; content: string; author: { id: string; name: string | null } | null; created_at: string }

interface ConvDetail extends ConvSummary {
  messages: Message[];
  notes: Note[];
}

interface TeamMember { id: string; member_email: string; member_user_id: string | null; role: string; status: string }

// ── Constants ─────────────────────────────────────────────────────────────────

const CHANNEL_ICONS: Record<string, string> = {
  web: "🌐", facebook: "📘", instagram: "📷", whatsapp: "💬",
  telegram: "✈️", discord: "🎮", sms: "📱", phone: "📞",
  twitter: "🐦", tiktok: "🎵", email: "📧",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  closed: "bg-slate-100 text-slate-500",
  human_takeover: "bg-amber-100 text-amber-700",
};

const CHANNELS = ["", "web", "facebook", "instagram", "whatsapp", "telegram", "discord", "sms", "phone", "email"];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const [conversations, setConversations] = useState<ConvSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [channelFilter, setChannelFilter] = useState("");
  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<ConvDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [replyText, setReplyText] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [noteText, setNoteText] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [sending, setSending] = useState(false);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [showAssign, setShowAssign] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [contactDetail, setContactDetail] = useState<ContactDetail | null>(null);
  const [contactEdit, setContactEdit] = useState<Partial<ContactDetail>>({});
  const [savingContact, setSavingContact] = useState(false);
  const [assigningRR, setAssigningRR] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const LIMIT = 30;

  // ── Load conversation list ───────────────────────────────────────────────

  const loadList = useCallback(async (q: string, st: string, ch: string, p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (st) params.set("status", st);
      if (ch) params.set("channel", ch);

      let res;
      if (q.trim()) {
        res = await apiClient.get(`/api/v1/conversations/search?q=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT}`);
        setConversations(p === 1 ? res.data.data : (prev) => [...prev, ...res.data.data]);
        setTotal(res.data.data.length);
      } else {
        res = await apiClient.get(`/api/v1/conversations?${params}`);
        setConversations(p === 1 ? res.data.data : (prev) => [...prev, ...res.data.data]);
        setTotal(res.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    loadList(query, statusFilter, channelFilter, 1);
  }, [query, statusFilter, channelFilter, loadList]);

  // ── Load team members ────────────────────────────────────────────────────

  useEffect(() => {
    apiClient.get("/api/v1/team").then((r) => setTeamMembers(r.data.data)).catch(() => {});
  }, []);

  // ── Polling: refresh selected conversation every 5s ──────────────────────

  useEffect(() => {
    if (!selected) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiClient.get(`/api/v1/conversations/${selected.id}`);
        setSelected(res.data.data);
        // Update list entry
        setConversations((prev) =>
          prev.map((c) => c.id === selected.id ? { ...c, ...res.data.data } : c)
        );
      } catch {}
    }, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [selected?.id]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selected?.messages]);

  // ── Select conversation ──────────────────────────────────────────────────

  async function selectConv(id: string) {
    setLoadingDetail(true);
    try {
      const res = await apiClient.get(`/api/v1/conversations/${id}`);
      setSelected(res.data.data);
      setConversations((prev) =>
        prev.map((c) => c.id === id ? { ...c, unread_count: 0 } : c)
      );
    } finally {
      setLoadingDetail(false);
    }
  }

  // ── Reply ────────────────────────────────────────────────────────────────

  async function sendReply() {
    if (!selected || !replyText.trim()) return;
    setSending(true);
    try {
      if (selected.channel === "email" && attachments.length > 0) {
        const form = new FormData();
        form.append("content", replyText.trim());
        attachments.forEach((f) => form.append("files", f));
        await apiClient.post(`/api/v1/conversations/${selected.id}/send-with-attachments`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setAttachments([]);
      } else {
        await apiClient.post(`/api/v1/conversations/${selected.id}/messages`, {
          content: replyText.trim(),
          role: "assistant",
        });
      }
      setReplyText("");
      const res = await apiClient.get(`/api/v1/conversations/${selected.id}`);
      setSelected(res.data.data);
    } finally {
      setSending(false);
    }
  }

  // ── Internal note ────────────────────────────────────────────────────────

  async function addNote() {
    if (!selected || !noteText.trim()) return;
    await apiClient.post(`/api/v1/conversations/${selected.id}/notes`, { content: noteText.trim() });
    setNoteText("");
    const res = await apiClient.get(`/api/v1/conversations/${selected.id}`);
    setSelected(res.data.data);
  }

  // ── Status actions ───────────────────────────────────────────────────────

  async function setStatus(action: "close" | "reopen" | "takeover") {
    if (!selected) return;
    const endpoint = action === "close"
      ? `/api/v1/conversations/${selected.id}/close`
      : action === "reopen"
        ? `/api/v1/conversations/${selected.id}/reopen`
        : `/api/v1/conversations/${selected.id}/takeover`;
    await apiClient.post(endpoint);
    const res = await apiClient.get(`/api/v1/conversations/${selected.id}`);
    setSelected(res.data.data);
    loadList(query, statusFilter, channelFilter, 1);
    setPage(1);
  }

  // ── Assign ───────────────────────────────────────────────────────────────

  async function assignTo(userId: string) {
    if (!selected) return;
    await apiClient.post(`/api/v1/conversations/${selected.id}/assign`, { user_id: userId });
    const res = await apiClient.get(`/api/v1/conversations/${selected.id}`);
    setSelected(res.data.data);
    setShowAssign(false);
  }

  async function assignRoundRobin() {
    if (!selected) return;
    setAssigningRR(true);
    try {
      await apiClient.post(`/api/v1/conversations/${selected.id}/assign-roundrobin`);
      const res = await apiClient.get(`/api/v1/conversations/${selected.id}`);
      setSelected(res.data.data);
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? "Round-robin failed");
    } finally {
      setAssigningRR(false);
    }
  }

  // ── Contact quick-edit ───────────────────────────────────────────────────

  async function loadContact() {
    if (!selected) return;
    try {
      const res = await apiClient.get(`/api/v1/conversations/${selected.id}/contact`);
      const d = res.data.data as ContactDetail;
      setContactDetail(d);
      setContactEdit({ first_name: d.first_name ?? "", last_name: d.last_name ?? "", email: d.email ?? "", phone: d.phone ?? "", company: d.company ?? "", tags: d.tags });
    } catch {
      setContactDetail(null);
    }
  }

  async function saveContact() {
    if (!selected) return;
    setSavingContact(true);
    try {
      const res = await apiClient.patch(`/api/v1/conversations/${selected.id}/contact`, contactEdit);
      setContactDetail(res.data.data);
    } finally {
      setSavingContact(false);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const displayName = (c: ConvSummary) =>
    c.contact?.name ?? c.contact?.email ?? c.contact?.phone ?? c.title ?? "Visitor";

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── LEFT PANEL — conversation list ── */}
      <div className="flex w-80 shrink-0 flex-col border-r">
        {/* Header */}
        <div className="border-b p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Inbox className="h-4 w-4" /> Inbox
              {total > 0 && <span className="text-xs text-muted-foreground">({total})</span>}
            </h2>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8 h-8 text-xs"
              placeholder="Search contacts…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && (
              <button className="absolute right-2.5 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}>
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="human_takeover">Takeover</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">All channels</option>
              {CHANNELS.slice(1).map((c) => (
                <option key={c} value={c}>{CHANNEL_ICONS[c]} {c}</option>
              ))}
            </select>
          </div>
        </div>

        {/* List */}
        <ScrollArea className="flex-1">
          {loading && conversations.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-muted-foreground">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2">
              <Inbox className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No conversations</p>
            </div>
          ) : (
            <div>
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectConv(c.id)}
                  className={`w-full border-b p-3 text-left transition-colors hover:bg-muted/50 ${
                    selected?.id === c.id ? "bg-muted" : ""
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold">
                      {(displayName(c)[0] ?? "?").toUpperCase()}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="text-xs font-semibold truncate">{displayName(c)}</p>
                        <span className="text-[10px] text-muted-foreground shrink-0">
                          {c.last_message_at
                            ? new Date(c.last_message_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                            : ""}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-[10px]">{CHANNEL_ICONS[c.channel] ?? "💬"}</span>
                        <span className={`inline-flex rounded px-1 py-0.5 text-[10px] font-medium ${STATUS_COLORS[c.status]}`}>
                          {c.status === "human_takeover" ? "takeover" : c.status}
                        </span>
                        {c.unread_count > 0 && (
                          <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-indigo-600 px-1 text-[10px] font-bold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </div>

                      {c.last_message && (
                        <p className="mt-1 text-[11px] text-muted-foreground truncate">
                          {c.last_message.role === "user" ? "" : "You: "}{c.last_message.content}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              {conversations.length < total && (
                <button
                  className="w-full py-2 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { const next = page + 1; setPage(next); loadList(query, statusFilter, channelFilter, next); }}
                >
                  Load more
                </button>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* ── RIGHT PANEL — conversation detail ── */}
      {!selected ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Inbox className="h-12 w-12 opacity-30" />
          <p className="text-sm">Select a conversation</p>
        </div>
      ) : loadingDetail ? (
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Conversation header */}
          <div className="flex items-center justify-between border-b px-4 py-3 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 text-xs font-semibold">
                {(displayName(selected)[0] ?? "?").toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{displayName(selected)}</p>
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>{CHANNEL_ICONS[selected.channel]} {selected.channel}</span>
                  <span>·</span>
                  <span className={`rounded px-1 py-0.5 font-medium ${STATUS_COLORS[selected.status]}`}>
                    {selected.status === "human_takeover" ? "human takeover" : selected.status}
                  </span>
                  {selected.assigned_to && (
                    <>
                      <span>·</span>
                      <span>Assigned to {selected.assigned_to.name ?? selected.assigned_to.email}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              {selected.status === "active" && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatus("takeover")}>
                  <UserCheck className="h-3.5 w-3.5" /> Take over
                </Button>
              )}
              {selected.status === "human_takeover" && (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatus("reopen")}>
                  <Bot className="h-3.5 w-3.5" /> Release AI
                </Button>
              )}
              {selected.status !== "closed" ? (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatus("close")}>
                  <CheckCheck className="h-3.5 w-3.5" /> Close
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setStatus("reopen")}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reopen
                </Button>
              )}

              {/* Assign */}
              <div className="relative">
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAssign((v) => !v)}>
                  <User className="h-3.5 w-3.5" /> Assign <ChevronDown className="h-3 w-3" />
                </Button>
                {showAssign && (
                  <div className="absolute right-0 top-full z-20 mt-1 w-56 rounded-lg border bg-background shadow-lg py-1">
                    {teamMembers.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-muted-foreground">No team members yet.</p>
                    ) : (
                      teamMembers.filter((m) => m.member_user_id).map((m) => (
                        <button
                          key={m.id}
                          onClick={() => assignTo(m.member_user_id!)}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-muted transition-colors"
                        >
                          {m.member_email}
                        </button>
                      ))
                    )}
                    <div className="border-t mt-1 pt-1">
                      <button
                        onClick={() => setShowAssign(false)}
                        className="w-full px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Round-robin assign */}
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={assignRoundRobin}
                disabled={assigningRR}
                title="Auto-assign to next available team member"
              >
                <Shuffle className="h-3.5 w-3.5" /> Auto-assign
              </Button>

              {/* Contact panel toggle */}
              <Button
                size="sm"
                variant={showContact ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => { setShowContact((v) => !v); if (!showContact) loadContact(); }}
              >
                <Contact2 className="h-3.5 w-3.5" /> Contact
              </Button>

              {/* Notes toggle */}
              <Button
                size="sm"
                variant={showNotes ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setShowNotes((v) => !v)}
              >
                <StickyNote className="h-3.5 w-3.5" />
                Notes {selected.notes.length > 0 && `(${selected.notes.length})`}
              </Button>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* Message thread */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-3 max-w-3xl mx-auto">
                  {selected.messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-[72%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
                          m.role === "user"
                            ? "bg-muted text-foreground rounded-tl-sm"
                            : m.role === "assistant"
                              ? "bg-indigo-600 text-white rounded-tr-sm"
                              : "bg-amber-100 text-amber-800 text-xs italic rounded-lg"
                        }`}
                      >
                        {m.content}
                        <div className={`mt-1 text-[10px] ${m.role === "user" ? "text-muted-foreground" : "text-white/60"}`}>
                          {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          {m.model && <span className="ml-1 opacity-70">· {m.model.split("-").slice(0, 2).join("-")}</span>}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              </ScrollArea>

              {/* Reply box */}
              {selected.status !== "closed" && (
                <div className="border-t p-3">
                  <div className="flex gap-2 items-end max-w-3xl mx-auto">
                    <div className="flex-1 space-y-1">
                      <Textarea
                        className="min-h-[60px] resize-none text-sm"
                        placeholder="Type a reply… (Shift+Enter for new line)"
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            sendReply();
                          }
                        }}
                      />
                      {selected.channel === "email" && attachments.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {attachments.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1 text-xs bg-muted rounded px-2 py-0.5">
                              <Paperclip className="h-3 w-3" />{f.name}
                              <button onClick={() => setAttachments((p) => p.filter((_, j) => j !== i))} className="ml-1 text-muted-foreground hover:text-destructive">×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {selected.channel === "email" && (
                      <>
                        <input
                          ref={attachInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => {
                            const newFiles = Array.from(e.target.files ?? []);
                            setAttachments((prev) => {
                              const combined = [...prev, ...newFiles].slice(0, 5);
                              return combined;
                            });
                            e.target.value = "";
                          }}
                        />
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-10 w-10 shrink-0"
                          onClick={() => attachInputRef.current?.click()}
                          title="Attach files (max 5, 25 MB)"
                        >
                          <Paperclip className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                    <Button
                      size="icon"
                      className="h-10 w-10 shrink-0"
                      onClick={sendReply}
                      disabled={sending || !replyText.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Contact quick-edit sidebar */}
            {showContact && (
              <div className="flex w-72 shrink-0 flex-col border-l">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <Contact2 className="h-3.5 w-3.5" /> Contact Info
                  </p>
                </div>
                {!contactDetail ? (
                  <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground p-4 text-center">
                    No contact linked to this conversation.
                  </div>
                ) : (
                  <>
                    <ScrollArea className="flex-1 p-3">
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium">First name</label>
                            <Input
                              className="h-7 text-xs mt-0.5"
                              value={contactEdit.first_name ?? ""}
                              onChange={(e) => setContactEdit((p) => ({ ...p, first_name: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium">Last name</label>
                            <Input
                              className="h-7 text-xs mt-0.5"
                              value={contactEdit.last_name ?? ""}
                              onChange={(e) => setContactEdit((p) => ({ ...p, last_name: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium">Email</label>
                          <Input
                            className="h-7 text-xs mt-0.5"
                            type="email"
                            value={contactEdit.email ?? ""}
                            onChange={(e) => setContactEdit((p) => ({ ...p, email: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium">Phone</label>
                          <Input
                            className="h-7 text-xs mt-0.5"
                            value={contactEdit.phone ?? ""}
                            onChange={(e) => setContactEdit((p) => ({ ...p, phone: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium">Company</label>
                          <Input
                            className="h-7 text-xs mt-0.5"
                            value={contactEdit.company ?? ""}
                            onChange={(e) => setContactEdit((p) => ({ ...p, company: e.target.value }))}
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium">Tags (comma-separated)</label>
                          <Input
                            className="h-7 text-xs mt-0.5"
                            value={(contactEdit.tags ?? []).join(", ")}
                            onChange={(e) => setContactEdit((p) => ({
                              ...p,
                              tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean),
                            }))}
                          />
                        </div>
                      </div>
                    </ScrollArea>
                    <div className="border-t p-3">
                      <Button size="sm" className="w-full" onClick={saveContact} disabled={savingContact}>
                        {savingContact ? "Saving…" : "Save Changes"}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Notes sidebar */}
            {showNotes && (
              <div className="flex w-72 shrink-0 flex-col border-l">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    <StickyNote className="h-3.5 w-3.5" /> Internal Notes
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Not visible to the contact</p>
                </div>
                <ScrollArea className="flex-1 p-3">
                  <div className="space-y-2.5">
                    {selected.notes.length === 0 && (
                      <p className="text-xs text-muted-foreground">No notes yet.</p>
                    )}
                    {selected.notes.map((n) => (
                      <div key={n.id} className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                        <p className="text-xs leading-relaxed">{n.content}</p>
                        <p className="mt-1.5 text-[10px] text-muted-foreground">
                          {n.author?.name ?? "Unknown"} · {new Date(n.created_at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
                <div className="border-t p-3 space-y-2">
                  <Textarea
                    className="min-h-[60px] resize-none text-xs"
                    placeholder="Add a note…"
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                  />
                  <Button size="sm" className="w-full" onClick={addNote} disabled={!noteText.trim()}>
                    Add Note
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
