"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ExternalLink,
  Loader2,
  MoreVertical,
  Palette,
  Plus,
  Settings,
  Trash2,
  Code2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Chatbot {
  id: string;
  name: string;
  default_model: string;
  published: boolean;
  created_at: string;
}

export default function ChatbotsPage() {
  const router = useRouter();
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadChatbots();
  }, []);

  async function loadChatbots() {
    try {
      const { data } = await apiClient.get("/api/chatbots");
      setChatbots(data.data);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { data } = await apiClient.post("/api/chatbots", { name: newName.trim() });
      setShowCreate(false);
      setNewName("");
      router.push(`/dashboard/chatbots/${data.data.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this chatbot? All conversations will be lost.")) return;
    setDeleting(id);
    try {
      await apiClient.delete(`/api/chatbots/${id}`);
      setChatbots((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setDeleting(null);
      setMenuOpen(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Chatbots</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {chatbots.length} chatbot{chatbots.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Chatbot
        </Button>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card className="p-5">
          <p className="text-sm font-semibold mb-3">Create Chatbot</p>
          <div className="flex gap-2">
            <Input
              autoFocus
              placeholder="e.g. Support Bot"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="max-w-xs"
            />
            <Button disabled={creating || !newName.trim()} onClick={handleCreate}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
            </Button>
            <Button variant="outline" onClick={() => { setShowCreate(false); setNewName(""); }}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && chatbots.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
          <Bot className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No chatbots yet</p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            Create your first chatbot to get started
          </p>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Chatbot
          </Button>
        </div>
      )}

      {/* Chatbot grid */}
      {!loading && chatbots.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {chatbots.map((bot) => (
            <Card key={bot.id} className="relative flex flex-col p-5 gap-3 hover:shadow-md transition-shadow">
              {/* Title row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Bot className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{bot.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{bot.default_model}</p>
                  </div>
                </div>

                {/* Three-dot menu */}
                <div className="relative shrink-0">
                  <button
                    className="rounded p-1 hover:bg-muted"
                    onClick={() => setMenuOpen(menuOpen === bot.id ? null : bot.id)}
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                  {menuOpen === bot.id && (
                    <div className="absolute right-0 top-7 z-10 w-44 rounded-lg border bg-popover shadow-lg py-1">
                      <MenuItem icon={Settings} label="Settings" onClick={() => router.push(`/dashboard/chatbots/${bot.id}`)} />
                      <MenuItem icon={Palette} label="Branding" onClick={() => router.push(`/dashboard/chatbots/${bot.id}/branding`)} />
                      <MenuItem icon={Code2} label="Embed Widget" onClick={() => router.push(`/dashboard/chatbots/${bot.id}/widget`)} />
                      <MenuItem icon={ExternalLink} label="Open Chat" onClick={() => window.open(`/chat/${bot.id}`, "_blank")} />
                      <div className="my-1 border-t" />
                      <MenuItem
                        icon={deleting === bot.id ? Loader2 : Trash2}
                        label="Delete"
                        danger
                        onClick={() => handleDelete(bot.id)}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Status badge */}
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  bot.published
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${bot.published ? "bg-green-500" : "bg-muted-foreground"}`} />
                  {bot.published ? "Published" : "Draft"}
                </span>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 mt-auto pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 h-8 text-xs gap-1"
                  onClick={() => router.push(`/dashboard/chatbots/${bot.id}`)}
                >
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs gap-1 px-2"
                  onClick={() => window.open(`/chat/${bot.id}`, "_blank")}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Close menu on outside click */}
      {menuOpen && (
        <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(null)} />
      )}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted ${
        danger ? "text-destructive" : "text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}
