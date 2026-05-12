"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderState = "idle" | "requesting" | "recording" | "processing" | "error";

interface UseVoiceRecorderOptions {
  silenceThresholdDb?: number;   // dB below which audio counts as silence (-50 default)
  silenceDurationMs?: number;    // ms of silence before auto-stop (1500 default)
  onTranscript?: (text: string) => void;
  onError?: (msg: string) => void;
  apiBase?: string;
  accessToken?: string | null;
}

export function useVoiceRecorder({
  silenceThresholdDb = -50,
  silenceDurationMs = 1500,
  onTranscript,
  onError,
  apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000",
  accessToken,
}: UseVoiceRecorderOptions = {}) {
  const [state, setState] = useState<RecorderState>("idle");
  const [audioLevel, setAudioLevel] = useState(0); // 0–1 for waveform animation

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const stopLevelMonitor = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    setAudioLevel(0);
  }, []);

  const startLevelMonitor = useCallback((stream: MediaStream, onSilence: () => void) => {
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Float32Array(analyser.fftSize);
    let silenceStart: number | null = null;

    const tick = () => {
      analyser.getFloatTimeDomainData(data);
      // RMS amplitude → dB
      const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
      const db = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
      // Normalise to 0–1 for visual (clamp -80…0 dB)
      setAudioLevel(Math.max(0, Math.min(1, (db + 80) / 80)));

      if (db < silenceThresholdDb) {
        if (!silenceStart) silenceStart = Date.now();
        else if (Date.now() - silenceStart > silenceDurationMs) {
          onSilence();
          return;
        }
      } else {
        silenceStart = null;
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, [silenceThresholdDb, silenceDurationMs]);

  const stop = useCallback(() => {
    stopLevelMonitor();
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close();
  }, [stopLevelMonitor]);

  const start = useCallback(async () => {
    if (state === "recording") { stop(); return; }

    setState("requesting");
    chunksRef.current = [];

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err: unknown) {
      const msg =
        (err as { name?: string })?.name === "NotAllowedError"
          ? "Microphone permission denied. Enable it in browser settings."
          : "Could not access microphone.";
      setState("error");
      onError?.(msg);
      return;
    }

    streamRef.current = stream;
    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    const recorder = new MediaRecorder(stream, { mimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      stopLevelMonitor();
      stream.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();

      if (chunksRef.current.length === 0) { setState("idle"); return; }

      setState("processing");
      const blob = new Blob(chunksRef.current, { type: mimeType });
      const formData = new FormData();
      formData.append("file", blob, "audio.webm");

      try {
        const headers: Record<string, string> = {};
        if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
        const res = await fetch(`${apiBase}/api/voice/stt`, {
          method: "POST",
          headers,
          body: formData,
        });
        if (!res.ok) throw new Error(`STT error ${res.status}`);
        const json = await res.json();
        onTranscript?.(json.transcript ?? "");
      } catch (err) {
        onError?.("Transcription failed. Please try again.");
      } finally {
        setState("idle");
      }
    };

    recorder.start(250); // collect in 250ms chunks
    setState("recording");
    startLevelMonitor(stream, () => recorder.stop());
  }, [state, stop, stopLevelMonitor, startLevelMonitor, onTranscript, onError, apiBase, accessToken]);

  // Cleanup on unmount
  useEffect(() => () => stop(), [stop]);

  return { state, audioLevel, start, stop };
}
