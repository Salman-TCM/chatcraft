"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

export default function AgencyEmailPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    apiClient.get("/api/v1/agency/me").then(({ data }) => {
      const cfg = data.data.smtp_config;
      if (cfg) {
        setHost(cfg.host ?? "");
        setPort(String(cfg.port ?? 587));
        setSmtpUser(cfg.user ?? "");
      }
    }).finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await apiClient.put("/api/v1/agency/me", {
        smtp_config: { host, port: parseInt(port), user: smtpUser, password: smtpPass },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setTestResult(null);
    try {
      await apiClient.post("/api/v1/agency/send-test-email", { to: testTo });
      setTestResult("Test email sent successfully!");
    } catch (e: any) {
      setTestResult(e?.response?.data?.detail ?? "Failed to send test email.");
    } finally {
      setTesting(false);
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Mail className="h-6 w-6" />Custom SMTP</h1>
        <p className="text-sm text-muted-foreground mt-1">Send transactional emails through your own mail server.</p>
      </div>

      <Card className="p-4 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">SMTP Host</Label>
            <Input value={host} onChange={e => setHost(e.target.value)} placeholder="smtp.mailgun.org" />
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Port</Label>
            <Input type="number" value={port} onChange={e => setPort(e.target.value)} placeholder="587" />
          </div>
        </div>
        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Username</Label>
          <Input value={smtpUser} onChange={e => setSmtpUser(e.target.value)} placeholder="postmaster@youragency.com" />
        </div>
        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Password</Label>
          <Input type="password" value={smtpPass} onChange={e => setSmtpPass(e.target.value)} placeholder="••••••••" />
        </div>

        <Button onClick={save} disabled={saving || !host || !smtpUser}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : saved ? <><Check className="h-4 w-4 mr-1.5" />Saved</> : null}
          {!saving && !saved && "Save SMTP Config"}
        </Button>
      </Card>

      <Card className="p-4 space-y-3">
        <p className="text-sm font-semibold">Send Test Email</p>
        <div>
          <Label className="text-xs mb-1.5 block text-muted-foreground">Send to</Label>
          <Input type="email" value={testTo} onChange={e => setTestTo(e.target.value)} placeholder="you@example.com" />
        </div>
        {testResult && (
          <p className={`text-xs ${testResult.includes("success") ? "text-green-600" : "text-destructive"}`}>{testResult}</p>
        )}
        <Button variant="outline" onClick={sendTest} disabled={testing || !testTo.trim()}>
          {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
          {testing ? "Sending…" : "Send Test"}
        </Button>
      </Card>
    </div>
  );
}
