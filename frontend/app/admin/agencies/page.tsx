"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Building2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Agency {
  id: string;
  slug: string;
  custom_domain: string | null;
  plan: string;
  status: string;
  owner_user_id: string;
  created_at: string;
}

interface UserOption {
  id: string;
  email: string;
  name: string | null;
}

export default function AdminAgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [plan, setPlan] = useState("starter");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/v1/agencies");
      setAgencies(data.data ?? []);
    } catch {
      setAgencies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function searchUsers(q: string) {
    setUserSearch(q);
    if (q.length < 2) { setUsers([]); return; }
    setUsersLoading(true);
    try {
      const { data } = await apiClient.get("/api/admin/users", { params: { q, limit: 10 } });
      setUsers((data.data ?? []).map((u: any) => ({ id: u.id, email: u.email, name: u.name })));
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }

  function selectUser(u: UserOption) {
    setOwnerUserId(u.id);
    setUserSearch(u.email);
    setUsers([]);
  }

  async function create() {
    if (!slug.trim() || !ownerUserId.trim()) return;
    setCreateError("");
    setSaving(true);
    try {
      await apiClient.post("/api/v1/agencies", { slug: slug.trim(), owner_user_id: ownerUserId.trim(), plan });
      setSlug(""); setOwnerUserId(""); setUserSearch(""); setPlan("starter"); setShowForm(false);
      await load();
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.error ?? err?.response?.data?.detail ?? "Failed to create agency";
      setCreateError(String(msg));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this agency and all its data?")) return;
    setDeletingId(id);
    try {
      await apiClient.delete(`/api/v1/agencies/${id}`);
      setAgencies(a => a.filter(x => x.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Building2 className="h-6 w-6" />Agencies</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage white-label agencies.</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(s => !s)}>
          <Plus className="h-4 w-4 mr-1" /> Create Agency
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-semibold">New Agency</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Slug</Label>
              <Input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="my-agency" />
            </div>
            <div className="relative">
              <Label className="text-xs mb-1 block">Owner (search by email)</Label>
              <Input
                value={userSearch}
                onChange={e => searchUsers(e.target.value)}
                placeholder="Type email to search…"
                autoComplete="off"
              />
              {ownerUserId && (
                <p className="text-[10px] text-muted-foreground mt-0.5 font-mono truncate">{ownerUserId}</p>
              )}
              {(users.length > 0 || usersLoading) && (
                <div className="absolute z-10 left-0 right-0 top-full mt-1 rounded-md border bg-background shadow-lg max-h-48 overflow-y-auto">
                  {usersLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> Searching…
                    </div>
                  ) : users.map(u => (
                    <button
                      key={u.id}
                      onClick={() => selectUser(u)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors"
                    >
                      <span className="font-medium">{u.email}</span>
                      {u.name && <span className="text-muted-foreground ml-1.5 text-xs">({u.name})</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1 block">Plan</Label>
            <select className="w-full h-9 rounded-md border text-sm px-3" value={plan} onChange={e => setPlan(e.target.value)}>
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="unlimited">Unlimited</option>
            </select>
          </div>
          {createError && <p className="text-sm text-destructive">{createError}</p>}
          <div className="flex gap-2">
            <Button onClick={create} disabled={saving || !slug.trim() || !ownerUserId.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create
            </Button>
            <Button variant="outline" onClick={() => { setShowForm(false); setCreateError(""); }}>Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : agencies.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">No agencies yet</p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {agencies.map(a => (
              <div key={a.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{a.slug}</p>
                    {a.custom_domain && (
                      <a
                        href={`https://${a.custom_domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary flex items-center gap-0.5"
                      >
                        {a.custom_domain} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-mono">{a.id.slice(0, 8)}… · {a.plan}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${a.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {a.status}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => remove(a.id)} disabled={deletingId === a.id}
                >
                  {deletingId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
