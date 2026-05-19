"use client";

import { useEffect, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

export default function AgencyBrandingPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [faviconUrl, setFaviconUrl] = useState("");
  const [primaryColour, setPrimaryColour] = useState("#6366f1");
  const [supportEmail, setSupportEmail] = useState("");
  const [fromEmail, setFromEmail] = useState("");

  useEffect(() => {
    apiClient.get("/api/v1/agency/me").then(({ data }) => {
      const a = data.data;
      setLogoUrl(a.logo_url ?? "");
      setFaviconUrl(a.favicon_url ?? "");
      setPrimaryColour(a.primary_colour ?? "#6366f1");
      setSupportEmail(a.support_email ?? "");
      setFromEmail(a.from_email ?? "");
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiClient.put("/api/v1/agency/me", {
        logo_url: logoUrl || null,
        favicon_url: faviconUrl || null,
        primary_colour: primaryColour,
        support_email: supportEmail || null,
        from_email: fromEmail || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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

      <Card className="p-4 space-y-4">
        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Logo URL</Label>
          <Input value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://example.com/logo.png" />
          {logoUrl && <img src={logoUrl} alt="Logo preview" className="mt-2 h-10 object-contain rounded border" />}
        </div>
        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Favicon URL</Label>
          <Input value={faviconUrl} onChange={e => setFaviconUrl(e.target.value)} placeholder="https://example.com/favicon.ico" />
        </div>
        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Primary Colour</Label>
          <div className="flex items-center gap-2">
            <input type="color" value={primaryColour} onChange={e => setPrimaryColour(e.target.value)} className="h-9 w-14 rounded border cursor-pointer" />
            <Input value={primaryColour} onChange={e => setPrimaryColour(e.target.value)} className="w-28 font-mono" />
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Support Email</Label>
          <Input type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="support@youragency.com" />
        </div>
        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">From Email (for outbound)</Label>
          <Input type="email" value={fromEmail} onChange={e => setFromEmail(e.target.value)} placeholder="noreply@youragency.com" />
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : saved ? <><Check className="h-4 w-4 mr-1.5" />Saved</> : null}
          {!saving && !saved && "Save Branding"}
        </Button>
      </Card>
    </div>
  );
}
