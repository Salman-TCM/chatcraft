"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";

interface LogEntry {
  id: string;
  actor_user_id: string;
  target_user_id: string | null;
  target_agency_id: string | null;
  started_at: string;
  ended_at: string | null;
  ip_address: string | null;
}

export default function ImpersonationLogPage() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 50;

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const { data } = await apiClient.get(`/api/admin/impersonation-log?page=${p}&limit=${limit}`);
    setEntries(data.data ?? []);
    setTotal(data.total ?? 0);
    setLoading(false);
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="h-6 w-6" /> Impersonation Log
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Audit trail of all impersonation sessions.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : entries.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-sm font-medium">No impersonation sessions recorded.</p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left px-4 py-3">Actor</th>
                  <th className="text-left px-4 py-3">Target User</th>
                  <th className="text-left px-4 py-3">Target Agency</th>
                  <th className="text-left px-4 py-3">Started</th>
                  <th className="text-left px-4 py-3">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map(e => (
                  <tr key={e.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono text-xs">{e.actor_user_id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 font-mono text-xs">{e.target_user_id ? e.target_user_id.slice(0, 8) + "…" : "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs">{e.target_agency_id ? e.target_agency_id.slice(0, 8) + "…" : "—"}</td>
                    <td className="px-4 py-3 text-xs">{new Date(e.started_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-xs">{e.ip_address ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > limit && (
            <div className="flex items-center justify-between px-4 py-3 border-t text-sm">
              <span className="text-muted-foreground">{total} total</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Prev</Button>
                <Button variant="outline" size="sm" disabled={page * limit >= total} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
