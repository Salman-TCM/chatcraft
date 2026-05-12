"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/store";
import { ChatInput } from "./chat-input";
import { MessageBubble } from "./message-bubble";
import { ModelSwitcher } from "./model-switcher";
import { TypingIndicator } from "./typing-indicator";
import { VoiceMode } from "./voice-mode";
import type { ChatMessage, ChatbotConfig } from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const GUEST_ID_KEY = "chatcraft_guest_id";

function getGuestId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
}

interface ChatWindowProps {
  chatbot: ChatbotConfig;
  initialConversationId?: string | null;
  onConversationCreated?: (id: string) => void;
}

export function ChatWindow({
  chatbot,
  initialConversationId,
  onConversationCreated,
}: ChatWindowProps) {
  const accessToken = useAppStore((s) => s.user?.accessToken);
  const openHardPaywall = useAppStore((s) => s.openHardPaywall);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(
    initialConversationId ?? null
  );
  const [selectedModel, setSelectedModel] = useState(chatbot.defaultModel);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [voiceModeOpen, setVoiceModeOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load history when conversation ID changes
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }
    loadConversation(conversationId);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadConversation(id: string) {
    setLoadingHistory(true);
    try {
      const headers: Record<string, string> = {};
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

      const res = await fetch(
        `${API_BASE}/api/chat/${chatbot.id}/history?per_page=100`,
        { headers }
      );
      const json = await res.json();
      const conv = (json.data ?? []).find((c: { id: string }) => c.id === id);
      if (conv) {
        setMessages(
          (conv.messages ?? []).map((m: {
            id: string; role: "user" | "assistant"; content: string;
            model?: string; input_tokens?: number; output_tokens?: number;
            cost_usd?: string; feedback?: "thumbs_up" | "thumbs_down" | null;
          }) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            model: m.model,
            inputTokens: m.input_tokens,
            outputTokens: m.output_tokens,
            costUsd: m.cost_usd,
            feedback: m.feedback,
          }))
        );
      }
    } catch {}
    setLoadingHistory(false);
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");

    // Optimistic user message
    const tempUserId = `tmp-${Date.now()}`;
    setMessages((prev) => [...prev, { id: tempUserId, role: "user", content: text }]);

    // Placeholder streaming message
    const tempAiId = `tmp-ai-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: tempAiId, role: "assistant", content: "", isStreaming: true },
    ]);

    setIsStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Guest-ID": getGuestId(),
      };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE}/api/chat/${chatbot.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          model: chatbot.allowModelSwitch ? selectedModel : undefined,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const code = err?.detail?.code;
        if (code === "MESSAGE_CAP_REACHED") {
          openHardPaywall(err?.detail?.cap ?? 0);
        }
        setMessages((prev) => prev.filter((m) => m.id !== tempAiId));
        return;
      }

      // Read X-Guest-ID from response header (in case backend issued one)
      const returnedGuestId = res.headers.get("X-Guest-ID");
      if (returnedGuestId && returnedGuestId !== getGuestId()) {
        localStorage.setItem(GUEST_ID_KEY, returnedGuestId);
      }

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.startsWith("data: ") ? part.slice(6) : part;
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "delta") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId
                    ? { ...m, content: m.content + event.content }
                    : m
                )
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId
                    ? {
                        ...m,
                        id: event.message_id,
                        isStreaming: false,
                        model: event.model,
                        inputTokens: event.input_tokens,
                        outputTokens: event.output_tokens,
                        costUsd: event.cost_usd,
                      }
                    : m
                )
              );
              if (!conversationId && event.conversation_id) {
                setConversationId(event.conversation_id);
                onConversationCreated?.(event.conversation_id);
              }
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId
                    ? { ...m, content: `Error: ${event.error}`, isStreaming: false }
                    : m
                )
              );
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAiId
              ? { ...m, content: "Something went wrong. Please try again.", isStreaming: false }
              : m
          )
        );
      } else {
        // Aborted — remove the empty streaming placeholder if nothing was received
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tempAiId ? { ...m, isStreaming: false } : m
          )
        );
      }
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }, [input, isStreaming, conversationId, accessToken, chatbot, selectedModel, openHardPaywall, onConversationCreated]);

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleRegenerate() {
    // Find the last user message and re-send it
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser || isStreaming) return;
    // Remove the last assistant message before re-sending
    setMessages((prev) => {
      const idx = prev.findLastIndex((m) => m.role === "assistant");
      return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
    });
    setInput(lastUser.content);
    // Let the input settle then send
    setTimeout(() => {
      setInput("");
      // Re-use sendMessage logic inline to avoid stale closure
      const text = lastUser.content;
      const tempAiId = `tmp-ai-regen-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: tempAiId, role: "assistant", content: "", isStreaming: true },
      ]);
      void regenerateSend(text, tempAiId);
    }, 0);
  }

  async function regenerateSend(text: string, tempAiId: string) {
    setIsStreaming(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "X-Guest-ID": getGuestId(),
      };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

      const res = await fetch(`${API_BASE}/api/chat/${chatbot.id}`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: text,
          conversation_id: conversationId,
          model: chatbot.allowModelSwitch ? selectedModel : undefined,
        }),
        signal: ctrl.signal,
      });

      if (!res.ok) return;
      const reader = res.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          const line = part.startsWith("data: ") ? part.slice(6) : part;
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line);
            if (event.type === "delta") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId ? { ...m, content: m.content + event.content } : m
                )
              );
            } else if (event.type === "done") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tempAiId
                    ? { ...m, id: event.message_id, isStreaming: false, model: event.model }
                    : m
                )
              );
            }
          } catch {}
        }
      }
    } catch {}
    finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  const lastAssistantMsg = [...messages].reverse().find((m) => m.role === "assistant");
  const canRegenerate = !isStreaming && !!lastAssistantMsg && !lastAssistantMsg.isStreaming;

  return (
    <div className="flex h-full flex-col">
      {voiceModeOpen && (
        <VoiceMode
          chatbotName={chatbot.name}
          accessToken={accessToken}
          onTranscriptSend={(text) => {
            setVoiceModeOpen(false);
            setInput(text);
            // Slight delay so input state settles before sending
            setTimeout(() => sendMessage(), 50);
          }}
          onClose={() => setVoiceModeOpen(false)}
        />
      )}
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b px-4 py-2">
        <span className="text-sm font-medium truncate">{chatbot.name}</span>
        <div className="flex items-center gap-2">
          {chatbot.allowModelSwitch && (
            <ModelSwitcher
              value={selectedModel}
              onChange={setSelectedModel}
              disabled={isStreaming}
            />
          )}
          {canRegenerate && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={handleRegenerate}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1">
        <div className="py-4">
          {loadingHistory && (
            <p className="text-center text-xs text-muted-foreground py-8">Loading…</p>
          )}
          {!loadingHistory && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <p className="text-lg font-medium">{chatbot.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Start a conversation below
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onFeedbackChange={(id, fb) =>
                setMessages((prev) =>
                  prev.map((m) => (m.id === id ? { ...m, feedback: fb } : m))
                )
              }
              ttsEnabled={chatbot.ttsEnabled}
              autoPlayTts={chatbot.autoPlayTts}
              accessToken={accessToken}
            />
          ))}
          {isStreaming && messages[messages.length - 1]?.content === "" && (
            <TypingIndicator />
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput
        value={input}
        onChange={setInput}
        onSend={sendMessage}
        onStop={handleStop}
        isStreaming={isStreaming}
        sttEnabled={chatbot.sttEnabled}
        onVoiceMode={chatbot.sttEnabled ? () => setVoiceModeOpen(true) : undefined}
        accessToken={accessToken}
      />
    </div>
  );
}
