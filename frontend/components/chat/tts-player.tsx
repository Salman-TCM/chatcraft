"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AudioPlayer } from "./audio-player";

interface TtsPlayerProps {
  text: string;
  apiBase: string;
  accessToken?: string | null;
  autoPlay?: boolean;
  className?: string;
}

/** Fetches TTS audio for `text` on demand (or on mount when autoPlay) and plays it. */
export function TtsPlayer({ text, apiBase, accessToken, autoPlay = false, className }: TtsPlayerProps) {
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
    } catch {
      // best-effort — the "Listen" button just stays clickable to retry
    } finally {
      setLoading(false);
    }
  }

  if (!audioUrl && !loading) {
    return (
      <button
        onClick={fetchAudio}
        className={cn(
          "text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline",
          className
        )}
      >
        Listen
      </button>
    );
  }
  if (loading) {
    return <p className={cn("text-[10px] text-muted-foreground", className)}>Generating audio…</p>;
  }
  return <AudioPlayer src={audioUrl!} autoPlay={autoPlay} className={cn("max-w-xs", className)} />;
}
