"use client";

import { useEffect, useState } from "react";
import { MessageSquarePlus, Search, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiClient } from "@/lib/api";
import type { Conversation } from "./types";

interface ConversationSidebarProps {
  chatbotId: string;
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

export function ConversationSidebar({
  chatbotId,
  activeId,
  onSelect,
  onNew,
}: ConversationSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadConversations();
  }, [chatbotId]);

  async function loadConversations() {
    try {
      const { data } = await apiClient.get(
        `/api/chat/${chatbotId}/history?per_page=50`
      );
      setConversations(data.data ?? []);
    } catch {
      // silently ignore; user may not be logged in
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    try {
      await apiClient.delete(`/api/chat/conversations/${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) onNew();
    } catch {}
  }

  const filtered = conversations.filter((c) =>
    (c.title ?? "New conversation").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-muted/20">
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm font-medium">Conversations</span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={onNew}
          title="New conversation"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </Button>
      </div>

      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="flex-1 px-2 pb-2">
        {loading && (
          <p className="px-2 py-4 text-xs text-muted-foreground">Loading…</p>
        )}
        {!loading && filtered.length === 0 && (
          <p className="px-2 py-4 text-xs text-muted-foreground">
            {search ? "No results" : "No conversations yet"}
          </p>
        )}
        {filtered.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={cn(
              "group flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-xs hover:bg-accent transition-colors",
              activeId === conv.id && "bg-accent font-medium"
            )}
          >
            <span className="truncate">{conv.title ?? "New conversation"}</span>
            <Trash2
              className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
              onClick={(e) => handleDelete(e, conv.id)}
            />
          </button>
        ))}
      </ScrollArea>
    </aside>
  );
}
