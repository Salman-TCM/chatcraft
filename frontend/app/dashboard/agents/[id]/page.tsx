"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Bot, Check, ChevronDown, ChevronUp, Code2,
  Globe, Loader2, Mail, Link2, Send, Chrome, Sheet, Trash2, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  chatbot_id: string | null;
  model: string;
  tools: Record<string, boolean>;
  memory_enabled: boolean;
  max_steps: number;
  is_published: boolean;
  is_active: boolean;
}

interface Chatbot {
  id: string;
  name: string;
}

interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result";
  content: string;
  tool?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TOOLS = [
  { key: "web_search", label: "Web Search", icon: Globe, description: "Search the internet for current info" },
  { key: "browser",    label: "Browser",    icon: Chrome, description: "Visit and read web pages" },
  { key: "code",       label: "Run Code",   icon: Code2,  description: "Execute Python for calculations" },
  { key: "http",       label: "HTTP",       icon: Link2,  description: "Call external APIs" },
  { key: "sheets",     label: "Sheets",     icon: Sheet,  description: "Read/write Google Sheets" },
  { key: "email",      label: "Email",      icon: Mail,   description: "Send emails via your integration" },
];

const MODELS = [
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
  "gpt-4o",
  "gpt-4o-mini",
  "gemini-2.0-flash",
];

// ── Main component ────────────────────────────────────────────────────────────

