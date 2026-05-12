"use client";

import { Mic, MicOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useVoiceRecorder } from "@/hooks/use-voice-recorder";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onError?: (msg: string) => void;
  accessToken?: string | null;
  disabled?: boolean;
  className?: string;
}

export function VoiceRecorder({
  onTranscript,
  onError,
  accessToken,
  disabled,
  className,
}: VoiceRecorderProps) {
  const { state, audioLevel, start, stop } = useVoiceRecorder({
    onTranscript,
    onError,
    accessToken,
  });

  const isRecording = state === "recording";
  const isProcessing = state === "processing";
  const isRequesting = state === "requesting";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Waveform bars — visible while recording */}
      {isRecording && (
        <div className="flex items-center gap-px h-5">
          {Array.from({ length: 5 }).map((_, i) => {
            const delay = i * 80;
            const height = Math.max(4, Math.round(audioLevel * 20 * (0.5 + Math.random() * 0.5)));
            return (
              <div
                key={i}
                className="w-1 rounded-full bg-primary transition-all duration-75"
                style={{ height: `${height}px`, animationDelay: `${delay}ms` }}
              />
            );
          })}
        </div>
      )}

      <Button
        size="icon"
        variant={isRecording ? "destructive" : "ghost"}
        className={cn(
          "h-8 w-8",
          isRecording && "animate-pulse",
          className
        )}
        onClick={isRecording ? stop : start}
        disabled={disabled || isProcessing || isRequesting}
        title={isRecording ? "Stop recording" : "Start voice input"}
      >
        {isProcessing || isRequesting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isRecording ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
