"use client";

import { useEffect, useState } from "react";
import { Search, X, Bot, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";

interface AdminChatbot {
  id: string;
  name: string;
  default_model: string;
  published: boolean;
  created_at: string;
  owner: { id: string; email: string; name: string | null } | null;
}

export default function AdminChatbotsPage() {
  const [bots, setBots] = useState<AdminChatbot[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const LIMIT = 50;

  async function load(q: string, p: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (q) params.set("q", q);
      const res = await apiClient.get(`/api/admin/chatbots?${params}`);
      setBots(p === 1 ? res.data.data : (prev) => [...prev, ...res.data.data]);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(1); load(query, 1); }, [query]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">All Chatbots</h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} chatbots across all users</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search by name…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button className="inline-flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}>
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Owner</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Model</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => (
                <tr key={b.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                        <Bot className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-medium">{b.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-xs font-medium">{b.owner?.name ?? b.owner?.email ?? "—"}</p>
                      {b.owner?.name && <p className="text-xs text-muted-foreground">{b.owner.email}</p>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-muted-foreground">{b.default_model}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${
                      b.published ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}>
                      {b.published ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {b.owner && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => window.open(`/admin/users/${b.owner!.id}`, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && bots.length === 0 && (
            <div className="py-12 text-center">
              <Bot className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No chatbots found.</p>
            </div>
          )}
        </div>
        {bots.length < total && !loading && (
          <div className="border-t p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => { const next = page + 1; setPage(next); load(query, next); }}>
              Load more ({total - bots.length} remaining)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
