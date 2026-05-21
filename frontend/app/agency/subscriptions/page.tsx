"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Copy, Check, Loader2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface Sub {
  id: string;
  client_email: string;
  plan: string;
  amount: number;
  status: string;
  license_token: string;
  created_at: string;
}

export default function AgencySubscriptionsPage() {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [email, setEmail] = useState("");
  const [plan, setPlan] = useState("starter");
  const [amount, setAmount] = useState("0");
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await apiClient.get("/api/v1/agency/subscriptions");
    setSubs(data.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!email.trim()) return;
    setSaving(true);
    try {
      await apiClient.post("/api/v1/agency/subscriptions", {
        client_email: email.trim(),
        plan,
        amount: Math.round(parseFloat(amount) * 100),
      });
      setEmail(""); setPlan("starter"); setAmount("0"); setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  function copyToken(token: string, id: string) {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }

  const mrr = subs.filter(s => s.status === "active").reduce((sum, s) => sum + s.amount, 0);

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="h-6 w-6" />Revenue</h1>
          <p className="text-sm text-muted-foreground mt-1">
            MRR: <span className="font-semibold text-foreground">${(mrr / 100).toFixed(2)}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm(s => !s)}>
          <Plus className="h-4 w-4 mr-1" /> Add Subscription
        </Button>
      </div>

      {showForm && (
        <Card className="p-4 space-y-3">
          <p className="text-sm font-semibold">New Client Subscription</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1 block">Client Email</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="client@example.com" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">Monthly Amount ($)</Label>
              <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.01" />
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
            <Button onClick={create} disabled={saving || !email.trim()}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : subs.length === 0 ? (
        <Card className="p-12 text-center">
          <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium">No subscriptions yet</p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {subs.map(s => (
              <div key={s.id} className="flex items-center gap-4 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{s.client_email}</p>
                  <p className="text-xs text-muted-foreground">{s.plan} · ${(s.amount / 100).toFixed(2)}/mo</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                  {s.status}
                </span>
                <Button
                  variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                  title="Copy license token"
                  onClick={() => copyToken(s.license_token, s.id)}
                >
                  {copiedId === s.id ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
