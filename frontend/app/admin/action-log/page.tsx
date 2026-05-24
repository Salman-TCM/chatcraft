"use client";

import { useEffect, useState, useCallback } from "react";
import { ScrollText, ChevronLeft, ChevronRight, Filter, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

interface LogEntry {
  id: string;
  created_at: string;
  admin_email: string;
  action: string;
  target_email: string | null;
  old_value: string | null;
  new_value: string | null;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  role_change:    { label: "Role Change",    color: "bg-violet-100 text-violet-700" },
  plan_change:    { label: "Plan Change",    color: "bg-blue-100 text-blue-700" },
  user_delete:    { label: "User Deleted",   color: "bg-red-100 text-red-700" },
  impersonate:    { label: "Impersonation",  color: "bg-amber-100 text-amber-700" },
  verify_email:   { label: "Email Verified", color: "bg-green-100 text-green-700" },
};

const ACTIONS = ["", "role_change", "plan_change", "user_delete", "impersonate", "verify_email"];
const LIMIT = 50;

export default function ActionLogPage() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (p: number, a: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (a) params.set("action", a);
      const res = await apiClient.get(`/api/admin/action-log?${params}`);
      setLogs(res.data.data ?? []);
      setTotal(res.data.total ?? 0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page, action); }, [page, action, load]);

  function handleActionFilter(a: string) {
    setAction(a);
    setPage(1);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Action Log</h1>
        <p className="text-sm text-muted-foreground">
          Immutable audit trail of every admin mutation — {total.toLocaleString()} entries
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="h-3.5 w-3.5" />
          Filter:
        </div>
        {ACTIONS.map((a) => (
          <button
            key={a || "all"}
            onClick={() => handleActionFilter(a)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              action === a
                ? "bg-foreground text-background border-foreground"
                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
            }`}
          >
            {a ? (ACTION_LABELS[a]?.label ?? a) : "All actions"}
          </button>
        ))}
        {action && (
          <button onClick={() => handleActionFilter("")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Admin</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Target</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Before → After</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-xs text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <ScrollText className="h-8 w-8 opacity-30" />
                      <p className="text-sm">No log entries{action ? " for this filter" : ""}</p>
                    </div>
                  </td>
                </tr>
              )}
              {!loading && logs.map((log) => {
                const meta = ACTION_LABELS[log.action] ?? { label: log.action, color: "bg-slate-100 text-slate-600" };
                return (
                  <tr key={log.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium">{log.admin_email}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {log.target_email ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {log.old_value || log.new_value ? (
                        <span>
                          {log.old_value && <span className="text-red-500">{log.old_value}</span>}
                          {log.old_value && log.new_value && <span className="mx-1 text-muted-foreground/50">→</span>}
                          {log.new_value && <span className="text-green-600">{log.new_value}</span>}
                        </span>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages} · {total.toLocaleString()} entries
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
