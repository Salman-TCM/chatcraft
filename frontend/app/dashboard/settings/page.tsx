"use client";

import { useEffect, useState } from "react";
import { Check, Download, Loader2, Trash2, Key, ExternalLink, Plug } from "lucide-react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";
import { useAppStore } from "@/store";

export default function SettingsPage() {
  const user = useAppStore((s) => s.user);
  const setUser = useAppStore((s) => s.setUser);

  // Profile
  const [name, setName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileOk, setProfileOk] = useState(false);

  // Password
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordOk, setPasswordOk] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  // GDPR
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [unsubscribing, setUnsubscribing] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user]);

  async function handleSaveProfile() {
    if (!name.trim()) return;
    setSavingProfile(true);
    try {
      await apiClient.put("/api/auth/me", { name: name.trim() });
      setUser({ ...user!, name: name.trim() });
      setProfileOk(true);
      setTimeout(() => setProfileOk(false), 2000);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleChangePassword() {
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    setSavingPassword(true);
    try {
      await apiClient.post("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordOk(true);
      setTimeout(() => setPasswordOk(false), 2000);
    } catch (err: any) {
      setPasswordError(err?.response?.data?.detail?.error ?? "Failed to change password.");
    } finally {
      setSavingPassword(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const { data } = await apiClient.get("/api/gdpr/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `chatcraft-data-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  async function handleUnsubscribe() {
    setUnsubscribing(true);
    try {
      await apiClient.post("/api/gdpr/unsubscribe");
      setUnsubscribed(true);
    } finally {
      setUnsubscribing(false);
    }
  }

  async function handleDeleteAccount() {
    if (
      !confirm(
        "Are you sure you want to permanently delete your account? All your chatbots, conversations, and data will be erased. This cannot be undone."
      )
    )
      return;
    const confirmText = prompt('Type "DELETE MY ACCOUNT" to confirm:');
    if (confirmText !== "DELETE MY ACCOUNT") return;
    setDeleting(true);
    try {
      await apiClient.delete("/api/gdpr/delete");
      await signOut({ callbackUrl: "/" });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Account Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{user?.email}</p>
      </div>

      {/* Profile */}
      <Section title="Profile">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Display Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={100}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Email</Label>
            <Input value={user?.email ?? ""} disabled className="opacity-60" />
            <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>
          </div>
          <Button
            size="sm"
            disabled={savingProfile || !name.trim()}
            onClick={handleSaveProfile}
          >
            {savingProfile ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : profileOk ? (
              <><Check className="h-3.5 w-3.5 mr-1.5" />Saved</>
            ) : (
              "Save Profile"
            )}
          </Button>
        </div>
      </Section>

      <Separator />

      {/* Password */}
      <Section title="Change Password">
        <div className="space-y-3">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Current Password</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">New Password</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Confirm New Password</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => e.key === "Enter" && handleChangePassword()}
            />
          </div>
          {passwordError && (
            <p className="text-xs text-destructive">{passwordError}</p>
          )}
          <Button
            size="sm"
            disabled={savingPassword || !currentPassword || !newPassword || !confirmPassword}
            onClick={handleChangePassword}
          >
            {savingPassword ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : passwordOk ? (
              <><Check className="h-3.5 w-3.5 mr-1.5" />Updated</>
            ) : (
              "Change Password"
            )}
          </Button>
        </div>
      </Section>

      <Separator />

      {/* Integrations */}
      <Section title="Integrations">
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <Plug className="h-4 w-4" /> AI Model Integrations
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect your own API keys (Anthropic, OpenAI, Google, etc.) to power your chatbots.
            </p>
          </div>
          <Link href="/dashboard/settings/integrations">
            <Button size="sm" variant="outline">
              Manage <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        </Card>
      </Section>

      <Separator />

      {/* Developer */}
      <Section title="Developer">
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <Key className="h-4 w-4" /> API Tokens
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create bearer tokens for programmatic API access.
            </p>
          </div>
          <Link href="/dashboard/settings/api-tokens">
            <Button size="sm" variant="outline">
              Manage <ExternalLink className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </Link>
        </Card>
      </Section>

      <Separator />

      {/* Plan */}
      <Section title="Plan">
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-sm font-medium capitalize">{user?.role ?? "Free"} Plan</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {user?.role === "pro" || user?.role === "enterprise"
                ? "Manage your subscription in the Billing portal."
                : "Upgrade to unlock more chatbots, higher usage limits, and priority support."}
            </p>
          </div>
          <Button
            size="sm"
            variant={user?.role === "free" ? "default" : "outline"}
            onClick={() => window.location.href = "/billing"}
          >
            {user?.role === "free" ? "Upgrade" : "Manage"}
          </Button>
        </Card>
      </Section>

      <Separator />

      {/* GDPR */}
      <Section title="Your Data">
        <div className="space-y-3">
          <Card className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Export My Data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Download a JSON file of all your account data (GDPR Article 20).
              </p>
            </div>
            <Button size="sm" variant="outline" disabled={exporting} onClick={handleExport}>
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Download className="h-3.5 w-3.5 mr-1.5" />Export</>}
            </Button>
          </Card>

          <Card className="flex items-center justify-between p-4">
            <div>
              <p className="text-sm font-medium">Marketing Emails</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {unsubscribed ? "You are unsubscribed from marketing emails." : "Opt out of product updates and promotional emails."}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={unsubscribing || unsubscribed}
              onClick={handleUnsubscribe}
            >
              {unsubscribing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : unsubscribed ? <><Check className="h-3.5 w-3.5 mr-1.5" />Unsubscribed</> : "Unsubscribe"}
            </Button>
          </Card>
        </div>
      </Section>

      <Separator />

      {/* Danger zone */}
      <Section title="Danger Zone">
        <Card className="border-destructive/50 p-4 space-y-3">
          <div>
            <p className="text-sm font-semibold text-destructive">Delete Account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently delete your account and all associated data. This action cannot be reversed. You will lose all your chatbots, conversations, and billing history.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={deleting}
            onClick={handleDeleteAccount}
          >
            {deleting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : (
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            )}
            Delete My Account
          </Button>
        </Card>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
