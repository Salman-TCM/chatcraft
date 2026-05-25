"use client";

import { useEffect, useState } from "react";
import { Settings, Save, Loader2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";

interface PlatformSettings {
  allow_signups: boolean;
  require_email_verification: boolean;
  max_chatbots_free: number;
  max_messages_free: number;
  maintenance_mode: boolean;
  maintenance_message: string;
  feature_voice_lab: boolean;
  feature_agent_builder: boolean;
  feature_browser_agent: boolean;
  feature_social: boolean;
}

const FEATURE_FLAGS = [
  { key: "feature_voice_lab",      label: "Voice Lab",      description: "Show Voice Lab section to users" },
  { key: "feature_agent_builder",  label: "Agent Builder",  description: "Show Agent Builder section to users" },
  { key: "feature_browser_agent",  label: "Browser Agent",  description: "Show Browser Agent section to users" },
  { key: "feature_social",         label: "Social",         description: "Show Social section to users" },
];

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    apiClient.get("/api/admin/settings").then(r => {
      setSettings(r.data.data);
    }).finally(() => setLoading(false));
  }, []);

  function toggle(key: keyof PlatformSettings) {
    setSettings(prev => prev ? { ...prev, [key]: !prev[key] } : null);
  }

  function setNum(key: keyof PlatformSettings, val: string) {
    const n = parseInt(val);
    if (!isNaN(n)) setSettings(prev => prev ? { ...prev, [key]: n } : null);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    try {
      await apiClient.patch("/api/admin/settings", settings);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!settings) return null;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Settings className="h-6 w-6" /> Platform Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Global configuration for all users on the platform.</p>
        </div>
        <Button onClick={save} disabled={saving} size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
          {saved ? "Saved!" : "Save Changes"}
        </Button>
      </div>

      {/* Maintenance Mode */}
      <Card className="p-5 space-y-4">
        <p className="text-sm font-semibold">Maintenance Mode</p>
        {settings.maintenance_mode && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Maintenance mode is ON — users see the maintenance message instead of the app.
          </div>
        )}
        <ToggleRow
          label="Enable maintenance mode"
          description="Lock out all non-admin users and show the maintenance message"
          value={settings.maintenance_mode}
          onChange={() => toggle("maintenance_mode")}
        />
        <div className="space-y-1.5">
          <Label className="text-xs">Maintenance message</Label>
          <Input
            value={settings.maintenance_message}
            onChange={e => setSettings(prev => prev ? { ...prev, maintenance_message: e.target.value } : null)}
            placeholder="We'll be back shortly."
          />
        </div>
      </Card>

      {/* Signup & Auth */}
      <Card className="p-5 space-y-4">
        <p className="text-sm font-semibold">Signups & Auth</p>
        <ToggleRow
          label="Allow new signups"
          description="When off, new account creation is disabled"
          value={settings.allow_signups}
          onChange={() => toggle("allow_signups")}
        />
        <ToggleRow
          label="Require email verification"
          description="New users must verify their email before accessing the dashboard"
          value={settings.require_email_verification}
          onChange={() => toggle("require_email_verification")}
        />
      </Card>

      {/* Limits */}
      <Card className="p-5 space-y-4">
        <p className="text-sm font-semibold">Free Plan Limits</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Max chatbots (free users)</Label>
            <Input type="number" min={0} value={settings.max_chatbots_free} onChange={e => setNum("max_chatbots_free", e.target.value)} className="h-8 w-28 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max messages / month (free users)</Label>
            <Input type="number" min={0} value={settings.max_messages_free} onChange={e => setNum("max_messages_free", e.target.value)} className="h-8 w-28 text-sm" />
          </div>
        </div>
      </Card>

      {/* Feature Flags */}
      <Card className="p-5 space-y-4">
        <p className="text-sm font-semibold">Feature Flags</p>
        <p className="text-xs text-muted-foreground -mt-2">Enable or disable platform sections for all users.</p>
        {FEATURE_FLAGS.map(f => (
          <ToggleRow
            key={f.key}
            label={f.label}
            description={f.description}
            value={settings[f.key as keyof PlatformSettings] as boolean}
            onChange={() => toggle(f.key as keyof PlatformSettings)}
          />
        ))}
      </Card>
    </div>
  );
}

function ToggleRow({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer gap-4">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={value}
        onClick={onChange}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${value ? "bg-primary" : "bg-input"}`}
      >
        <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-0.5"}`} />
      </button>
    </label>
  );
}
