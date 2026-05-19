"use client";

import { useState } from "react";
import {
  Monitor, Globe, Search, FileEdit, ChevronRight,
  Loader2, AlertCircle, Check, Play, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

type Mode = "direct" | "research" | "form_fill";

interface SessionResult {
  session_id: string;
  url?: string;
  title?: string;
  content?: string;
  error?: string;
}

const MODES: { value: Mode; label: string; icon: React.ElementType; description: string }[] = [
  {
    value: "direct",
    label: "Direct Browse",
    icon: Globe,
    description: "Visit a URL and extract its content for the AI to read.",
  },
  {
    value: "research",
    label: "Research",
    icon: Search,
    description: "AI searches the web autonomously and synthesises information.",
  },
  {
    value: "form_fill",
    label: "Form Fill",
    icon: FileEdit,
    description: "AI navigates to a URL and fills out a form based on instructions.",
  },
];

export default function BrowserAgentPage() {
  const [mode, setMode] = useState<Mode>("direct");
  const [url, setUrl] = useState("");
  const [query, setQuery] = useState("");
  const [instructions, setInstructions] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      // Create session
      const { data: sessionData } = await apiClient.post("/api/v1/browser/sessions", {
        mode,
        max_pages: 5,
        block_private_ips: true,
      });
      const session_id = sessionData.data?.session_id ?? sessionData.session_id;

      // Execute action
      const actionPayload: Record<string, string> = { action: "fetch" };
      if (mode === "direct") actionPayload.url = url;
      else if (mode === "research") actionPayload.query = query;
      else { actionPayload.url = url; actionPayload.instructions = instructions; }

      const { data: actionData } = await apiClient.post(
        `/api/v1/browser/sessions/${session_id}/action`,
        actionPayload
      );

      setResult({
        session_id,
        url: actionData.data?.url ?? url,
        title: actionData.data?.title,
        content: actionData.data?.content ?? actionData.data?.text,
        error: actionData.data?.error,
      });

      // Close session
      await apiClient.delete(`/api/v1/browser/sessions/${session_id}`).catch(() => {});
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Request failed");
    } finally {
      setRunning(false);
    }
  }

  const canRun = mode === "research" ? !!query.trim() : !!url.trim();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Monitor className="h-6 w-6" /> Browser Agent
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-powered cloud browser — fetch pages, research topics, fill forms.
        </p>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-3 gap-3">
        {MODES.map(m => {
          const Icon = m.icon;
          return (
            <button
              key={m.value}
              onClick={() => setMode(m.value)}
              className={`rounded-xl border-2 p-4 text-left transition-colors ${
                mode === m.value
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-border/80 hover:bg-muted/40"
              }`}
            >
              <Icon className={`h-5 w-5 mb-2 ${mode === m.value ? "text-primary" : "text-muted-foreground"}`} />
              <p className="text-sm font-semibold">{m.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.description}</p>
            </button>
          );
        })}
      </div>

      {/* Inputs */}
      <Card className="p-4 space-y-3">
        {mode !== "research" && (
          <div className="space-y-1">
            <Label className="text-sm">URL</Label>
            <Input
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="font-mono text-sm"
            />
          </div>
        )}
        {mode === "research" && (
          <div className="space-y-1">
            <Label className="text-sm">Research query</Label>
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="What are the latest AI models released in 2025?"
            />
          </div>
        )}
        {mode === "form_fill" && (
          <div className="space-y-1">
            <Label className="text-sm">Form fill instructions</Label>
            <textarea
              className="w-full rounded-md border text-sm px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="Fill in the contact form with name=John Doe, email=john@example.com, message=Hello"
            />
          </div>
        )}
        <Button onClick={run} disabled={running || !canRun} className="w-full gap-2">
          {running
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Running…</>
            : <><Play className="h-4 w-4" /> Run</>
          }
        </Button>
      </Card>

      {/* Error */}
      {error && (
        <Card className="border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-green-600" />
            <span className="text-sm font-semibold">Result</span>
            {result.url && (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto text-xs text-primary hover:underline flex items-center gap-1"
              >
                {result.url.length > 50 ? result.url.slice(0, 50) + "…" : result.url}
                <ChevronRight className="h-3 w-3" />
              </a>
            )}
          </div>
          {result.title && (
            <p className="text-sm font-medium text-muted-foreground">{result.title}</p>
          )}
          {result.error ? (
            <p className="text-sm text-destructive">{result.error}</p>
          ) : result.content ? (
            <div className="rounded-md bg-muted p-3 max-h-96 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap leading-relaxed">{result.content}</pre>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No content returned.</p>
          )}
        </Card>
      )}

      {/* Note about private IPs */}
      <p className="text-xs text-muted-foreground">
        Private IP ranges and localhost addresses are blocked for security. Sessions are automatically closed after 4 minutes of inactivity.
      </p>
    </div>
  );
}
