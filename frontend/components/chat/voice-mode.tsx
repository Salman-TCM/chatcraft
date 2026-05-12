"use client";

import { useEffect, useRef } from "react";
import { X, Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

interface VoiceModeProps {
  chatbotName: string;
  accessToken?: string | null;
  onTranscriptSend: (text: string) => void;
  onClose: () => void;
}

export function VoiceMode({
  chatbotName,
  accessToken,
  onTranscriptSend,
  onClose,
}: VoiceModeProps) {
  const { state, audioLevel, start, stop } = useVoiceRecorder({
    silenceDurationMs: 2000,
    onTranscript: (text) => {
      if (text.trim()) onTranscriptSend(text.trim());
    },
    accessToken,
  });

  const isRecording = state === "recording";
  const isProcessing = state === "processing";

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Build waveform ring scale based on audio level
  const ringScale = 1 + audioLevel * 0.5;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md">
      {/* Close */}
      <Button
        size="icon"
        variant="ghost"
        className="absolute right-4 top-4"
        onClick={onClose}
      >
        <X className="h-5 w-5" />
      </Button>

      <p className="mb-2 text-sm text-muted-foreground">{chatbotName}</p>
      <p className="mb-12 text-lg font-medium">
        {isProcessing
          ? "Processing…"
          : isRecording
          ? "Listening…"
          : "Tap to speak"}
      </p>

      {/* Animated ring */}
      <div className="relative flex items-center justify-center">
        {isRecording && (
          <div
            className="absolute rounded-full bg-primary/20 transition-transform duration-75"
            style={{
              width: 120,
              height: 120,
              transform: `scale(${ringScale})`,
            }}
          />
        )}

        <button
          onClick={isRecording ? stop : start}
          disabled={isProcessing}
          className={cn(
            "relative z-10 flex h-24 w-24 items-center justify-center rounded-full transition-colors",
            isRecording
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
            isProcessing && "opacity-60 cursor-not-allowed"
          )}
        >
          {isProcessing ? (
            <Loader2 className="h-10 w-10 animate-spin" />
          ) : isRecording ? (
            <MicOff className="h-10 w-10" />
          ) : (
            <Mic className="h-10 w-10" />
          )}
        </button>
      </div>

      {/* Waveform bars */}
      {isRecording && (
        <div className="mt-10 flex items-center gap-1 h-8">
          {Array.from({ length: 12 }).map((_, i) => {
            const h = Math.max(4, Math.round(audioLevel * 32 * (0.4 + 0.6 * Math.abs(Math.sin(i)))));
            return (
              <div
                key={i}
                className="w-1.5 rounded-full bg-primary transition-all duration-75"
                style={{ height: `${h}px` }}
              />
            );
          })}
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        {isRecording ? "Auto-stops after 2s of silence · Tap to stop" : "Press Esc to close"}
      </p>
    </div>
  );
}
