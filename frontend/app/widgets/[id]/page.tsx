"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Send } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const GUEST_KEY = (id: string) => `chatcraft_guest_id_${id}`;
const CONV_KEY  = (id: string) => `chatcraft_conv_id_${id}`;

interface BotConfig {
  id: string;
  name: string;
  primary_colour: string;
  background_colour: string;
  font_family: string;
  welcome_message: string | null;
  placeholder_text: string;
  logo_url: string | null;
  bubble_style: string;
  dark_mode: boolean;
  show_branding: boolean;
  embed_token: string;
  reply_delay_seconds: number;
}

interface Message {
  role: "user" | "bot";
  content: string;
  streaming?: boolean;
  typing?: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function guestId(chatbotId: string) {
  const key = GUEST_KEY(chatbotId);
  let id = localStorage.getItem(key);
  if (!id) {
    id = "g-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(key, id);
  }
  return id;
}

export default function WidgetPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();

  // URL param overrides
  const hideHeader   = searchParams.get("hideHeader") === "true";
  const themeParam   = searchParams.get("theme") ?? "";
  const colorParam   = searchParams.get("primaryColor") ?? "";

  const [config, setConfig] = useState<BotConfig | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState<string | null>(null);
  const [pushState, setPushState] = useState<"idle" | "prompt" | "subscribed" | "denied">("idle");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/widget/${id}/config`)
      .then((r) => r.json())
      .then((j) => {
        const cfg: BotConfig = j.data;
        setConfig(cfg);
        document.title = cfg.name;
        if (cfg.welcome_message) {
          setMessages([{ role: "bot", content: cfg.welcome_message }]);
        }
        // Restore previous conversation id
        const saved = localStorage.getItem(CONV_KEY(id));
        if (saved) setConvId(saved);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!config) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent opacity-50" />
      </div>
    );
  }

  const isDark       = themeParam === "dark" || (!themeParam && config.dark_mode);
  const primaryColor = colorParam || config.primary_colour;
  const bg           = isDark ? "#18181b" : (config.background_colour || "#ffffff");
  const textColor    = isDark ? "#f4f4f5" : "#09090b";
  const mutedColor   = isDark ? "#a1a1aa" : "#71717a";
  const inputBg      = isDark ? "#27272a" : "#f4f4f5";
  const borderColor  = isDark ? "#3f3f46" : "#e4e4e7";
  const br = config.bubble_style === "pill" ? "9999px" : config.bubble_style === "square" ? "4px" : "12px";

  async function sendMessage() {
    if (streaming || !input.trim()) return;
    const text = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStreaming(true);

    const delay = config.reply_delay_seconds ?? 0;
    if (delay > 0) {
      setMessages((prev) => [...prev, { role: "bot", content: "", typing: true }]);
      await new Promise((r) => setTimeout(r, delay * 1000));
      setMessages((prev) => prev.filter((m) => !m.typing));
    }

    setMessages((prev) => [...prev, { role: "bot", content: "", streaming: true }]);

    const gId = guestId(id);

    const res = await fetch(`${API_BASE}/api/widget/${id}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Widget-Token": config.embed_token,
        "X-Guest-ID": gId,
      },
      body: JSON.stringify({ message: text, conversation_id: convId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err?.detail?.error ?? `Error ${res.status}`;
      setMessages((prev) =>
        prev.map((m, i) =>
          i === prev.length - 1 ? { ...m, content: "⚠️ " + msg, streaming: false } : m
        )
      );
      setStreaming(false);
      return;
    }

    const reader = res.body!.getReader();
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
          const ev = JSON.parse(line);
          if (ev.type === "delta") {
            setMessages((prev) =>
              prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: m.content + ev.content } : m
              )
            );
          } else if (ev.type === "done") {
            if (ev.conversation_id) {
              setConvId(ev.conversation_id);
              localStorage.setItem(CONV_KEY(id), ev.conversation_id);
            }
          } else if (ev.type === "error") {
            setMessages((prev) =>
              prev.map((m, i) =>
                i === prev.length - 1 ? { ...m, content: "⚠️ " + ev.error, streaming: false } : m
              )
            );
          }
        } catch {}
      }
    }

    setMessages((prev) =>
      prev.map((m, i) => (i === prev.length - 1 ? { ...m, streaming: false } : m))
    );
    setStreaming(false);
    inputRef.current?.focus();

    // Offer push notifications after first reply (only once per session)
    if (pushState === "idle" && "Notification" in window && Notification.permission === "default") {
      setPushState("prompt");
    }
  }

  async function subscribePush() {
    try {
      if (!("serviceWorker" in navigator) || !convId) return;
      const vapidRes = await fetch(`${API_BASE}/api/widget/${id}/push/vapid-key`);
      if (!vapidRes.ok) { setPushState("denied"); return; }
      const { data } = await vapidRes.json();

      const reg = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") { setPushState("denied"); return; }

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(data.public_key),
      });
      const subJson = sub.toJSON();

      await fetch(`${API_BASE}/api/widget/${id}/push/subscribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Widget-Token": config.embed_token,
        },
        body: JSON.stringify({
          conversation_id: convId,
          endpoint: subJson.endpoint,
          keys: subJson.keys,
        }),
      });
      setPushState("subscribed");
    } catch {
      setPushState("denied");
    }
  }

  return (
    <>
    <style>{`
      @keyframes typingDot {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }
    `}</style>
    <div
      role="main"
      aria-label={`${config.name} chat widget`}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100dvh",
        background: bg,
        color: textColor,
        fontFamily: `'${config.font_family}', system-ui, sans-serif`,
      }}
    >
      {/* Header */}
      {!hideHeader && (
        <div
          style={{
            background: primaryColor,
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {config.logo_url && (
            <img
              src={config.logo_url}
              alt=""
              style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }}
            />
          )}
          <span style={{ color: "#fff", fontWeight: 600, fontSize: 15, flex: 1 }}>
            {config.name}
          </span>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#4ade80",
              flexShrink: 0,
            }}
          />
        </div>
      )}

      {/* Messages */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              maxWidth: "78%",
              padding: "8px 12px",
              fontSize: 14,
              lineHeight: 1.5,
              wordBreak: "break-word",
              borderRadius: br,
              alignSelf: m.role === "user" ? "flex-end" : "flex-start",
              background: m.role === "user" ? primaryColor : inputBg,
              color: m.role === "user" ? "#fff" : textColor,
              opacity: m.streaming && !m.content ? 0.6 : 1,
            }}
          >
            {m.typing ? (
              <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: mutedColor,
                      display: "inline-block",
                      animation: `typingDot 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
              </span>
            ) : (
              m.content || (m.streaming ? "…" : "")
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Push notification prompt */}
      {pushState === "prompt" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 12px",
            borderTop: `1px solid ${borderColor}`,
            background: inputBg,
            flexShrink: 0,
            fontSize: 12,
            color: mutedColor,
          }}
        >
          <span style={{ flex: 1 }}>Get notified when you receive a reply?</span>
          <button
            onClick={subscribePush}
            style={{
              padding: "4px 10px",
              borderRadius: 9999,
              border: `1px solid ${primaryColor}`,
              background: "transparent",
              color: primaryColor,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Notify me
          </button>
          <button
            onClick={() => setPushState("denied")}
            style={{
              padding: "4px 8px",
              borderRadius: 9999,
              border: "none",
              background: "transparent",
              color: mutedColor,
              fontSize: 11,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            No thanks
          </button>
        </div>
      )}

      {pushState === "subscribed" && (
        <div
          style={{
            padding: "6px 12px",
            borderTop: `1px solid ${borderColor}`,
            background: inputBg,
            flexShrink: 0,
            fontSize: 11,
            color: "#4ade80",
            textAlign: "center",
          }}
        >
          ✓ You'll be notified of new replies
        </div>
      )}

      {/* Input */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderTop: `1px solid ${borderColor}`,
          flexShrink: 0,
          background: bg,
        }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
          placeholder={config.placeholder_text || "Type a message…"}
          disabled={streaming}
          style={{
            flex: 1,
            border: `1px solid ${borderColor}`,
            borderRadius: 9999,
            padding: "8px 14px",
            fontSize: 13,
            background: inputBg,
            color: textColor,
            outline: "none",
            fontFamily: "inherit",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={streaming || !input.trim()}
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            cursor: streaming || !input.trim() ? "not-allowed" : "pointer",
            background: primaryColor,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            opacity: streaming || !input.trim() ? 0.5 : 1,
          }}
        >
          <Send size={14} />
        </button>
      </div>

      {/* Branding */}
      {config.show_branding && (
        <div
          style={{
            padding: "4px 12px 8px",
            textAlign: "center",
            fontSize: 10,
            color: mutedColor,
            flexShrink: 0,
            background: bg,
          }}
        >
          Powered by{" "}
          <a
            href="https://chatcraft.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: mutedColor }}
          >
            ChatCraft AI
          </a>
        </div>
      )}
    </div>
    </>
  );
}
