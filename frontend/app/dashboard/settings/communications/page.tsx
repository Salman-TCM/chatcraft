"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Mail, MessageSquare, Loader2, Check, Trash2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface SmtpConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  from_name: string;
  from_email: string;
}

interface SmsConfig {
  account_sid: string;
  auth_token: string;
  from_number: string;
}

const SMTP_DEFAULTS: SmtpConfig = {
  smtp_host: "",
  smtp_port: 587,
  smtp_user: "",
  smtp_password: "",
  from_name: "",
  from_email: "",
};

const SMS_DEFAULTS: SmsConfig = {
  account_sid: "",
  auth_token: "",
  from_number: "",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function StatusBadge({ configured }: { configured: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
      configured ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
    }`}>
      <span className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-green-500" : "bg-muted-foreground/50"}`} />
      {configured ? "Configured" : "Not configured"}
    </span>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function CommunicationsPage() {
  const router = useRouter();

  // SMTP state
  const [smtp, setSmtp] = useState<SmtpConfig>(SMTP_DEFAULTS);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpDeleting, setSmtpDeleting] = useState(false);
  const [smtpTestEmail, setSmtpTestEmail] = useState("");
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [smtpError, setSmtpError] = useState("");

  // SMS state
  const [sms, setSms] = useState<SmsConfig>(SMS_DEFAULTS);
  const [smsConfigured, setSmsConfigured] = useState(false);
  const [smsSaving, setSmsSaving] = useState(false);
  const [smsSaved, setSmsSaved] = useState(false);
  const [smsDeleting, setSmsDeleting] = useState(false);
  const [smsTestNumber, setSmsTestNumber] = useState("");
  const [smsTesting, setSmsTesting] = useState(false);
  const [smsTestResult, setSmsTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [smsError, setSmsError] = useState("");

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get("/api/settings/smtp"),
      apiClient.get("/api/settings/sms"),
    ]).then(([smtpRes, smsRes]) => {
      if (smtpRes.data.data) {
        setSmtp({ ...SMTP_DEFAULTS, ...smtpRes.data.data });
        setSmtpConfigured(true);
      }
      if (smsRes.data.data) {
        setSms({ ...SMS_DEFAULTS, ...smsRes.data.data });
        setSmsConfigured(true);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // ── SMTP handlers ─────────────────────────────────────────────────────────

  async function saveSmtp() {
    setSmtpError("");
    if (!smtp.smtp_host || !smtp.smtp_user || !smtp.smtp_password) {
      setSmtpError("Host, username, and password are required.");
      return;
    }
    setSmtpSaving(true);
    try {
      await apiClient.put("/api/settings/smtp", smtp);
      setSmtpConfigured(true);
      setSmtpSaved(true);
      setTimeout(() => setSmtpSaved(false), 2000);
    } catch {
      setSmtpError("Failed to save SMTP config.");
    } finally {
      setSmtpSaving(false);
    }
  }

  async function deleteSmtp() {
    if (!confirm("Remove SMTP configuration?")) return;
    setSmtpDeleting(true);
    try {
      await apiClient.delete("/api/settings/smtp");
      setSmtp(SMTP_DEFAULTS);
      setSmtpConfigured(false);
      setSmtpTestResult(null);
    } catch {
      setSmtpError("Failed to remove config.");
    } finally {
      setSmtpDeleting(false);
    }
  }

  async function testSmtp() {
    if (!smtpTestEmail) return;
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const { data } = await apiClient.post("/api/settings/smtp/test", { to_email: smtpTestEmail });
      setSmtpTestResult({ ok: data.success, msg: data.success ? data.data.message : data.error });
    } catch (e: any) {
      setSmtpTestResult({ ok: false, msg: e.response?.data?.detail || e.message });
    } finally {
      setSmtpTesting(false);
    }
  }

  // ── SMS handlers ──────────────────────────────────────────────────────────

  async function saveSms() {
    setSmsError("");
    if (!sms.account_sid || !sms.auth_token || !sms.from_number) {
      setSmsError("Account SID, auth token, and from number are required.");
      return;
    }
    setSmsSaving(true);
    try {
      await apiClient.put("/api/settings/sms", sms);
      setSmsConfigured(true);
      setSmsSaved(true);
      setTimeout(() => setSmsSaved(false), 2000);
    } catch {
      setSmsError("Failed to save SMS config.");
    } finally {
      setSmsSaving(false);
    }
  }

  async function deleteSms() {
    if (!confirm("Remove SMS configuration?")) return;
    setSmsDeleting(true);
    try {
      await apiClient.delete("/api/settings/sms");
      setSms(SMS_DEFAULTS);
      setSmsConfigured(false);
      setSmsTestResult(null);
    } catch {
      setSmsError("Failed to remove config.");
    } finally {
      setSmsDeleting(false);
    }
  }

  async function testSms() {
    if (!smsTestNumber) return;
    setSmsTesting(true);
    setSmsTestResult(null);
    try {
      const { data } = await apiClient.post("/api/settings/sms/test", { to_number: smsTestNumber });
      setSmsTestResult({ ok: data.success, msg: data.success ? data.data.message : data.error });
    } catch (e: any) {
      setSmsTestResult({ ok: false, msg: e.response?.data?.detail || e.message });
    } finally {
      setSmsTesting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-semibold">Communication Settings</h1>
          <p className="text-sm text-muted-foreground">Configure SMTP email and SMS (Twilio) for your account.</p>
        </div>
      </div>

      {/* ── SMTP ────────────────────────────────────────────────────────────── */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100">
              <Mail className="h-4 w-4 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-sm">SMTP Email</p>
              <p className="text-xs text-muted-foreground">Outbound email via your SMTP server</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge configured={smtpConfigured} />
            {smtpConfigured && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={deleteSmtp}
                disabled={smtpDeleting}
              >
                {smtpDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">SMTP Host</Label>
            <Input
              placeholder="smtp.gmail.com"
              value={smtp.smtp_host}
              onChange={e => setSmtp(p => ({ ...p, smtp_host: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Port</Label>
            <Input
              type="number"
              placeholder="587"
              value={smtp.smtp_port}
              onChange={e => setSmtp(p => ({ ...p, smtp_port: parseInt(e.target.value) || 587 }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Username / Email</Label>
            <Input
              placeholder="you@example.com"
              value={smtp.smtp_user}
              onChange={e => setSmtp(p => ({ ...p, smtp_user: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              placeholder={smtpConfigured ? "••••••••" : "App password or SMTP password"}
              value={smtp.smtp_password}
              onChange={e => setSmtp(p => ({ ...p, smtp_password: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From Name</Label>
            <Input
              placeholder="My Business"
              value={smtp.from_name}
              onChange={e => setSmtp(p => ({ ...p, from_name: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From Email</Label>
            <Input
              placeholder="noreply@example.com"
              value={smtp.from_email}
              onChange={e => setSmtp(p => ({ ...p, from_email: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {smtpError && <p className="text-xs text-destructive">{smtpError}</p>}

        <div className="flex items-center justify-between pt-1 border-t gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Input
              placeholder="Test recipient email"
              value={smtpTestEmail}
              onChange={e => setSmtpTestEmail(e.target.value)}
              className="h-8 text-sm max-w-[220px]"
              disabled={!smtpConfigured}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={testSmtp}
              disabled={!smtpConfigured || !smtpTestEmail || smtpTesting}
            >
              {smtpTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send test
            </Button>
            {smtpTestResult && (
              <span className={`text-xs ${smtpTestResult.ok ? "text-green-600" : "text-destructive"}`}>
                {smtpTestResult.msg}
              </span>
            )}
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={saveSmtp} disabled={smtpSaving}>
            {smtpSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : smtpSaved ? <Check className="h-3.5 w-3.5" /> : null}
            {smtpSaved ? "Saved!" : "Save"}
          </Button>
        </div>
      </Card>

      {/* ── SMS ─────────────────────────────────────────────────────────────── */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-100">
              <MessageSquare className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-sm">SMS — Twilio</p>
              <p className="text-xs text-muted-foreground">Send SMS messages via Twilio</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge configured={smsConfigured} />
            {smsConfigured && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={deleteSms}
                disabled={smsDeleting}
              >
                {smsDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Account SID</Label>
            <Input
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={sms.account_sid}
              onChange={e => setSms(p => ({ ...p, account_sid: e.target.value }))}
              className="h-8 text-sm font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Auth Token</Label>
            <Input
              type="password"
              placeholder={smsConfigured ? "••••••••" : "Your Twilio auth token"}
              value={sms.auth_token}
              onChange={e => setSms(p => ({ ...p, auth_token: e.target.value }))}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs">From Number</Label>
            <Input
              placeholder="+15005550006"
              value={sms.from_number}
              onChange={e => setSms(p => ({ ...p, from_number: e.target.value }))}
              className="h-8 text-sm font-mono"
            />
            <p className="text-[11px] text-muted-foreground">
              Must be a Twilio phone number in E.164 format (e.g. +15005550006).
            </p>
          </div>
        </div>

        {smsError && <p className="text-xs text-destructive">{smsError}</p>}

        <div className="flex items-center justify-between pt-1 border-t gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Input
              placeholder="+447700900000"
              value={smsTestNumber}
              onChange={e => setSmsTestNumber(e.target.value)}
              className="h-8 text-sm max-w-[180px] font-mono"
              disabled={!smsConfigured}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={testSms}
              disabled={!smsConfigured || !smsTestNumber || smsTesting}
            >
              {smsTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
              Send test
            </Button>
            {smsTestResult && (
              <span className={`text-xs ${smsTestResult.ok ? "text-green-600" : "text-destructive"}`}>
                {smsTestResult.msg}
              </span>
            )}
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={saveSms} disabled={smsSaving}>
            {smsSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : smsSaved ? <Check className="h-3.5 w-3.5" /> : null}
            {smsSaved ? "Saved!" : "Save"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
