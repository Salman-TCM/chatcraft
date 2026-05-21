"use client";

import { useEffect, useState } from "react";
import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { AudioPlayer } from "./audio-player";
import { RichContent, parseRichContent } from "./rich-content";
import type { ChatMessage } from "./types";

interface MessageBubbleProps {
  message: ChatMessage;
  onFeedbackChange?: (id: string, feedback: "thumbs_up" | "thumbs_down") => void;
  onQuickReply?: (reply: string) => void;
  onPostback?: (payload: string) => void;
  ttsEnabled?: boolean;
  autoPlayTts?: boolean;
  accessToken?: string | null;
  apiBase?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function MessageBubble({
  message,
  onFeedbackChange,
  onQuickReply,
  onPostback,
  ttsEnabled = false,
  autoPlayTts = false,
  accessToken,
  apiBase = API_BASE,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState(message.feedback ?? null);
  const isUser = message.role === "user";

  // Parse rich content blocks from assistant messages
  const { text: displayText, blocks: richBlocks } = !isUser && !message.isStreaming
    ? parseRichContent(message.content)
    : { text: message.content, blocks: [] };

  // Extract YouTube video IDs from assistant message text
  const youtubeIds = !isUser && !message.isStreaming ? extractYouTubeIds(displayText) : [];

  // TTS audio URL — built from API endpoint; backend redirects to cached S3 URL
  const ttsUrl = ttsEnabled && !isUser && !message.isStreaming && message.content
    ? `${apiBase}/api/voice/tts`
    : null;

  async function handleCopy() {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function handleFeedback(value: "thumbs_up" | "thumbs_down") {
    if (feedback === value) return;
    try {
      await apiClient.post(`/api/chat/messages/${message.id}/feedback`, {
        feedback: value,
      });
      setFeedback(value);
      onFeedbackChange?.(message.id, value);
    } catch {
      // Feedback is best-effort
    }
  }

  return (
    <div className={cn("group flex gap-3 px-4 py-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground border"
        )}
      >
        {isUser ? "U" : "AI"}
      </div>

      {/* Bubble */}
      <div className={cn("flex max-w-[75%] flex-col gap-1", isUser && "items-end")}>
        {(displayText || message.isStreaming) && (
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words",
              isUser
                ? "bg-primary text-primary-foreground rounded-tr-sm"
                : "bg-muted text-foreground rounded-tl-sm"
            )}
          >
            {displayText}
            {message.isStreaming && (
              <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-current opacity-70" />
            )}
          </div>
        )}

        {/* YouTube embeds */}
        {youtubeIds.map((vid) => (
          <div key={vid} className="mt-1 w-full max-w-xs rounded-xl overflow-hidden border">
            <iframe
              src={`https://www.youtube.com/embed/${vid}`}
              title="YouTube video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full aspect-video"
              loading="lazy"
            />
          </div>
        ))}

        {/* Rich content blocks */}
        {richBlocks.map((block, i) => (
          <RichContent
            key={i}
            block={block}
            onQuickReply={onQuickReply}
            onPostback={onPostback}
          />
        ))}

        {/* TTS audio player */}
        {ttsUrl && (
          <TtsPlayer
            text={displayText || message.content}
            apiBase={apiBase}
            accessToken={accessToken}
            autoPlay={autoPlayTts}
          />
        )}

        {/* Action row — visible on hover for assistant messages */}
        {!isUser && !message.isStreaming && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              title="Copy"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-7 w-7",
                feedback === "thumbs_up"
                  ? "text-green-600"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => handleFeedback("thumbs_up")}
              title="Good response"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className={cn(
                "h-7 w-7",
                feedback === "thumbs_down"
                  ? "text-red-500"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => handleFeedback("thumbs_down")}
              title="Poor response"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </Button>
            {message.model && (
              <span className="ml-1 text-[10px] text-muted-foreground">{message.model}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── YouTube URL extractor ─────────────────────────────────────────────────────

const YT_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/g;

function extractYouTubeIds(text: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  let match;
  YT_REGEX.lastIndex = 0;
  while ((match = YT_REGEX.exec(text)) !== null) {
    if (!seen.has(match[1])) {
      ids.push(match[1]);
      seen.add(match[1]);
    }
  }
  return ids;
}

// ── TTS Player sub-component ──────────────────────────────────────────────────

function TtsPlayer({
  text,
  apiBase,
  accessToken,
  autoPlay,
}: {
  text: string;
  apiBase: string;
  accessToken?: string | null;
  autoPlay: boolean;
}) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requested, setRequested] = useState(false);

  // Auto-fetch on mount when autoPlay is enabled
  useEffect(() => {
    if (autoPlay && !requested) fetchAudio();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchAudio() {
    if (loading || audioUrl) return;
    setLoading(true);
    setRequested(true);
    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
      const res = await fetch(`${apiBase}/api/voice/tts`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text, use_cache_url: false }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch {}
    finally { setLoading(false); }
  }

  if (!audioUrl && !loading) {
    return (
      <button
        onClick={fetchAudio}
        className="mt-1 text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
      >
        Listen
      </button>
    );
  }
  if (loading) {
    return <p className="mt-1 text-[10px] text-muted-foreground">Generating audio…</p>;
  }
  return <AudioPlayer src={audioUrl!} autoPlay={autoPlay} className="mt-1 max-w-xs" />;
}
