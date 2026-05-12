"use client";

import { useEffect, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const SPEEDS = [0.75, 1, 1.25, 1.5] as const;
type Speed = (typeof SPEEDS)[number];

interface AudioPlayerProps {
  src: string;
  autoPlay?: boolean;
  className?: string;
}

export function AudioPlayer({ src, autoPlay = false, className }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [progress, setProgress] = useState(0); // 0–1
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (autoPlay && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }, [autoPlay, src]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) el.pause();
    else el.play().catch(() => {});
  }

  function cycleSpeed() {
    const idx = SPEEDS.indexOf(speed);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  }

  function handleSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const el = audioRef.current;
    if (!el || !duration) return;
    const t = (parseFloat(e.target.value) / 100) * duration;
    el.currentTime = t;
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  }

  return (
    <div className={cn("flex items-center gap-2 rounded-xl border bg-muted/40 px-3 py-2 text-xs", className)}>
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onLoadedMetadata={(e) => setDuration((e.target as HTMLAudioElement).duration)}
        onTimeUpdate={(e) => {
          const el = e.target as HTMLAudioElement;
          setCurrentTime(el.currentTime);
          setProgress(duration ? (el.currentTime / duration) * 100 : 0);
        }}
      />

      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={togglePlay}>
        {playing
          ? <Pause className="h-3.5 w-3.5 fill-current" />
          : <Play className="h-3.5 w-3.5 fill-current" />}
      </Button>

      <input
        type="range"
        min={0}
        max={100}
        value={progress}
        onChange={handleSeek}
        className="h-1 flex-1 accent-primary cursor-pointer"
      />

      <span className="w-16 text-right tabular-nums text-muted-foreground">
        {fmt(currentTime)} / {fmt(duration)}
      </span>

      <button
        onClick={cycleSpeed}
        className="w-9 rounded px-1 py-0.5 text-[10px] font-medium hover:bg-accent transition-colors"
      >
        {speed}x
      </button>
    </div>
  );
}
