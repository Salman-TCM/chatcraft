"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  MessageSquare,
  Search,
  Trash2,
  Loader2,
  Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";

interface Chatbot {
  id: string;
  name: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  chatbot_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count: number;
  messages: Message[];
}

interface PaginatedConversations {
  data: Conversation[];
  total: number;
  page: number;
  per_page: number;
}

export default function AnalyticsPage() {
  const router = useRouter();
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [conversations, setConversations] = useState<PaginatedConversations | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedConv, setExpandedConv] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [chatbotFilter, setChatbotFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    apiClient.get("/api/chatbots").then(({ data }) => setChatbots(data.data)).catch(() => {});
  }, []);

  useEffect(() => {
    loadConversations();
  }, [search, chatbotFilter, page]);

  async function loadConversations() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), per_page: "20" });
      if (search) params.set("search", search);
      if (chatbotFilter) params.set("chatbot_id", chatbotFilter);
      const { data } = await apiClient.get(`/api/analytics/conversations?${params}`);
      setConversations(data);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch() {
    setSearch(searchInput);
    setPage(1);
  }

  async function handleDelete(convId: string) {
    if (!confirm("Delete this conversation? This cannot be undone.")) return;
    setDeleting(convId);
    try {
      await apiClient.delete(`/api/chat/conversations/${convId}`);
      setConversations((prev) =>
        prev
          ? {
              ...prev,
              data: prev.data.filter((c) => c.id !== convId),
              total: prev.total - 1,
            }
          : prev
      );
    } finally {
      setDeleting(null);
    }
  }

  async function handleExportCsv() {
    const convs = conversations?.data ?? [];
    if (!convs.length) return;

    const rows: string[][] = [["conversation_id", "chatbot_id", "title", "created_at", "message_count"]];
    for (const c of convs) {
      rows.push([c.id, c.chatbot_id, c.title ?? "", c.created_at, String(c.message_count)]);
    }

    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `conversations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const total = conversations?.total ?? 0;
  const perPage = conversations?.per_page ?? 20;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const chatbotName = (id: string) => chatbots.find((b) => b.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Conversations</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {total} total conversation{total !== 1 ? "s" : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" className="gap-2" onClick={handleExportCsv} disabled={!conversations?.data.length}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="flex gap-1">
          <Input
            placeholder="Search conversations…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-56 h-9 text-sm"
          />
          <Button size="sm" className="h-9" onClick={handleSearch}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        <select
          value={chatbotFilter}
          onChange={(e) => { setChatbotFilter(e.target.value); setPage(1); }}
          className="h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All chatbots</option>
          {chatbots.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {(search || chatbotFilter) && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 text-xs"
            onClick={() => { setSearch(""); setSearchInput(""); setChatbotFilter(""); setPage(1); }}
          >
            Clear filters
          </Button>
        )}
      </div>

      <Separator />

      {/* Conversation list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !conversations?.data.length ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No conversations yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            {search ? "No results for your search." : "Conversations will appear here once users start chatting."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {conversations.data.map((conv) => (
            <Card key={conv.id} className="overflow-hidden">
              <div className="flex items-start gap-3 p-4">
                <div className="mt-0.5 shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">
                      {conv.title || "Untitled Conversation"}
                    </p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      via <span className="font-medium">{chatbotName(conv.chatbot_id)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-muted-foreground">
                      {conv.message_count} message{conv.message_count !== 1 ? "s" : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(conv.created_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 px-2 text-xs"
                    onClick={() => setExpandedConv(expandedConv === conv.id ? null : conv.id)}
                  >
                    {expandedConv === conv.id ? "Hide" : "View"}
                  </Button>
                  <button
                    className="rounded p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive"
                    disabled={deleting === conv.id}
                    onClick={() => handleDelete(conv.id)}
                  >
                    {deleting === conv.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {expandedConv === conv.id && conv.messages.length > 0 && (
                <div className="border-t bg-muted/30 px-4 py-3 space-y-2 max-h-80 overflow-y-auto">
                  {conv.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`rounded-lg px-3 py-2 text-xs max-w-[80%] ${
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "bg-background border"
                        }`}
                      >
                        <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        <p className={`mt-1 text-[10px] ${msg.role === "user" ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                          {new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {expandedConv === conv.id && conv.messages.length === 0 && (
                <div className="border-t bg-muted/30 px-4 py-3">
                  <p className="text-xs text-muted-foreground text-center">No messages loaded.</p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {page} of {totalPages} · {total} conversations
          </p>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8 w-8 p-0"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
