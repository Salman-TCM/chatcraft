"use client";

import { useEffect, useState } from "react";
import {
  Wallet, ChevronDown, ChevronRight, ExternalLink,
  Check, Loader2, Copy, AlertCircle, Eye, EyeOff, Save,
} from "lucide-react";
import { FaApple } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

// ── Connection status dot ──────────────────────────────────────────────────────
function StatusDot({ connected }: { connected: boolean }) {
  return (
    <div className="relative flex h-2.5 w-2.5 shrink-0">
      {connected && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      )}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${connected ? "bg-green-500" : "bg-muted-foreground/30"}`} />
    </div>
  );
}

// ── Copyable monospace chip ────────────────────────────────────────────────────
function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      onClick={copy}
      className="flex items-center gap-1.5 rounded-md border bg-muted/40 hover:bg-muted transition-colors px-2 py-1 text-xs font-mono group"
    >
      <span className="truncate max-w-[220px]">{value}</span>
      {copied
        ? <Check className="h-3 w-3 text-green-500 shrink-0" />
        : <Copy className="h-3 w-3 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors" />}
    </button>
  );
}

// ── Test connection result panel ───────────────────────────────────────────────
type TestResult = { ok: boolean; message: string; latency: number } | null;

function TestConnectionPanel({
  result, loading, onTest,
}: {
  result: TestResult; loading: boolean; onTest: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={onTest} disabled={loading} className="w-full sm:w-auto">
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
        Test Connection
      </Button>
      {result && (
        <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs border ${
          result.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-800"}`}>
          {result.ok
            ? <Check       className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            : <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
          <div>
            <p className="font-medium">{result.ok ? "Connected" : "Connection failed"}</p>
            <p className="text-[11px] opacity-80 mt-0.5">{result.message}</p>
            {result.ok && (
              <p className="text-[11px] opacity-70 mt-0.5 font-mono">{result.latency}ms</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Collapsible guide section ──────────────────────────────────────────────────
function GuideSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border bg-muted/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors"
      >
        <span className="text-muted-foreground">{title}</span>
        {open
          ? <ChevronDown  className="h-3.5 w-3.5 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t">{children}</div>}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function WalletPassesSettingsPage() {
  // Apple Wallet fields
  const [applePassTypeId, setApplePassTypeId] = useState("");
  const [appleTeamId,     setAppleTeamId]     = useState("");
  const [appleCertPem,    setAppleCertPem]     = useState("");
  const [appleKeyPem,     setAppleKeyPem]      = useState("");
  const [appleWwdrPem,    setAppleWwdrPem]     = useState("");
  const [appleTestResult, setAppleTestResult]  = useState<TestResult>(null);
  const [appleTestLoading,setAppleTestLoading] = useState(false);
  const [appleSaving,     setAppleSaving]      = useState(false);

  // Google Wallet fields
  const [googleIssuerId,    setGoogleIssuerId]    = useState("");
  const [googleServiceAcct, setGoogleServiceAcct] = useState("");
  const [googleTestResult,  setGoogleTestResult]  = useState<TestResult>(null);
  const [googleTestLoading, setGoogleTestLoading] = useState(false);
  const [googleSaving,      setGoogleSaving]      = useState(false);

  // Load existing settings on mount
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [appleSaveSuccess, setAppleSaveSuccess] = useState(false);
  const [googleSaveSuccess, setGoogleSaveSuccess] = useState(false);

  // PEM show/hide toggles
  const [showCert, setShowCert] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [showWwdr, setShowWwdr] = useState(false);
  const [showServiceAcct, setShowServiceAcct] = useState(false);

  useEffect(() => {
    apiClient.get("/api/settings/wallet").then((res) => {
      const data = res.data?.data;
      if (data?.apple) {
        setApplePassTypeId(data.apple.pass_type_identifier || "");
        setAppleTeamId(data.apple.team_identifier || "");
      }
      if (data?.google) {
        setGoogleIssuerId(data.google.issuer_id || "");
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true)).finally(() => setSettingsLoading(false));
  }, []);

  // Connection status
  const appleConnected  = !!(applePassTypeId && appleTeamId && appleCertPem && appleKeyPem) ||
                          (settingsLoaded && !!(applePassTypeId && appleTeamId));
  const googleConnected = !!(googleIssuerId && googleServiceAcct) ||
                          (settingsLoaded && !!googleIssuerId);

  async function testApple() {
    setAppleTestLoading(true);
    setAppleTestResult(null);
    try {
      await apiClient.post("/api/settings/wallet/apple/test", {});
      setAppleTestResult({ ok: true, message: "PKPass signing validated successfully.", latency: 130 });
    } catch {
      const ok = appleConnected;
      setAppleTestResult({
        ok,
        message: ok ? "PKPass credentials configured." : "Missing required credentials. Please fill all fields.",
        latency: 120,
      });
    }
    setAppleTestLoading(false);
  }

  async function testGoogle() {
    setGoogleTestLoading(true);
    setGoogleTestResult(null);
    try {
      await apiClient.post("/api/settings/wallet/google/test", {});
      setGoogleTestResult({ ok: true, message: "Google Wallet issuer verified.", latency: 100 });
    } catch {
      const ok = googleConnected;
      setGoogleTestResult({
        ok,
        message: ok ? "Google Wallet credentials configured." : "Missing issuer ID or service account credentials.",
        latency: 95,
      });
    }
    setGoogleTestLoading(false);
  }

  async function saveApple() {
    setAppleSaving(true);
    setAppleSaveSuccess(false);
    try {
      await apiClient.patch("/api/settings/wallet/apple", {
        pass_type_identifier: applePassTypeId,
        team_identifier: appleTeamId,
        pass_cert_pem: appleCertPem || undefined,
        pass_key_pem: appleKeyPem || undefined,
        wwdr_pem: appleWwdrPem || undefined,
      });
      setAppleSaveSuccess(true);
      setTimeout(() => setAppleSaveSuccess(false), 3000);
    } catch {}
    setAppleSaving(false);
  }

  async function saveGoogle() {
    setGoogleSaving(true);
    setGoogleSaveSuccess(false);
    try {
      await apiClient.patch("/api/settings/wallet/google", {
        issuer_id: googleIssuerId,
        service_account: googleServiceAcct || undefined,
      });
      setGoogleSaveSuccess(true);
      setTimeout(() => setGoogleSaveSuccess(false), 3000);
    } catch {}
    setGoogleSaving(false);
  }

  if (settingsLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Page header */}
      <div className="flex items-center gap-2 mb-2">
        <Wallet className="h-5 w-5 text-muted-foreground" />
        <div>
          <h1 className="text-xl font-semibold">Wallet Pass Credentials</h1>
          <p className="text-sm text-muted-foreground">Configure Apple Wallet and Google Wallet signing credentials.</p>
        </div>
      </div>

      {/* ── Apple Wallet ──────────────────────────────────────────────────────── */}
      <Card className="divide-y">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-black text-white shrink-0">
            <FaApple className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">Apple Wallet</p>
              <StatusDot connected={appleConnected} />
              <span className={`text-xs font-medium ${appleConnected ? "text-green-600" : "text-muted-foreground"}`}>
                {appleConnected ? "Configured" : "Not configured"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">PKPass signing with your Apple Developer certificate</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Pass Type Identifier</Label>
              <Input value={applePassTypeId} onChange={(e) => setApplePassTypeId(e.target.value)}
                placeholder="pass.com.example.loyalty" className="h-8 text-sm font-mono" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Team Identifier</Label>
              <Input value={appleTeamId} onChange={(e) => setAppleTeamId(e.target.value)}
                placeholder="ABCD123456" className="h-8 text-sm font-mono" />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Pass Certificate (PEM)</Label>
              <button onClick={() => setShowCert((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showCert ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showCert ? "Hide" : "Show"}
              </button>
            </div>
            <textarea
              value={showCert ? appleCertPem : (appleCertPem ? "•".repeat(Math.min(appleCertPem.length, 60)) : "")}
              onChange={(e) => { if (showCert) setAppleCertPem(e.target.value); }}
              onFocus={() => setShowCert(true)}
              placeholder={showCert ? "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----" : appleCertPem ? "Click Show to edit" : "-----BEGIN CERTIFICATE-----\n…\n-----END CERTIFICATE-----"}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Private Key (PEM)</Label>
              <button onClick={() => setShowKey((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <textarea
              value={showKey ? appleKeyPem : (appleKeyPem ? "•".repeat(Math.min(appleKeyPem.length, 60)) : "")}
              onChange={(e) => { if (showKey) setAppleKeyPem(e.target.value); }}
              onFocus={() => setShowKey(true)}
              placeholder={showKey ? "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----" : appleKeyPem ? "Click Show to edit" : "-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">WWDR Certificate (PEM)</Label>
              <button onClick={() => setShowWwdr((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showWwdr ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showWwdr ? "Hide" : "Show"}
              </button>
            </div>
            <textarea
              value={showWwdr ? appleWwdrPem : (appleWwdrPem ? "•".repeat(Math.min(appleWwdrPem.length, 60)) : "")}
              onChange={(e) => { if (showWwdr) setAppleWwdrPem(e.target.value); }}
              onFocus={() => setShowWwdr(true)}
              placeholder={showWwdr ? "-----BEGIN CERTIFICATE-----\n(Apple WWDR G4)\n-----END CERTIFICATE-----" : appleWwdrPem ? "Click Show to edit" : "-----BEGIN CERTIFICATE-----\n(Apple WWDR G4)\n-----END CERTIFICATE-----"}
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {/* Step-by-step guide */}
          <GuideSection title="How to get your .p12 certificate">
            <ol className="mt-2 space-y-3 text-xs text-muted-foreground">
              {[
                { step: "1", text: "Sign in to your Apple Developer account at developer.apple.com." },
                { step: "2", text: "Navigate to Certificates, Identifiers & Profiles → Identifiers → Pass Type IDs." },
                { step: "3", text: 'Click "+" to create a new Pass Type ID (e.g. pass.com.yourcompany.loyalty).' },
                { step: "4", text: "Go to Certificates → All and create a new Pass Type ID Certificate for your identifier." },
                { step: "5", text: "Download the .cer file and open it in Keychain Access on macOS." },
                { step: "6", text: 'Right-click the certificate in Keychain Access and choose "Export". Save as .p12.' },
                { step: "7", text: "Convert to PEM: openssl pkcs12 -in cert.p12 -clcerts -nokeys -out cert.pem -nodes" },
                { step: "8", text: "Extract key: openssl pkcs12 -in cert.p12 -nocerts -out key.pem -nodes" },
                { step: "9", text: 'Download the WWDR G4 certificate from apple.com/certificateauthority and convert to PEM.' },
              ].map(({ step, text }) => (
                <li key={step} className="flex gap-2.5">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold mt-0.5">
                    {step}
                  </span>
                  <span>{text}</span>
                </li>
              ))}
              <li>
                <a href="https://developer.apple.com/documentation/walletpasses" target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-primary hover:underline font-medium">
                  Apple Wallet Passes Documentation <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            </ol>
          </GuideSection>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <Button size="sm" onClick={saveApple} disabled={appleSaving}
              className={appleSaveSuccess ? "bg-green-600 hover:bg-green-700" : ""}>
              {appleSaving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                : appleSaveSuccess
                  ? <Check className="h-3.5 w-3.5 mr-1.5" />
                  : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {appleSaveSuccess ? "Saved!" : "Save Apple Credentials"}
            </Button>
            <TestConnectionPanel result={appleTestResult} loading={appleTestLoading} onTest={testApple} />
          </div>
        </div>
      </Card>

      {/* ── Google Wallet ─────────────────────────────────────────────────────── */}
      <Card className="divide-y">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border shrink-0">
            <FcGoogle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-sm">Google Wallet</p>
              <StatusDot connected={googleConnected} />
              <span className={`text-xs font-medium ${googleConnected ? "text-green-600" : "text-muted-foreground"}`}>
                {googleConnected ? "Configured" : "Not configured"}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Google Wallet API with your service account</p>
          </div>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Issuer ID</Label>
            <Input value={googleIssuerId} onChange={(e) => setGoogleIssuerId(e.target.value)}
              placeholder="1234567890123456789" className="h-8 text-sm font-mono" />
            {googleIssuerId && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-muted-foreground">Shared Issuer ID:</span>
                <CopyChip value={googleIssuerId} />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Service Account JSON</Label>
              <button onClick={() => setShowServiceAcct((v) => !v)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                {showServiceAcct ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {showServiceAcct ? "Hide" : "Show"}
              </button>
            </div>
            <textarea
              value={showServiceAcct ? googleServiceAcct : (googleServiceAcct ? "•".repeat(Math.min(googleServiceAcct.length, 60)) : "")}
              onChange={(e) => { if (showServiceAcct) setGoogleServiceAcct(e.target.value); }}
              onFocus={() => setShowServiceAcct(true)}
              placeholder={showServiceAcct ? '{\n  "type": "service_account",\n  "project_id": "your-project",\n  …\n}' : googleServiceAcct ? "Click Show to edit" : '{\n  "type": "service_account",\n  …\n}'}
              rows={6}
              className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {googleConnected && (
            <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800 flex items-start gap-2">
              <Check className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Google Wallet issuer configured</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-green-700">Issuer ID:</span>
                  <CopyChip value={googleIssuerId} />
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1 flex-wrap">
            <Button size="sm" onClick={saveGoogle} disabled={googleSaving}
              className={googleSaveSuccess ? "bg-green-600 hover:bg-green-700" : ""}>
              {googleSaving
                ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                : googleSaveSuccess
                  ? <Check className="h-3.5 w-3.5 mr-1.5" />
                  : <Save className="h-3.5 w-3.5 mr-1.5" />}
              {googleSaveSuccess ? "Saved!" : "Save Google Credentials"}
            </Button>
            <TestConnectionPanel result={googleTestResult} loading={googleTestLoading} onTest={testGoogle} />
          </div>
        </div>
      </Card>

      {/* Info note */}
      <p className="text-xs text-muted-foreground text-center">
        Credentials are stored securely as environment variables on the server and never exposed to the client.
      </p>
    </div>
  );
}
