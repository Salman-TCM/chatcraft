import { NextResponse } from "next/server";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function GET(): Promise<NextResponse> {
  const backendStatus = await checkBackend();

  const allHealthy = backendStatus.status === "healthy";

  return NextResponse.json(
    {
      status: allHealthy ? "healthy" : "degraded",
      service: "chatcraft-frontend",
      version: "0.1.0",
      dependencies: {
        backend: backendStatus,
      },
    },
    { status: allHealthy ? 200 : 503 }
  );
}

async function checkBackend(): Promise<{ status: string; latency_ms?: number; error?: string }> {
  const start = performance.now();
  try {
    const res = await fetch(`${API_URL}/health/live`, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    const latency_ms = Math.round(performance.now() - start);
    return res.ok
      ? { status: "healthy", latency_ms }
      : { status: "unhealthy", latency_ms, error: `HTTP ${res.status}` };
  } catch (err) {
    return { status: "unhealthy", error: err instanceof Error ? err.message : "unreachable" };
  }
}
