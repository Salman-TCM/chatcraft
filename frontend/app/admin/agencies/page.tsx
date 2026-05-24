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

export default function AdminAgenciesPage() {
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [slug, setSlug] = useState("");
  const [ownerUserId, setOwnerUserId] = useState("");
  const [plan, setPlan] = useState("starter");
  const [saving, setSaving] = useState(false);
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

  async function create() {
    if (!slug.trim() || !ownerUserId.trim()) return;
    setSaving(true);
    try {
      await apiClient.post("/api/v1/agencies", { slug: slug.trim(), owner_user_id: ownerUserId.trim(), plan });
      setSlug(""); setOwnerUserId(""); setPlan("starter"); setShowForm(false);
      await load();
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
            <div>
              <Label className="text-xs mb-1 block">Owner User ID</Label>
              <Input value={ownerUserId} onChange={e => setOwnerUserId(e.target.value)} placeholder="UUID" />
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
          <div className="flex gap-2">
            <Button onClick={create} disabled={saving || !slug.trim() || !ownerUserId.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
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
