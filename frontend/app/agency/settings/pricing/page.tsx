"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { Plus, Trash2, Save, RefreshCcw, Tag } from "lucide-react";

interface PricingTier {
  id?: string;
  plan_key: string;
  display_name: string;
  price_monthly: number;
  price_yearly: number;
  features: string[];
  is_active: boolean;
}

const DEFAULT_TIER: PricingTier = {
  plan_key: "",
  display_name: "",
  price_monthly: 0,
  price_yearly: 0,
  features: [],
  is_active: true,
};

export default function AgencyPricingPage() {
  const user = useAppStore((s) => s.user);
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!user?.accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/agency/pricing`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const data = await res.json();
      if (data.success) {
        setTiers(
          data.data.map((t: any) => ({
            ...t,
            features: Array.isArray(t.features) ? t.features : [],
          }))
        );
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [user?.accessToken]); // eslint-disable-line

  function addTier() {
    setTiers((prev) => [...prev, { ...DEFAULT_TIER }]);
  }

  function removeTier(i: number) {
    setTiers((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateTier(i: number, field: keyof PricingTier, value: unknown) {
    setTiers((prev) => prev.map((t, idx) => idx === i ? { ...t, [field]: value } : t));
  }

  function updateFeature(tierIdx: number, featIdx: number, value: string) {
    setTiers((prev) =>
      prev.map((t, i) => {
        if (i !== tierIdx) return t;
        const features = [...t.features];
        features[featIdx] = value;
        return { ...t, features };
      })
    );
  }

  function addFeature(tierIdx: number) {
    setTiers((prev) =>
      prev.map((t, i) => i === tierIdx ? { ...t, features: [...t.features, ""] } : t)
    );
  }

  function removeFeature(tierIdx: number, featIdx: number) {
    setTiers((prev) =>
      prev.map((t, i) =>
        i === tierIdx ? { ...t, features: t.features.filter((_, fi) => fi !== featIdx) } : t
      )
    );
  }

  async function save() {
    if (!user?.accessToken) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/agency/pricing`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.accessToken}`,
        },
        body: JSON.stringify({ tiers }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.detail ?? "Failed to save");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Custom Pricing Tiers</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Set your own plan names, prices, and features for clients.
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <RefreshCcw className="h-3.5 w-3.5 animate-spin" />
          ) : saved ? (
            "Saved ✓"
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          {saving ? "Saving…" : saved ? "" : "Save changes"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {tiers.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border py-16 text-center">
          <Tag className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No pricing tiers yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Create tiers to offer clients branded subscription plans.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {tiers.map((tier, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-4">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Tier {i + 1}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={tier.is_active}
                    onChange={(e) => updateTier(i, "is_active", e.target.checked)}
                    className="rounded"
                  />
                  Active
                </label>
                <button
                  onClick={() => removeTier(i)}
                  className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Key + name */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Plan key</label>
                <input
                  type="text"
                  value={tier.plan_key}
                  onChange={(e) => updateTier(i, "plan_key", e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder="e.g. starter"
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Display name</label>
                <input
                  type="text"
                  value={tier.display_name}
                  onChange={(e) => updateTier(i, "display_name", e.target.value)}
                  placeholder="e.g. Starter Plan"
                  className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Monthly price (cents)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    value={tier.price_monthly}
                    onChange={(e) => updateTier(i, "price_monthly", parseInt(e.target.value) || 0)}
                    className="w-full pl-6 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  = ${(tier.price_monthly / 100).toFixed(2)}/mo
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-muted-foreground">Yearly price (cents)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-sm text-muted-foreground">$</span>
                  <input
                    type="number"
                    min={0}
                    value={tier.price_yearly}
                    onChange={(e) => updateTier(i, "price_yearly", parseInt(e.target.value) || 0)}
                    className="w-full pl-6 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  = ${(tier.price_yearly / 100).toFixed(2)}/yr
                </p>
              </div>
            </div>

            {/* Features */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-medium text-muted-foreground">Features</label>
                <button
                  onClick={() => addFeature(i)}
                  className="text-xs text-primary hover:underline"
                >
                  + Add feature
                </button>
              </div>
              <div className="space-y-1.5">
                {tier.features.map((feat, fi) => (
                  <div key={fi} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={feat}
                      onChange={(e) => updateFeature(i, fi, e.target.value)}
                      placeholder="e.g. 1,000 conversations/mo"
                      className="flex-1 px-3 py-1.5 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <button
                      onClick={() => removeFeature(i, fi)}
                      className="rounded p-1 text-muted-foreground hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {tier.features.length === 0 && (
                  <p className="text-xs text-muted-foreground/60 italic">No features listed yet.</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={addTier}
        className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border py-4 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors"
      >
        <Plus className="h-4 w-4" />
        Add pricing tier
      </button>
    </div>
  );
}