export default function AgentBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [chatbots, setChatbots] = useState<Chatbot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [chatbotId, setChatbotId] = useState<string>("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [maxSteps, setMaxSteps] = useState(10);

  // Test chat
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatRunning, setChatRunning] = useState(false);
  const [showTools, setShowTools] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      apiClient.get(`/api/v1/agents/${id}`),
      apiClient.get("/api/chatbots"),
    ]).then(([agentRes, botsRes]) => {
      const a: Agent = agentRes.data.data;
      setAgent(a);
      setName(a.name);
      setDescription(a.description ?? "");
      setInstructions(a.instructions ?? "");
      setChatbotId(a.chatbot_id ?? "");
      setModel(a.model);
      setTools(a.tools ?? {});
      setMemoryEnabled(a.memory_enabled);
      setMaxSteps(a.max_steps);
      setChatbots(botsRes.data.data ?? []);
    }).catch(() => router.push("/dashboard/agents")).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  async function save() {
    setSaving(true);
    try {
      await apiClient.put(`/api/v1/agents/${id}`, {
        name,
        description: description || null,
        instructions: instructions || null,
        chatbot_id: chatbotId || null,
        model,
        tools,
        memory_enabled: memoryEnabled,
        max_steps: maxSteps,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function sendChatMessage() {
    const text = chatInput.trim();
    if (!text || chatRunning) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: text }]);
    setChatRunning(true);

    const history = chatMessages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const token = (window as any).__NEXT_AUTH_TOKEN__ || "";
      const resp = await fetch(`${apiBase}/api/v1/agents/${id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, conversation_history: history }),
        credentials: "include",
      });

      const reader = resp.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let currentText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const evt = JSON.parse(line.slice(6));
            if (evt.type === "text") {
              currentText += evt.content;
              setChatMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return [...prev.slice(0, -1), { ...last, content: currentText }];
                }
                return [...prev, { role: "assistant", content: currentText }];
              });
            } else if (evt.type === "tool_call") {
              setChatMessages(prev => [
                ...prev,
                { role: "tool_call", content: JSON.stringify(evt.input, null, 2), tool: evt.tool },
              ]);
            } else if (evt.type === "tool_result") {
              setChatMessages(prev => [
                ...prev,
                { role: "tool_result", content: evt.result, tool: evt.tool },
              ]);
            }
          } catch { /* ignore */ }
        }
      }
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally {
      setChatRunning(false);
    }
  }

  if (loading || !agent) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-48px)] overflow-hidden">

      {/* ── Left panel: configuration ─────────────────────────────────────── */}
      <div className="w-[380px] shrink-0 border-r flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-sm font-semibold truncate flex-1">{name || "Untitled Agent"}</h1>
          <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : saved ? <Check className="h-3.5 w-3.5" /> : null}
            {saved ? "Saved!" : "Save"}
          </Button>
        </div>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Identity */}
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Identity</h2>
            <div className="space-y-1.5">
              <Label className="text-xs">Name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} className="h-8 text-sm" placeholder="My Research Agent" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input value={description} onChange={e => setDescription(e.target.value)} className="h-8 text-sm" placeholder="What this agent does…" />
            </div>
          </section>

          {/* Model */}
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Model</h2>
            <div className="space-y-1.5">
              <Label className="text-xs">AI Model</Label>
              <select
                value={model}
                onChange={e => setModel(e.target.value)}
                className="w-full h-8 rounded-md border bg-background px-3 text-sm"
              >
                {MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Max Steps (agentic loop limit)</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={maxSteps}
                onChange={e => setMaxSteps(parseInt(e.target.value) || 10)}
                className="h-8 text-sm"
              />
            </div>
          </section>

          {/* Knowledge — attach chatbot */}
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Knowledge Base</h2>
            <div className="space-y-1.5">
              <Label className="text-xs">Attach Chatbot (inherits its KB + system prompt)</Label>
              <select
                value={chatbotId}
                onChange={e => setChatbotId(e.target.value)}
                className="w-full h-8 rounded-md border bg-background px-3 text-sm"
              >
                <option value="">— None —</option>
                {chatbots.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </section>

          {/* Instructions */}
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Instructions / Prompt</h2>
            <Textarea
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              placeholder="You are a research agent. When given a topic, search the web, read relevant pages, and produce a detailed summary with citations..."
              className="min-h-[140px] text-sm font-mono resize-none"
            />
            <p className="text-[11px] text-muted-foreground">
              If a chatbot is attached, these instructions are appended after its system prompt.
            </p>
          </section>

          {/* Tools */}
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tools</h2>
            <div className="space-y-2">
              {TOOLS.map(({ key, label, icon: Icon, description: desc }) => {
                const enabled = !!tools[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                      enabled ? "border-indigo-300 bg-indigo-50" : "hover:bg-muted/50"
                    }`}
                    onClick={() => setTools(prev => ({ ...prev, [key]: !prev[key] }))}
                  >
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${enabled ? "bg-indigo-600 text-white" : "bg-muted"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{label}</p>
                      <p className="text-[11px] text-muted-foreground">{desc}</p>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 shrink-0 ${enabled ? "bg-indigo-600 border-indigo-600" : "border-muted-foreground/30"}`}>
                      {enabled && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Memory */}
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Memory</h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMemoryEnabled(v => !v)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${memoryEnabled ? "bg-primary" : "bg-muted"}`}
              >
                <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${memoryEnabled ? "translate-x-4.5" : "translate-x-0.5"}`} />
              </button>
              <span className="text-xs text-muted-foreground">
                {memoryEnabled ? "Agent remembers past conversations" : "Each conversation starts fresh"}
              </span>
            </div>
          </section>
        </div>
      </div>

      {/* ── Right panel: test chat ─────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-indigo-500" />
            <span className="text-sm font-medium">Test Agent</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              onClick={() => setShowTools(v => !v)}
            >
              {showTools ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              Tool steps
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setChatMessages([])}
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {chatMessages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Bot className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Send a message to test your agent.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Save your changes first, then test.</p>
            </div>
          )}

          {chatMessages.map((msg, i) => {
            if (msg.role === "tool_call" && !showTools) return null;
            if (msg.role === "tool_result" && !showTools) return null;

            if (msg.role === "tool_call") {
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs max-w-[90%]">
                    <p className="font-medium text-amber-700 mb-1">⚙️ Calling {msg.tool}</p>
                    <pre className="text-[11px] text-amber-600 whitespace-pre-wrap break-all">{msg.content}</pre>
                  </div>
                </div>
              );
            }

            if (msg.role === "tool_result") {
              return (
                <div key={i} className="flex items-start gap-2">
                  <div className="rounded bg-green-50 border border-green-200 px-3 py-2 text-xs max-w-[90%]">
                    <p className="font-medium text-green-700 mb-1">✓ {msg.tool} result</p>
                    <p className="text-[11px] text-green-700 whitespace-pre-wrap break-all line-clamp-4">{msg.content}</p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={i}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap break-words ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {msg.content}
                  {msg.role === "assistant" && chatRunning && i === chatMessages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom" />
                  )}
                </div>
              </div>
            );
          })}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <div className="flex gap-2">
            <Input
              placeholder="Test your agent… (e.g. 'Research the latest news on AI')"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendChatMessage()}
              disabled={chatRunning}
              className="text-sm"
            />
            <Button
              size="icon"
              onClick={sendChatMessage}
              disabled={!chatInput.trim() || chatRunning}
            >
              {chatRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Tool calls and results are shown inline. Save changes before testing.
          </p>
        </div>
      </div>
    </div>
  );
}
