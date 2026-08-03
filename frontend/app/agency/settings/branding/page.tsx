"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

const brandingSchema = z.object({
  logoUrl: z
    .string()
    .trim()
    .max(2048, "URL is too long")
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  faviconUrl: z
    .string()
    .trim()
    .max(2048, "URL is too long")
    .url("Enter a valid URL")
    .optional()
    .or(z.literal("")),
  primaryColour: z
    .string()
    .regex(HEX_COLOR_REGEX, "Enter a valid hex colour, e.g. #6366f1"),
  supportEmail: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
  fromEmail: z
    .string()
    .trim()
    .email("Enter a valid email")
    .optional()
    .or(z.literal("")),
});

type BrandingFormData = z.infer<typeof brandingSchema>;

export default function AgencyBrandingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const {
    register,
    watch,
    setValue,
    setError,
    handleSubmit,
    formState: { errors },
  } = useForm<BrandingFormData>({
    resolver: zodResolver(brandingSchema),
    defaultValues: {
      logoUrl: "",
      faviconUrl: "",
      primaryColour: "#6366f1",
      supportEmail: "",
      fromEmail: "",
    },
  });

  const logoUrl = watch("logoUrl");
  const primaryColour = watch("primaryColour");

  useEffect(() => {
    apiClient
      .get("/api/v1/agency/me")
      .then(({ data }) => {
        const a = data.data;
        setValue("logoUrl", a.logo_url ?? "");
        setValue("faviconUrl", a.favicon_url ?? "");
        setValue("primaryColour", a.primary_colour ?? "#6366f1");
        setValue("supportEmail", a.support_email ?? "");
        setValue("fromEmail", a.from_email ?? "");
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Failed to load branding settings",
          description: getErrorMessage(err),
        });
      })
      .finally(() => setLoading(false));
  }, [setValue]);

  async function onSubmit(data: BrandingFormData) {
    setSaving(true);
    try {
      await apiClient.put("/api/v1/agency/me", {
        logo_url: data.logoUrl || null,
        favicon_url: data.faviconUrl || null,
        primary_colour: data.primaryColour,
        support_email: data.supportEmail || null,
        from_email: data.fromEmail || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setError(field as keyof BrandingFormData, { message });
      });
      toast({
        variant: "destructive",
        title: "Failed to save branding",
        description: getErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Branding</h1>
        <p className="text-sm text-muted-foreground mt-1">Customise your agency's appearance for clients.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card className="p-4 space-y-4">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Logo URL</Label>
            <Input placeholder="https://example.com/logo.png" {...register("logoUrl")} />
            {errors.logoUrl && (
              <p className="text-sm text-destructive mt-1">{errors.logoUrl.message}</p>
            )}
            {logoUrl && !errors.logoUrl && (
              <img src={logoUrl} alt="Logo preview" className="mt-2 h-10 object-contain rounded border" />
            )}
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Favicon URL</Label>
            <Input placeholder="https://example.com/favicon.ico" {...register("faviconUrl")} />
            {errors.faviconUrl && (
              <p className="text-sm text-destructive mt-1">{errors.faviconUrl.message}</p>
            )}
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Primary Colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={HEX_COLOR_REGEX.test(primaryColour) ? primaryColour : "#6366f1"}
                onChange={e => setValue("primaryColour", e.target.value, { shouldValidate: true })}
                className="h-9 w-14 rounded border cursor-pointer"
              />
              <Input
                className="w-28 font-mono"
                {...register("primaryColour")}
              />
            </div>
            {errors.primaryColour && (
              <p className="text-sm text-destructive mt-1">{errors.primaryColour.message}</p>
            )}
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Support Email</Label>
            <Input type="email" placeholder="support@youragency.com" {...register("supportEmail")} />
            {errors.supportEmail && (
              <p className="text-sm text-destructive mt-1">{errors.supportEmail.message}</p>
            )}
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">From Email (for outbound)</Label>
            <Input type="email" placeholder="noreply@youragency.com" {...register("fromEmail")} />
            {errors.fromEmail && (
              <p className="text-sm text-destructive mt-1">{errors.fromEmail.message}</p>
            )}
          </div>

          <Button type="submit" disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : saved ? <><Check className="h-4 w-4 mr-1.5" />Saved</> : null}
            {!saving && !saved && "Save Branding"}
          </Button>
        </Card>
      </form>
    </div>
  );
}
