"use client";

import { useRef } from "react";
import { Maximize2, Send, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { VoiceRecorder } from "./voice-recorder";

const MAX_CHARS = 32_000;

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  sttEnabled?: boolean;
  onVoiceMode?: () => void;
  accessToken?: string | null;
}

export function ChatInput({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled,
  sttEnabled,
  onVoiceMode,
  accessToken,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) onSend();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    // Auto-resize
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }

  const remaining = MAX_CHARS - value.length;
  const nearLimit = remaining < 500;

  return (
    <div className="border-t bg-background p-3">
      <div className="flex items-end gap-2 rounded-xl border bg-muted/30 px-3 py-2 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-1">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Message… (Shift+Enter for new line)"
          rows={1}
          maxLength={MAX_CHARS}
          disabled={disabled || isStreaming}
          className="flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:opacity-50 max-h-[200px]"
        />
        <div className="flex shrink-0 items-center gap-1">
          {nearLimit && (
            <span className={cn("text-[10px]", remaining < 100 ? "text-destructive" : "text-muted-foreground")}>
              {remaining.toLocaleString()}
            </span>
          )}
          {sttEnabled && (
            <VoiceRecorder
              onTranscript={(t) => onChange(value ? `${value} ${t}` : t)}
              accessToken={accessToken}
              disabled={isStreaming}
            />
          )}
          {onVoiceMode && sttEnabled && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={onVoiceMode}
              title="Voice mode"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
          )}
          {isStreaming ? (
            <Button
              size="icon"
              variant="destructive"
              className="h-8 w-8 rounded-lg"
              onClick={onStop}
              title="Stop generation"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={onSend}
              disabled={!value.trim() || disabled}
              title="Send (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
