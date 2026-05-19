"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2, Loader2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  created_at: string;
}

interface Agency {
  id: string;
  slug: string;
}

export default function AgencyClientsPage() {
  const [agency, setAgency] = useState<Agency | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [plan, setPlan] = useState("starter");
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: agData } = await apiClient.get("/api/v1/agency/me");
      setAgency(agData.data);
      const { data } = await apiClient.get(`/api/v1/agencies/${agData.data.id}/tenants`);
      setTenants(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!agency || !name.trim() || !slug.trim()) return;
    setSaving(true);
    try {
      await apiClient.post(`/api/v1/agencies/${agency.id}/tenants`, { name: name.trim(), slug: slug.trim(), plan });
      setName(""); setSlug(""); setPlan("starter"); setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!agency || !confirm("Delete this client?")) return;
    setDeletingId(id);
    try {
      await apiClient.delete(`/api/v1/agencies/${agency.id}/tenants/${id}`);
      setTenants(t => t.filter(x => x.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="h-6 w-6" />Clients</h1>
          <p className="text-sm text-muted-foreground mt-1">Manage your agency clients (tenants).</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(s => !s)}>
          <Plus className="h-4 w-4 mr-1" /> Add Client
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-semibold">New Client</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Slug</Label>
              <Input value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="acme" />
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
            <Button onClick={create} disabled={saving || !name.trim() || !slug.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tenants.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">No clients yet</p>
          <p className="text-xs text-muted-foreground mt-1">Add your first client to get started.</p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {tenants.map(t => (
              <div key={t.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">{t.slug} · {t.plan}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${t.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {t.status}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => remove(t.id)} disabled={deletingId === t.id}
                >
                  {deletingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
