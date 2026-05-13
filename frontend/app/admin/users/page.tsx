"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, UserCog, Shield, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  email_verified: boolean;
  subscription: { plan: string | null; status: string | null; current_period_end: string | null } | null;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border-red-200",
  creator: "bg-violet-100 text-violet-700 border-violet-200",
  premium: "bg-indigo-100 text-indigo-700 border-indigo-200",
  trial: "bg-amber-100 text-amber-700 border-amber-200",
  free: "bg-slate-100 text-slate-600 border-slate-200",
};

const SUB_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  trialing: "bg-blue-100 text-blue-700",
  past_due: "bg-red-100 text-red-700",
  canceled: "bg-slate-100 text-slate-500",
  unpaid: "bg-orange-100 text-orange-700",
};

const ROLES = ["", "free", "trial", "premium", "creator", "admin"];

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const LIMIT = 50;

  async function load(q: string, role: string, p: number) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (q) params.set("q", q);
      if (role) params.set("role", role);
      const res = await apiClient.get(`/api/admin/users?${params}`);
      setUsers(p === 1 ? res.data.data : (prev) => [...prev, ...res.data.data]);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(1); load(query, roleFilter, 1); }, [query, roleFilter]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} total accounts</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search email or name…" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}>
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All roles</option>
          {ROLES.slice(1).map((r) => (
            <option key={r} value={r} className="capitalize">{r}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Role</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Plan</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Joined</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/admin/users/${u.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold uppercase">
                        {(u.name ?? u.email)[0]}
                      </div>
                      <div>
                        <p className="font-medium leading-tight">{u.name ?? u.email}</p>
                        {u.name && <p className="text-xs text-muted-foreground">{u.email}</p>}
                      </div>
                      {!u.email_verified && (
                        <span className="text-[10px] text-amber-600 border border-amber-200 rounded px-1">unverified</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium border capitalize ${ROLE_COLORS[u.role] ?? ""}`}>
                      {u.role === "admin" && <Shield className="mr-1 h-3 w-3" />}
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground capitalize text-xs">
                    {u.subscription?.plan ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {u.subscription?.status ? (
                      <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${SUB_COLORS[u.subscription.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {u.subscription.status.replace("_", " ")}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && users.length === 0 && (
            <div className="py-12 text-center">
              <UserCog className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No users found.</p>
            </div>
          )}
        </div>
        {users.length < total && !loading && (
          <div className="border-t p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => { const next = page + 1; setPage(next); load(query, roleFilter, next); }}>
              Load more ({total - users.length} remaining)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
