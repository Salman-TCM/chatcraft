"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, Bot, Check, ChevronDown, ChevronUp, Loader2, Send, Zap } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { MarkdownContent } from "@/components/chat/markdown-content";
import { RichContent, parseRichContent } from "@/components/chat/rich-content";

interface AgentDesign {
  primary_colour: string;
  logo_url: string | null;
  dark_mode: boolean;
  show_branding: boolean;
  font_family: string;
  bubble_style: "rounded" | "pill" | "square";
  placeholder_text: string;
}

interface AgentInfo extends AgentDesign {
  id: string;
  name: string;
  description: string | null;
  model: string;
  welcome_message: string | null;
  suggestions_enabled: boolean;
  welcome_suggestions: string[];
}

interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result" | "error";
  content: string;
  tool?: string;
  step?: number;
  isWelcome?: boolean;
}

// Derive readable foreground colour for a hex bg
function contrastColor(hex: string): string {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  // Perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? "#09090b" : "#ffffff";
}

function bubbleRadius(style: string) {
  if (style === "pill")   return "9999px";
  if (style === "square") return "4px";
  return "12px";
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

  // ── Derived design tokens ───────────────────────────────────────────────────
  const primary       = agent.primary_colour || "#6366f1";
  const primaryFg     = contrastColor(primary);
  const isDark        = agent.dark_mode;
  const bg            = isDark ? "#18181b" : "#ffffff";
  const surface       = isDark ? "#27272a" : "#f4f4f5";
  const textColor     = isDark ? "#f4f4f5" : "#09090b";
  const mutedText     = isDark ? "#a1a1aa" : "#71717a";
  const border        = isDark ? "#3f3f46" : "#e4e4e7";
  const font          = agent.font_family || "system-ui";
  const radius        = bubbleRadius(agent.bubble_style);

  const pageStyle: React.CSSProperties = {
    fontFamily: `'${font}', system-ui, sans-serif`,
    backgroundColor: bg,
    color: textColor,
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  };

  return (
    <div style={pageStyle}>

      {/* Header */}
      <div style={{ borderBottom: `1px solid ${border}`, backgroundColor: bg }}
           className="px-4 py-3 flex items-center gap-3 shrink-0">
        {agent.logo_url ? (
          <img src={agent.logo_url} alt={agent.name}
               className="h-9 w-9 rounded-xl object-cover shrink-0" />
        ) : (
          <div className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
               style={{ backgroundColor: primary + "22" }}>
            <Bot className="h-5 w-5" style={{ color: primary }} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: textColor }}>{agent.name}</p>
          {agent.description && (
            <p className="text-[11px] truncate" style={{ color: mutedText }}>{agent.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {running && stepCount > 0 && (
            <span className="text-[11px] font-medium flex items-center gap-1" style={{ color: primary }}>
              <Zap className="h-3 w-3" /> Step {stepCount}
            </span>
          )}
          <button
            className="text-xs flex items-center gap-1"
            style={{ color: mutedText }}
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
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl mb-4"
                 style={{ backgroundColor: primary + "18" }}>
              <Bot className="h-7 w-7" style={{ color: primary }} />
            </div>
            <p className="font-medium text-sm" style={{ color: mutedText }}>{agent.name}</p>
            {agent.description && (
              <p className="text-xs mt-1 max-w-xs" style={{ color: mutedText + "99" }}>{agent.description}</p>
            )}
            <p className="text-[11px] mt-3" style={{ color: mutedText + "80" }}>
              Type a message below to get started
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if ((msg.role === "tool_call" || msg.role === "tool_result") && !showTools) return null;

          if (msg.role === "error") {
            return (
              <div key={i} className="flex justify-start">
                <div className="rounded-2xl border px-4 py-2.5 text-sm max-w-[85%] rounded-bl-sm"
                     style={{ backgroundColor: "#fef2f2", borderColor: "#fecaca" }}>
                  <p className="font-medium flex items-center gap-1.5 mb-0.5"
                     style={{ color: "#b91c1c" }}>
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Error
                  </p>
                  <p className="text-xs whitespace-pre-wrap" style={{ color: "#dc2626" }}>{msg.content}</p>
                </div>
              </div>
            );
          }

          if (msg.role === "tool_call") {
            return (
              <div key={i} className="flex items-start gap-2">
                <div className="rounded-lg border px-3 py-2.5 text-xs max-w-[90%]"
                     style={{ backgroundColor: "#fffbeb", borderColor: "#fcd34d" }}>
                  <p className="font-semibold mb-1 flex items-center gap-1" style={{ color: "#92400e" }}>
                    <Zap className="h-3 w-3" />
                    Step {msg.step} — <code className="font-mono">{msg.tool}</code>
                  </p>
                  <pre className="text-[11px] whitespace-pre-wrap break-all" style={{ color: "#b45309" }}>{msg.content}</pre>
                </div>
              </div>
            );
          }

          if (msg.role === "tool_result") {
            return (
              <div key={i} className="flex items-start gap-2">
                <div className="rounded-lg border px-3 py-2.5 text-xs max-w-[90%]"
                     style={{ backgroundColor: "#f0fdf4", borderColor: "#86efac" }}>
                  <p className="font-semibold mb-1 flex items-center gap-1" style={{ color: "#15803d" }}>
                    <Check className="h-3 w-3" />
                    <code className="font-mono">{msg.tool}</code> result
                  </p>
                  <p className="text-[11px] whitespace-pre-wrap break-all line-clamp-5" style={{ color: "#16a34a" }}>{msg.content}</p>
                </div>
              </div>
            );
          }

          const rich = msg.role === "assistant" ? parseRichContent(msg.content) : null;
          const isUser = msg.role === "user";

          const bubbleStyle: React.CSSProperties = isUser
            ? { backgroundColor: primary, color: primaryFg, borderRadius: radius,
                borderBottomRightRadius: "2px", padding: "10px 16px", fontSize: "14px",
                maxWidth: "80%", wordBreak: "break-word", whiteSpace: "pre-wrap" }
            : { backgroundColor: surface, color: textColor, borderRadius: radius,
                borderBottomLeftRadius: "2px", padding: "10px 16px", fontSize: "14px",
                maxWidth: "80%", wordBreak: "break-word", whiteSpace: "pre-wrap" };

          return (
            <div key={i} className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
              <div style={bubbleStyle}>
                {msg.role === "assistant" ? (
                  <MarkdownContent content={rich ? rich.text : msg.content} />
                ) : (
                  msg.content
                )}
                {msg.role === "assistant" && running && i === messages.length - 1 && (
                  <span className="inline-block w-1.5 h-4 animate-pulse ml-0.5 align-text-bottom rounded-sm"
                        style={{ backgroundColor: "currentColor" }} />
                )}
              </div>
              {rich?.blocks.map((block, bi) => (
                <div key={bi} style={{ maxWidth: "80%" }}>
                  <RichContent block={block} onQuickReply={(reply) => sendMessage(reply)} />
                </div>
              ))}
              {/* Welcome suggestion chips — only after the first (welcome) message, before any user input */}
              {msg.isWelcome && messages.length === 1 && !running &&
                agent.welcome_suggestions?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-1.5" style={{ maxWidth: "85%" }}>
                  {agent.welcome_suggestions.map((s, si) => (
                    <button
                      key={si}
                      onClick={() => sendMessage(s)}
                      style={{
                        border: `1px solid ${primary}55`,
                        color: primary,
                        borderRadius: "9999px",
                        padding: "5px 12px",
                        fontSize: "12px",
                        cursor: "pointer",
                        backgroundColor: primary + "12",
                        fontFamily: "inherit",
                        transition: "background .15s",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = primary + "22")}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = primary + "12")}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {running && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="px-4 py-3" style={{ backgroundColor: surface, borderRadius: radius, borderBottomLeftRadius: "2px" }}>
              <div className="flex gap-1.5">
                {[0, 150, 300].map(delay => (
                  <span key={delay} className="h-1.5 w-1.5 rounded-full animate-bounce"
                        style={{ backgroundColor: mutedText + "66", animationDelay: `${delay}ms` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 shrink-0" style={{ borderTop: `1px solid ${border}`, backgroundColor: bg }}>
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            type="text"
            placeholder={agent.placeholder_text || `Message ${agent.name}…`}
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendMessage()}
            disabled={running}
            style={{
              flex: 1, border: `1px solid ${border}`, borderRadius: "9999px",
              padding: "8px 16px", fontSize: "14px", backgroundColor: surface,
              color: textColor, outline: "none", fontFamily: "inherit",
            }}
            onFocus={e => (e.target.style.borderColor = primary)}
            onBlur={e => (e.target.style.borderColor = border)}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!chatInput.trim() || running}
            style={{
              width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
              backgroundColor: primary, color: primaryFg,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, opacity: (!chatInput.trim() || running) ? 0.5 : 1,
              transition: "opacity .15s ease",
            }}
          >
            {running
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Send className="h-4 w-4" />}
          </button>
        </div>
        {agent.show_branding && (
          <p className="text-center text-[10px] mt-2" style={{ color: mutedText + "80" }}>
            Powered by {APP_NAME}
          </p>
        )}
      </div>
    </div>
  );
}
