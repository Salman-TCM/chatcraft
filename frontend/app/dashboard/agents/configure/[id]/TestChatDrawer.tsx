"use client";

/**
 * Slide-in test chat for the configure page. Streams `/api/v1/agents/{id}/chat`
 * so owners can validate their agent without leaving the config screen.
 */

import { useEffect, useRef, useState } from "react";
import { Send, X, Loader2, Wrench, ArrowRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { RichContent, parseRichContent } from "@/components/chat/rich-content";

type Event =
  | { kind: "user"; content: string }
  | { kind: "assistant"; content: string }
  | { kind: "tool_call"; tool: string; input: unknown }
  | { kind: "tool_result"; tool: string; result: string }
  | { kind: "error"; content: string };

interface Props {
  agentId: string;
  agentName: string;
  welcomeMessage?: string | null;
  open: boolean;
  onClose: () => void;
}

// axios-based apiClient sets Authorization but doesn't stream. We hand-roll
// fetch here so we can consume the SSE body as a readable stream.
async function* streamAgentChat(
  agentId: string,
  message: string,
  token: string,
  signal: AbortSignal,
): AsyncGenerator<Event> {
  const resp = await fetch(`/api/v1/agents/${agentId}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    let msg = `HTTP ${resp.status}`;
    try {
      const j = await resp.json();
      msg = j.detail?.error || j.detail || msg;
    } catch {}
    yield { kind: "error", content: msg };
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // Split on the SSE "data: ..." lines, keep trailing partial in buf.
    let idx: number;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload) continue;
      try {
        const evt = JSON.parse(payload);
        if (evt.type === "text") yield { kind: "assistant", content: String(evt.content ?? "") };
        else if (evt.type === "tool_call")
          yield { kind: "tool_call", tool: String(evt.tool), input: evt.input };
        else if (evt.type === "tool_result")
          yield { kind: "tool_result", tool: String(evt.tool), result: String(evt.result ?? "") };
        else if (evt.type === "error")
          yield { kind: "error", content: String(evt.content ?? "") };
      } catch {
        // Ignore malformed frames; upstream should never send them but we
        // don't want a bad byte to kill the whole stream.
      }
    }
  }
}

// The apiClient stores the Authorization token in its default header — pull it
// out so our streaming fetch reuses the same credential.
function getAuthToken(): string {
  const h = apiClient.defaults.headers.common?.Authorization as string | undefined;
  if (h?.startsWith("Bearer ")) return h.slice(7);
  return "";
}

export function TestChatDrawer({ agentId, agentName, welcomeMessage, open, onClose }: Props) {
  const [events, setEvents] = useState<Event[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [events, sending]);

  useEffect(() => {
    if (open && events.length === 0 && welcomeMessage) {
      setEvents([{ kind: "assistant", content: welcomeMessage }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, welcomeMessage]);

  useEffect(() => {
    // Cancel any inflight stream when the drawer closes so tokens aren't wasted.
    if (!open && abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
      setSending(false);
    }
  }, [open]);

  async function send(override?: string) {
    const msg = (override ?? input).trim();
    if (!msg || sending) return;
    setInput("");
    setEvents((prev) => [...prev, { kind: "user", content: msg }]);
    setSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const token = getAuthToken();
      let currentAssistant: string | null = null;
      for await (const evt of streamAgentChat(agentId, msg, token, controller.signal)) {
        setEvents((prev) => {
          if (evt.kind === "assistant") {
            // Append streaming text into a single assistant bubble per turn.
            if (currentAssistant !== null && prev.length && prev[prev.length - 1].kind === "assistant") {
              const copy = prev.slice();
              (copy[copy.length - 1] as { kind: "assistant"; content: string }).content += evt.content;
              return copy;
            }
            currentAssistant = evt.content;
            return [...prev, { kind: "assistant", content: evt.content }];
          }
          // Tool activity breaks the assistant streak so the next text goes into a new bubble.
          currentAssistant = null;
          return [...prev, evt];
        });
      }
    } catch (err) {
      if ((err as { name?: string })?.name !== "AbortError") {
        setEvents((prev) => [...prev, { kind: "error", content: String(err) }]);
      }
    } finally {
      setSending(false);
      abortRef.current = null;
    }
  }

  function stop() {
    abortRef.current?.abort();
  }

  function reset() {
    stop();
    setEvents(welcomeMessage ? [{ kind: "assistant", content: welcomeMessage }] : []);
  }

  if (!open) return null;

  return (
    <>
      {/* Scrim on mobile */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm sm:hidden"
        onClick={onClose}
      />
      <aside className="fixed right-0 top-0 z-50 flex h-full w-full sm:w-[400px] flex-col border-l bg-background shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="h-4 w-4 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">Test chat</p>
              <p className="text-[11px] text-muted-foreground truncate">{agentName}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {events.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={reset}>
                Clear
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {events.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center h-full text-center gap-2 text-muted-foreground">
              <MessageSquare className="h-8 w-8 opacity-40" />
              <p className="text-sm">Send a message to see how your agent responds with its current settings.</p>
              <p className="text-[11px]">Uses your saved configuration — no need to save first.</p>
            </div>
          )}

          {events.map((e, i) => {
            if (e.kind === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap break-words">
                    {e.content}
                  </div>
                </div>
              );
            }
            if (e.kind === "assistant") {
              const rich = parseRichContent(e.content);
              return (
                <div key={i} className="flex flex-col items-start gap-1.5">
                  <div className="max-w-[85%] rounded-2xl bg-muted px-3 py-2 text-sm whitespace-pre-wrap break-words">
                    {rich.text}
                  </div>
                  {rich.blocks.map((block, bi) => (
                    <div key={bi} className="max-w-[85%]">
                      <RichContent block={block} onQuickReply={(reply) => send(reply)} />
                    </div>
                  ))}
                </div>
              );
            }
            if (e.kind === "tool_call") {
              return (
                <div key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                  <Wrench className="h-3 w-3 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-mono font-medium text-foreground">{e.tool}</span>
                    <span className="mx-1">·</span>
                    <span className="font-mono truncate inline-block max-w-[220px] align-bottom">
                      {typeof e.input === "object" && e.input !== null
                        ? Object.entries(e.input as Record<string, unknown>)
                            .map(([k, v]) => `${k}=${JSON.stringify(v).slice(0, 50)}`)
                            .join(", ")
                        : String(e.input ?? "")}
                    </span>
                  </div>
                </div>
              );
            }
            if (e.kind === "tool_result") {
              return (
                <div key={i} className="flex items-start gap-1.5 text-[11px]">
                  <ArrowRight className="h-3 w-3 mt-0.5 shrink-0 text-emerald-600" />
                  <div className="min-w-0 flex-1 rounded-md bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 font-mono text-emerald-900 dark:text-emerald-200 whitespace-pre-wrap break-words">
                    {e.result.slice(0, 500)}
                    {e.result.length > 500 && <span className="opacity-60"> …(+{e.result.length - 500} chars)</span>}
                  </div>
                </div>
              );
            }
            if (e.kind === "error") {
              return (
                <div key={i} className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                  {e.content}
                </div>
              );
            }
            return null;
          })}

          {sending && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-muted px-3 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              </div>
            </div>
          )}
        </div>

        <div className="border-t px-3 py-2">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
              rows={2}
              className="flex-1 resize-none rounded-md border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              disabled={sending}
            />
            {sending ? (
              <Button size="icon" variant="outline" className="h-9 w-9" onClick={stop} title="Stop">
                <X className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" className="h-9 w-9" onClick={() => send()} disabled={!input.trim()}>
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
