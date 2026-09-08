"use client";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2, Save, RefreshCcw, Tag } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

const tierSchema = z.object({
  id: z.string().optional(),
  plan_key: z.string().trim().min(1, "Plan key is required"),
  display_name: z.string().trim().min(1, "Display name is required"),
  price_monthly: z
    .number({ invalid_type_error: "Enter a valid amount" })
    .int()
    .min(0, "Must be 0 or more"),
  price_yearly: z
    .number({ invalid_type_error: "Enter a valid amount" })
    .int()
    .min(0, "Must be 0 or more"),
  features: z.array(z.string()),
  is_active: z.boolean(),
});

const pricingSchema = z.object({
  tiers: z.array(tierSchema),
});

type PricingFormData = z.infer<typeof pricingSchema>;
type PricingTier = PricingFormData["tiers"][number];

const DEFAULT_TIER: PricingTier = {
  plan_key: "",
  display_name: "",
  price_monthly: 0,
  price_yearly: 0,
  features: [],
  is_active: true,
};

export default function AgencyPricingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    watch,
    setError,
    formState: { errors },
  } = useForm<PricingFormData>({
    resolver: zodResolver(pricingSchema),
    defaultValues: { tiers: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "tiers" });
  const watchedTiers = watch("tiers");

  async function load() {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/v1/agency/pricing");
      const list = (data.data ?? []).map((t: any) => ({
        ...t,
        features: Array.isArray(t.features) ? t.features : [],
      }));
      reset({ tiers: list });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load pricing tiers",
        description: getErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line

  function addTier() {
    append({ ...DEFAULT_TIER });
  }

  function removeTier(i: number) {
    remove(i);
  }

  function updateFeature(tierIdx: number, featIdx: number, value: string) {
    const current = [...(getValues(`tiers.${tierIdx}.features`) ?? [])];
    current[featIdx] = value;
    setValue(`tiers.${tierIdx}.features`, current, { shouldDirty: true, shouldValidate: true });
  }

  function addFeature(tierIdx: number) {
    const current = getValues(`tiers.${tierIdx}.features`) ?? [];
    setValue(`tiers.${tierIdx}.features`, [...current, ""], { shouldDirty: true });
  }

  function removeFeature(tierIdx: number, featIdx: number) {
    const current = getValues(`tiers.${tierIdx}.features`) ?? [];
    setValue(
      `tiers.${tierIdx}.features`,
      current.filter((_, fi) => fi !== featIdx),
      { shouldDirty: true, shouldValidate: true }
    );
  }

  async function onSubmit(data: PricingFormData) {
    setSaving(true);
    try {
      await apiClient.put("/api/v1/agency/pricing", { tiers: data.tiers });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await load();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setError(field as keyof PricingFormData, { message });
      });
      toast({
        variant: "destructive",
        title: "Failed to save pricing tiers",
        description: getErrorMessage(err),
      });
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
          onClick={handleSubmit(onSubmit)}
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

      {fields.length === 0 && (
        <div className="rounded-xl border-2 border-dashed border-border py-16 text-center">
          <Tag className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No pricing tiers yet.</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Create tiers to offer clients branded subscription plans.
          </p>
        </div>
      )}

      <div className="space-y-4">
        {fields.map((field, i) => {
          const tier = watchedTiers?.[i] ?? field;
          const tierErrors = errors.tiers?.[i];
          return (
            <div key={field.id} className="rounded-xl border bg-card p-5 space-y-4">
              {/* Header row */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">Tier {i + 1}</span>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="rounded"
                      {...register(`tiers.${i}.is_active`)}
                    />
                    Active
                  </label>
                  <button
                    onClick={() => removeTier(i)}
                    className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
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
                    onChange={(e) => setValue(`tiers.${i}.plan_key`, e.target.value.toLowerCase().replace(/\s+/g, "_"), { shouldValidate: true })}
                    placeholder="e.g. starter"
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                  {tierErrors?.plan_key && (
                    <p className="text-xs text-destructive mt-1">{tierErrors.plan_key.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Display name</label>
                  <input
                    type="text"
                    placeholder="e.g. Starter Plan"
                    className="w-full px-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    {...register(`tiers.${i}.display_name`)}
                  />
                  {tierErrors?.display_name && (
                    <p className="text-xs text-destructive mt-1">{tierErrors.display_name.message}</p>
                  )}
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
                      onChange={(e) => setValue(`tiers.${i}.price_monthly`, parseInt(e.target.value, 10) || 0, { shouldValidate: true })}
                      className="w-full pl-6 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    = ${(tier.price_monthly / 100).toFixed(2)}/mo
                  </p>
                  {tierErrors?.price_monthly && (
                    <p className="text-xs text-destructive mt-1">{tierErrors.price_monthly.message}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1 text-muted-foreground">Yearly price (cents)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-sm text-muted-foreground">$</span>
                    <input
                      type="number"
                      min={0}
                      value={tier.price_yearly}
                      onChange={(e) => setValue(`tiers.${i}.price_yearly`, parseInt(e.target.value, 10) || 0, { shouldValidate: true })}
                      className="w-full pl-6 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    = ${(tier.price_yearly / 100).toFixed(2)}/yr
                  </p>
                  {tierErrors?.price_yearly && (
                    <p className="text-xs text-destructive mt-1">{tierErrors.price_yearly.message}</p>
                  )}
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
                        className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:text-red-600 transition-colors"
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
          );
        })}
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
