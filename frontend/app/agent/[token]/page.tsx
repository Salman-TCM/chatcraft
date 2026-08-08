"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Bot, Check, ChevronDown, ChevronUp, Loader2, Send, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { APP_NAME } from "@/lib/constants";
import { RichContent, parseRichContent } from "@/components/chat/rich-content";

interface AgentInfo {
  id: string;
  name: string;
  description: string | null;
  model: string;
  welcome_message: string | null;
  suggestions_enabled: boolean;
}

interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result" | "error";
  content: string;
  tool?: string;
  step?: number;
  isWelcome?: boolean;
}

export default function PublicAgentPage() {
  const { token } = useParams<{ token: string }>();
  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const [stepCount, setStepCount] = useState(0);
  const [showTools, setShowTools] = useState(true);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  useEffect(() => {
    fetch(`${apiBase}/api/public/agents/${token}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setAgent(d.data);
          if (d.data.welcome_message) {
            setMessages([{ role: "assistant", content: d.data.welcome_message, isWelcome: true }]);
          }
        } else {
          setNotFound(true);
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendMessage(override?: string) {
    const text = (override ?? chatInput).trim();
    if (!text || running) return;
    setChatInput("");
    setMessages(prev => [...prev, { role: "user", content: text }]);
    setRunning(true);
    setStepCount(0);

    const history = messages
      .filter(m => !m.isWelcome && (m.role === "user" || m.role === "assistant"))
      .map(m => ({ role: m.role as "user" | "assistant", content: m.content }));

    const pushError = (msg: string) =>
      setMessages(prev => [...prev, { role: "error", content: msg }]);

    try {
      const resp = await fetch(`${apiBase}/api/public/agents/${token}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, conversation_history: history }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        const detail = errData?.detail;
        pushError(typeof detail === "string" ? detail : detail?.error ?? `Request failed (${resp.status})`);
        return;
      }

      const reader = resp.body?.getReader();
      if (!reader) { pushError("No response stream received."); return; }

      const decoder = new TextDecoder();
      let buffer = "";
      let currentText = "";
      let currentStep = 0;

      const handleEvent = (evt: any) => {
        if (evt.type === "text") {
          currentText += evt.content;
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant") {
              return [...prev.slice(0, -1), { ...last, content: currentText }];
            }
            return [...prev, { role: "assistant", content: currentText }];
          });
        } else if (evt.type === "tool_call") {
          currentStep++;
          setStepCount(currentStep);
          setMessages(prev => [
            ...prev,
            { role: "tool_call", content: JSON.stringify(evt.input, null, 2), tool: evt.tool, step: currentStep },
          ]);
        } else if (evt.type === "tool_result") {
          setMessages(prev => [
            ...prev,
            { role: "tool_result", content: evt.result, tool: evt.tool, step: currentStep },
          ]);
          currentText = "";
        } else if (evt.type === "error") {
          pushError(evt.content);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { handleEvent(JSON.parse(line.slice(6))); } catch { /* malformed */ }
        }
      }
      if (buffer.startsWith("data: ")) {
        try { handleEvent(JSON.parse(buffer.slice(6))); } catch { /* ignore */ }
      }
    } catch (e: any) {
      pushError(e.message || "Network error — please check your connection and try again.");
    } finally {
      setRunning(false);
      setStepCount(0);
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !agent) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center px-6">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted mb-4">
          <Bot className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h1 className="text-lg font-semibold">Agent not found</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          This agent link is invalid or sharing has been disabled by its owner.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">

      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3 bg-background">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 shrink-0">
          <Bot className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate">{agent.name}</p>
          {agent.description && (
            <p className="text-[11px] text-muted-foreground truncate">{agent.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {running && stepCount > 0 && (
            <span className="text-[11px] text-amber-600 font-medium flex items-center gap-1">
              <Zap className="h-3 w-3" /> Step {stepCount}
            </span>
          )}
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            onClick={() => setShowTools(v => !v)}
          >
            {showTools ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">Tool steps</span>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-3xl mx-auto w-full">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 mb-4">
              <Bot className="h-7 w-7 text-indigo-400" />
            </div>
            <p className="font-medium text-sm text-muted-foreground">{agent.name}</p>
            {agent.description && (
              <p className="text-xs text-muted-foreground/70 mt-1 max-w-xs">{agent.description}</p>
            )}
            <p className="text-[11px] text-muted-foreground/50 mt-3">
              Type a message below to get started
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if ((msg.role === "tool_call" || msg.role === "tool_result") && !showTools) return null;

          if (msg.role === "error") {
            return (
              <div key={i} className="flex justify-start">
                <div className="rounded-2xl bg-red-50 border border-red-200 px-4 py-2.5 text-sm max-w-[85%] rounded-bl-sm">
                  <p className="font-medium text-red-700 flex items-center gap-1.5 mb-0.5">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Error
                  </p>
                  <p className="text-xs text-red-600 whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            );
          }

          if (msg.role === "tool_call") {
            return (
              <div key={i} className="flex items-start gap-2">
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs max-w-[90%]">
                  <p className="font-semibold text-amber-700 mb-1 flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Step {msg.step} — <code className="font-mono">{msg.tool}</code>
                  </p>
                  <pre className="text-[11px] text-amber-600 whitespace-pre-wrap break-all">{msg.content}</pre>
                </div>
              </div>
            );
          }

          if (msg.role === "tool_result") {
            return (
              <div key={i} className="flex items-start gap-2">
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 text-xs max-w-[90%]">
                  <p className="font-semibold text-green-700 mb-1 flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    <code className="font-mono">{msg.tool}</code> result
                  </p>
                  <p className="text-[11px] text-green-700 whitespace-pre-wrap break-all line-clamp-5">{msg.content}</p>
                </div>
              </div>
            );
          }

          const rich = msg.role === "assistant" ? parseRichContent(msg.content) : null;
          return (
            <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className={`rounded-2xl px-4 py-2.5 text-sm max-w-[80%] whitespace-pre-wrap break-words ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-muted text-foreground rounded-bl-sm"
              }`}>
                {rich ? rich.text : msg.content}
                {msg.role === "assistant" && running && i === messages.length - 1 && (
                  <span className="inline-block w-1.5 h-4 bg-current animate-pulse ml-0.5 align-text-bottom rounded-sm" />
                )}
              </div>
              {rich?.blocks.map((block, bi) => (
                <div key={bi} className="max-w-[80%]">
                  <RichContent block={block} onQuickReply={(reply) => sendMessage(reply)} />
                </div>
              ))}
            </div>
          );
        })}

        {running && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-muted px-4 py-3 rounded-bl-sm">
              <div className="flex gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4 bg-background">
        <div className="max-w-3xl mx-auto flex gap-2">
          <Input
            placeholder={`Message ${agent.name}…`}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            disabled={running}
            className="text-sm"
          />
          <Button
            size="icon"
            onClick={() => sendMessage()}
            disabled={!chatInput.trim() || running}
            className="shrink-0"
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/50 mt-2">
          Powered by {APP_NAME}
        </p>
      </div>
    </div>
  );
}
