"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, Loader2, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

const smtpSchema = z.object({
  host: z.string().trim().min(1, "SMTP host is required"),
  port: z
    .string()
    .trim()
    .min(1, "Port is required")
    .regex(/^\d+$/, "Port must be a number")
    .refine((v) => {
      const n = Number(v);
      return n >= 1 && n <= 65535;
    }, "Port must be between 1 and 65535"),
  smtpUser: z.string().trim().min(1, "Username is required"),
  smtpPass: z.string().optional(),
});

type SmtpFormData = z.infer<typeof smtpSchema>;

const testEmailSchema = z.object({
  testTo: z.string().trim().email("Enter a valid email"),
});

type TestEmailFormData = z.infer<typeof testEmailSchema>;

export default function AgencyEmailPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testSent, setTestSent] = useState(false);

  const {
    register: registerSmtp,
    handleSubmit: handleSmtpSubmit,
    setValue: setSmtpValue,
    setError: setSmtpError,
    watch: watchSmtp,
    formState: { errors: smtpErrors },
  } = useForm<SmtpFormData>({
    resolver: zodResolver(smtpSchema),
    defaultValues: { host: "", port: "587", smtpUser: "", smtpPass: "" },
  });

  const {
    register: registerTest,
    handleSubmit: handleTestSubmit,
    setError: setTestError,
    watch: watchTest,
    formState: { errors: testErrors },
  } = useForm<TestEmailFormData>({
    resolver: zodResolver(testEmailSchema),
    defaultValues: { testTo: "" },
  });

  const host = watchSmtp("host");
  const smtpUser = watchSmtp("smtpUser");
  const testTo = watchTest("testTo");

  useEffect(() => {
    apiClient
      .get("/api/v1/agency/me")
      .then(({ data }) => {
        const cfg = data.data.smtp_config;
        if (cfg) {
          setSmtpValue("host", cfg.host ?? "");
          setSmtpValue("port", String(cfg.port ?? 587));
          setSmtpValue("smtpUser", cfg.user ?? "");
        }
      })
      .catch((err) => {
        toast({
          variant: "destructive",
          title: "Failed to load SMTP settings",
          description: getErrorMessage(err),
        });
      })
      .finally(() => setLoading(false));
  }, [setSmtpValue]);

  async function onSaveSmtp(data: SmtpFormData) {
    setSaving(true);
    try {
      await apiClient.put("/api/v1/agency/me", {
        smtp_config: {
          host: data.host,
          port: parseInt(data.port, 10),
          user: data.smtpUser,
          password: data.smtpPass,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setSmtpError(field as keyof SmtpFormData, { message });
      });
      toast({
        variant: "destructive",
        title: "Failed to save SMTP config",
        description: getErrorMessage(err),
      });
    } finally {
      setSaving(false);
    }
  }

  async function onSendTest(data: TestEmailFormData) {
    setTesting(true);
    setTestSent(false);
    try {
      await apiClient.post("/api/v1/agency/send-test-email", { to: data.testTo });
      setTestSent(true);
      toast({ title: "Test email sent", description: `Sent to ${data.testTo}.` });
      setTimeout(() => setTestSent(false), 2500);
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setTestError(field === "to" ? "testTo" : (field as keyof TestEmailFormData), { message });
      });
      toast({
        variant: "destructive",
        title: "Failed to send test email",
        description: getErrorMessage(err),
      });
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

      <form onSubmit={handleSmtpSubmit(onSaveSmtp)}>
        <Card className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">SMTP Host</Label>
              <Input placeholder="smtp.mailgun.org" {...registerSmtp("host")} />
              {smtpErrors.host && (
                <p className="text-sm text-destructive mt-1">{smtpErrors.host.message}</p>
              )}
            </div>
            <div>
              <Label className="text-xs mb-1.5 block text-muted-foreground">Port</Label>
              <Input type="number" placeholder="587" {...registerSmtp("port")} />
              {smtpErrors.port && (
                <p className="text-sm text-destructive mt-1">{smtpErrors.port.message}</p>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Username</Label>
            <Input placeholder="postmaster@youragency.com" {...registerSmtp("smtpUser")} />
            {smtpErrors.smtpUser && (
              <p className="text-sm text-destructive mt-1">{smtpErrors.smtpUser.message}</p>
            )}
          </div>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Password</Label>
            <Input type="password" placeholder="••••••••" {...registerSmtp("smtpPass")} />
          </div>

          <Button type="submit" disabled={saving || !host?.trim() || !smtpUser?.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : saved ? <><Check className="h-4 w-4 mr-1.5" />Saved</> : null}
            {!saving && !saved && "Save SMTP Config"}
          </Button>
        </Card>
      </form>

      <form onSubmit={handleTestSubmit(onSendTest)}>
        <Card className="p-4 space-y-3">
          <p className="text-sm font-semibold">Send Test Email</p>
          <div>
            <Label className="text-xs mb-1.5 block text-muted-foreground">Send to</Label>
            <Input type="email" placeholder="you@example.com" {...registerTest("testTo")} />
            {testErrors.testTo && (
              <p className="text-sm text-destructive mt-1">{testErrors.testTo.message}</p>
            )}
          </div>
          {testSent && (
            <p className="text-xs text-green-600">Test email sent successfully!</p>
          )}
          <Button type="submit" variant="outline" disabled={testing || !testTo?.trim()}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
            {testing ? "Sending…" : "Send Test"}
          </Button>
        </Card>
      </form>
    </div>
  );
}
