"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Send, Square, RotateCcw, Download, Copy, Settings,
  Play, Loader2, Terminal, Code, Clock, Zap, AlertTriangle,
  Minimize2, Maximize2, PanelLeftClose, PanelLeftOpen,
  Check, X, ChevronDown, Globe, Search, FileText, Database,
  Wrench, ChevronRight, Activity, Paperclip,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/hooks/use-toast";
import { getSession } from "next-auth/react";
import { MarkdownContent } from "@/components/chat/markdown-content";
import { TtsPlayer } from "@/components/chat/tts-player";
import { VoiceRecorder } from "@/components/chat/voice-recorder";

const ATTACHMENT_ACCEPT = ".pdf,.docx,.txt";
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // matches backend cap

interface PendingAttachment {
  filename: string;
  text: string;
  truncated: boolean;
}

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  tools: Record<string, boolean>;
  instructions: string | null;
  max_steps: number;
  is_active: boolean;
}

interface Message {
  role: "user" | "assistant" | "system" | "error";
  content: string;
  attachmentName?: string;
  timestamp: Date;
}

interface ToolExecution {
  id: number;
  step: number;
  tool: string;
  input: any;
  output?: string;
  status: "running" | "completed" | "failed";
  duration?: number;
  startTime: Date;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatToolName(tool: string): string {
  return tool.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getToolIcon(tool: string) {
  const t = tool.toLowerCase();
  if (t.includes("search")) return Search;
  if (t.includes("browser") || t.includes("web")) return Globe;
  if (t.includes("code") || t.includes("python") || t.includes("exec")) return Code;
  if (t.includes("file") || t.includes("read") || t.includes("write")) return FileText;
  if (t.includes("sql") || t.includes("database") || t.includes("db")) return Database;
  if (t.includes("api") || t.includes("http")) return Zap;
  return Wrench;
}

function getInputSummary(input: any): string {
  if (!input) return "";
  if (typeof input === "string") return input.slice(0, 80);
  const values = Object.values(input);
  if (values.length === 0) return "";
  const first = String(values[0]).slice(0, 80);
  return first + (first.length >= 80 ? "…" : "");
}

// ─── sub-components ──────────────────────────────────────────────────────────

function InputBlock({ input }: { input: any }) {
  if (!input) return <p className="text-xs text-muted-foreground italic">No input</p>;

  if (typeof input === "string") {
    return (
      <p className="text-xs font-mono bg-background rounded p-2 break-all whitespace-pre-wrap">
        {input}
      </p>
    );
  }

  const entries = Object.entries(input);
  if (entries.length === 0) return <p className="text-xs text-muted-foreground italic">Empty</p>;

  return (
    <div className="space-y-1.5">
      {entries.map(([key, value]) => (
        <div key={key} className="flex gap-2 text-xs">
          <span className="font-medium text-muted-foreground shrink-0 w-24 truncate capitalize">
            {key.replace(/_/g, " ")}
          </span>
          <span className="font-mono break-all text-foreground">
            {typeof value === "object" ? JSON.stringify(value) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function OutputBlock({ output }: { output: string }) {
  const [showFull, setShowFull] = useState(false);
  const lines = output.split("\n");
  const isLong = lines.length > 6 || output.length > 300;
  const displayText = !showFull && isLong ? output.slice(0, 300) + "…" : output;

  return (
    <div>
      <pre className="text-xs bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
        {displayText}
      </pre>
      {isLong && (
        <button
          className="text-xs text-primary mt-1 hover:underline"
          onClick={() => setShowFull((v) => !v)}
        >
          {showFull ? "Show less" : `Show all (${lines.length} lines)`}
        </button>
      )}
    </div>
  );
}

function ToolExecutionCard({
  execution,
  isExpanded,
  onToggle,
}: {
  execution: ToolExecution;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const ToolIcon = getToolIcon(execution.tool);
  const isRunning = execution.status === "running";
  const isFailed = execution.status === "failed";

  return (
    <div
      className={`rounded-lg border overflow-hidden transition-colors ${
        isRunning
          ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20"
          : isFailed
          ? "border-red-200 bg-red-50/30 dark:bg-red-950/20"
          : "border-border bg-card"
      }`}
    >
      {/* Collapsed header — always visible */}
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
        onClick={onToggle}
      >
        {/* Status icon */}
        <span
          className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
            isRunning
              ? "bg-amber-100 text-amber-600 dark:bg-amber-900/50"
              : isFailed
              ? "bg-red-100 text-red-600 dark:bg-red-900/50"
              : "bg-green-100 text-green-600 dark:bg-green-900/50"
          }`}
        >
          {isRunning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isFailed ? (
            <X className="h-3 w-3" />
          ) : (
            <Check className="h-3 w-3" />
          )}
        </span>

        {/* Tool name + input summary */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <ToolIcon className="h-3 w-3 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">{formatToolName(execution.tool)}</span>
          </div>
          {!isExpanded && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {getInputSummary(execution.input) || <span className="italic">no input</span>}
            </p>
          )}
        </div>

        {/* Duration + chevron */}
        <div className="flex-shrink-0 flex items-center gap-1.5 text-xs text-muted-foreground">
          {execution.duration != null ? (
            <>
              <Clock className="h-3 w-3" />
              <span>{formatDuration(execution.duration)}</span>
            </>
          ) : isRunning ? (
            <span className="text-amber-600 font-medium">Running…</span>
          ) : null}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Expanded details */}
      {isExpanded && (
        <div className="border-t px-3 pb-3 pt-2.5 space-y-3 bg-muted/10">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
              Input
            </p>
            <InputBlock input={execution.input} />
          </div>

          {execution.output && (
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Output
              </p>
              <OutputBlock output={execution.output} />
            </div>
          )}

          {execution.status === "running" && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Waiting for result…</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function AgentRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  const [messages, setMessages] = useState<Message[]>([]);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const executionIdRef = useRef(0);

  const [input, setInput] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => { loadAgent(); }, [id]);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    getSession().then((session) => {
      setAccessToken(session?.user?.accessToken ?? null);
    });
  }, []);

  const loadAgent = async () => {
    try {
      const response = await apiClient.get(`/api/v1/agents/${id}`);
      setAgent(response.data.data);
    } catch {
      router.push("/dashboard/agents");
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > ATTACHMENT_MAX_BYTES) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — max 10 MB.`,
      });
      e.target.value = "";
      return;
    }
    setAttachmentUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await apiClient.post(`/api/v1/agents/${id}/attachments/extract`, form);
      setPendingAttachment(data.data);
      if (data.data.truncated) {
        toast({
          title: "File truncated",
          description: `${file.name} was long, so only the first part will be sent as context.`,
        });
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to read file",
        description: getErrorMessage(err),
      });
    } finally {
      setAttachmentUploading(false);
      e.target.value = "";
    }
  };

  const toggleToolExpand = (toolId: number) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolId)) next.delete(toolId);
      else next.add(toolId);
      return next;
    });
  };

  const stopExecution = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    addMessage("system", "Execution stopped by user");
  };

  const resetConversation = () => {
    abortControllerRef.current?.abort();
    setMessages([]);
    setToolExecutions([]);
    setExpandedTools(new Set());
    setCurrentStep(0);
    setIsRunning(false);
  };

  const addMessage = (role: Message["role"], content: string, attachmentName?: string) => {
    setMessages((prev) => [...prev, { role, content, attachmentName, timestamp: new Date() }]);
  };

  const exportConversation = () => {
    const data = { agent: agent?.name, model: agent?.model, timestamp: new Date().toISOString(), messages, toolExecutions };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-conversation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyConversation = () => {
    const text = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
  };

  const sendMessage = async () => {
    const userInput = input.trim();
    if (!userInput || isRunning || !agent) return;

    const attachment = pendingAttachment;
    const messageToSend = attachment
      ? `${userInput}\n\n--- Attached file: ${attachment.filename}${
          attachment.truncated ? " (truncated)" : ""
        } ---\n${attachment.text}\n--- end attachment ---`
      : userInput;

    setInput("");
    setPendingAttachment(null);
    setIsRunning(true);
    setCurrentStep(0);
    addMessage("user", userInput, attachment?.filename);

    let activeExecutionId = -1;

    try {
      const session = await getSession();
      const token = (session?.user as any)?.accessToken;
      if (!token) { addMessage("error", "Authentication required. Please refresh the page."); return; }

      abortControllerRef.current = new AbortController();

      const response = await fetch(`${apiBase}/api/v1/agents/${id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          message: messageToSend,
          conversation_history: messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) throw new Error(`Request failed: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMessage = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));

            if (event.type === "text") {
              assistantMessage += event.content;
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  last.content = assistantMessage;
                } else {
                  next.push({ role: "assistant", content: assistantMessage, timestamp: new Date() });
                }
                return next;
              });
            } else if (event.type === "tool_call") {
              const step = event.step || currentStep + 1;
              setCurrentStep(step);
              assistantMessage = "";

              const newId = ++executionIdRef.current;
              activeExecutionId = newId;

              const execution: ToolExecution = {
                id: newId,
                step,
                tool: event.tool,
                input: event.input,
                status: "running",
                startTime: new Date(),
              };

              setToolExecutions((prev) => [...prev, execution]);
              // Auto-expand newly running tool
              setExpandedTools((prev) => new Set([...prev, newId]));
            } else if (event.type === "tool_result") {
              // Match by (tool name + still-running) instead of the shared
              // activeExecutionId var. React batches setState across a burst of
              // SSE events, and by the time the setState callback runs the
              // mutable activeExecutionId has been overwritten by the NEXT
              // tool_call — which left web_search stuck "Running..." forever
              // any time the model emitted 2+ tools in one turn.
              const toolName = event.tool as string;
              setToolExecutions((prev) => {
                const idx = prev.findIndex(
                  (e) => e.status === "running" && e.tool === toolName
                );
                if (idx < 0) return prev;
                const next = prev.slice();
                next[idx] = {
                  ...next[idx],
                  output: event.result,
                  status: "completed",
                  duration: Date.now() - next[idx].startTime.getTime(),
                };
                return next;
              });
            } else if (event.type === "error") {
              addMessage("error", event.content);
            }
          } catch {
            // ignore malformed JSON
          }
        }
      }
    } catch (error: any) {
      if (error.name !== "AbortError") {
        addMessage("error", error.message || "Network error occurred");
      }
    } finally {
      setIsRunning(false);
      setCurrentStep(0);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading agent…</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Agent not found</p>
        </div>
      </div>
    );
  }

  const enabledTools = Object.entries(agent.tools).filter(([, enabled]) => enabled);
  const completedCount = toolExecutions.filter((e) => e.status === "completed").length;
  const failedCount = toolExecutions.filter((e) => e.status === "failed").length;

  return (
    <div className={`h-screen flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-background" : ""}`}>
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-medium">{agent.name}</h1>
            <p className="text-xs text-muted-foreground">
              {agent.model} • Max {agent.max_steps} steps
              {enabledTools.length > 0 && ` • ${enabledTools.length} tools`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowSidebar(!showSidebar)}>
            {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/agents/${id}`)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Main chat area */}
        <main className="flex flex-1 flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <Terminal className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">Ready to execute</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Send a message to start a conversation with {agent.name}
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === "user"
                        ? "bg-foreground text-background"
                        : message.role === "error"
                        ? "bg-red-50 border border-red-200 text-red-800 dark:bg-red-950/30 dark:border-red-800 dark:text-red-300"
                        : message.role === "system"
                        ? "bg-yellow-50 border border-yellow-200 text-yellow-800 dark:bg-yellow-950/30 dark:border-yellow-800 dark:text-yellow-300"
                        : "bg-muted"
                    }`}
                  >
                    {message.attachmentName && (
                      <div className="flex items-center gap-1.5 text-xs opacity-75 mb-1.5">
                        <Paperclip className="h-3 w-3" />
                        <span className="truncate">{message.attachmentName}</span>
                      </div>
                    )}
                    {message.role === "assistant" ? (
                      <div className="text-sm">
                        <MarkdownContent content={message.content} />
                      </div>
                    ) : (
                      <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="text-xs opacity-50">{message.timestamp.toLocaleTimeString()}</div>
                      {message.role === "assistant" && message.content && (
                        <TtsPlayer
                          text={message.content}
                          apiBase={apiBase}
                          accessToken={accessToken}
                          className="text-xs opacity-70 hover:opacity-100"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {isRunning && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">
                    {currentStep > 0 ? `Running step ${currentStep}…` : "Processing…"}
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="border-t p-4 shrink-0">
            {pendingAttachment && (
              <div className="flex items-center gap-2 mb-2 rounded-md border bg-muted/40 px-2.5 py-1.5 text-xs w-fit max-w-full">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{pendingAttachment.filename}</span>
                {pendingAttachment.truncated && (
                  <span className="text-muted-foreground shrink-0">(truncated)</span>
                )}
                <button
                  onClick={() => setPendingAttachment(null)}
                  className="inline-flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
                  title="Remove attachment"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept={ATTACHMENT_ACCEPT}
                className="hidden"
                onChange={handleFileSelect}
              />
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message…"
                disabled={isRunning || !agent.is_active}
                className="flex-1 min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <div className="flex flex-col gap-2">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isRunning || !agent.is_active || attachmentUploading}
                    title="Attach a PDF, DOCX, or TXT file"
                  >
                    {attachmentUploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Paperclip className="h-4 w-4" />
                    )}
                  </Button>
                  <VoiceRecorder
                    onTranscript={(text) => setInput((prev) => (prev ? `${prev} ${text}` : text))}
                    onError={(msg) => toast({ variant: "destructive", title: "Voice input failed", description: msg })}
                    accessToken={accessToken}
                    disabled={isRunning || !agent.is_active}
                  />
                </div>
                <Button
                  onClick={sendMessage}
                  disabled={!input.trim() || isRunning || !agent.is_active}
                  size="sm"
                >
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
                {isRunning && (
                  <Button onClick={stopExecution} variant="outline" size="sm">
                    <Square className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>
                Enter to send, Shift+Enter for new line
                {!agent.is_active && " • Agent is inactive"}
              </span>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={resetConversation} disabled={isRunning} title="Reset conversation">
                  <RotateCcw className="h-3 w-3" />
                </Button>
                {messages.length > 0 && (
                  <>
                    <Button variant="ghost" size="sm" onClick={copyConversation} title="Copy conversation">
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={exportConversation} title="Export as JSON">
                      <Download className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar */}
        {showSidebar && (
          <aside className="w-80 border-l flex flex-col min-h-0">
            {/* Tool activity header */}
            <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-sm">Activity</h3>
                {toolExecutions.length > 0 && (
                  <Badge variant="secondary" className="text-xs px-1.5 py-0">
                    {toolExecutions.length}
                  </Badge>
                )}
              </div>
              {toolExecutions.length > 0 && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {completedCount > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <Check className="h-3 w-3" />
                      {completedCount}
                    </span>
                  )}
                  {failedCount > 0 && (
                    <span className="flex items-center gap-1 text-red-600">
                      <X className="h-3 w-3" />
                      {failedCount}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Tool execution list */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {toolExecutions.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-32 text-center text-muted-foreground">
                  <Zap className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-xs">No tool activity yet</p>
                  <p className="text-xs opacity-70 mt-0.5">Tools used during the run will appear here</p>
                </div>
              ) : (
                toolExecutions.map((execution) => (
                  <ToolExecutionCard
                    key={execution.id}
                    execution={execution}
                    isExpanded={expandedTools.has(execution.id)}
                    onToggle={() => toggleToolExpand(execution.id)}
                  />
                ))
              )}
            </div>

            {/* Agent info — collapsible footer */}
            <AgentInfoPanel agent={agent} enabledTools={enabledTools} />
          </aside>
        )}
      </div>
    </div>
  );
}

function AgentInfoPanel({
  agent,
  enabledTools,
}: {
  agent: Agent;
  enabledTools: [string, boolean][];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border-t shrink-0">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors text-sm font-medium"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Agent info</span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 text-sm border-t bg-muted/10">
          {agent.description && (
            <div className="pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Description</p>
              <p className="text-sm text-muted-foreground">{agent.description}</p>
            </div>
          )}

          <div className={agent.description ? "" : "pt-3"}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Available Tools</p>
            <div className="flex flex-wrap gap-1">
              {enabledTools.length === 0 ? (
                <span className="text-xs text-muted-foreground italic">No tools enabled</span>
              ) : (
                enabledTools.map(([toolName]) => (
                  <Badge key={toolName} variant="outline" className="text-xs">
                    {formatToolName(toolName)}
                  </Badge>
                ))
              )}
            </div>
          </div>

          {agent.instructions && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Instructions</p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {agent.instructions}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
