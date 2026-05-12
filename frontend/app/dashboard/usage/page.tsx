"use client";

import { useEffect, useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Mic, MessageSquare, Zap, Database, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api";
import { useAppStore } from "@/store";

// ── Types ─────────────────────────────────────────────────────────────────────

interface UsageSummary {
  period: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  tts_chars: number;
  stt_secs: number;
  embedding_tokens: number;
  cost_usd: string;
  requests: number;
}

interface HistoryPoint {
  date: string;
  tokens: number;
  tts_chars: number;
  cost_usd: string;
  requests: number;
}

interface CostBreakdown {
  by_model: { model: string; tokens: number; cost_usd: string; requests: number }[];
  services: {
    llm_cost_usd: string;
    tts_chars: number;
    stt_secs: number;
    embedding_tokens: number;
  };
}

// Free-tier caps (mirrors backend defaults; shown as reference)
const FREE_MESSAGE_CAP = 50;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const user = useAppStore((s) => s.user);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [cost, setCost] = useState<CostBreakdown | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get("/api/usage/summary"),
      apiClient.get("/api/usage/history"),
      apiClient.get("/api/usage/cost"),
    ]).then(([s, h, c]) => {
      setSummary(s.data.data);
      setHistory(h.data.data);
      setCost(c.data.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading usage…</p>
      </div>
    );
  }

  const totalTokens = summary?.total_tokens ?? 0;
  const chartDays = history.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {summary?.period ?? "—"} · All numbers reset on the 1st of each month
        </p>
      </div>

      {/* ── Summary cards ─────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <UsageCard
          icon={<MessageSquare className="h-5 w-5 text-indigo-500" />}
          label="LLM Tokens"
          value={fmt(totalTokens)}
          sub={`${fmt(summary?.input_tokens ?? 0)} in · ${fmt(summary?.output_tokens ?? 0)} out`}
        />
        <UsageCard
          icon={<Mic className="h-5 w-5 text-violet-500" />}
          label="TTS Characters"
          value={fmt(summary?.tts_chars ?? 0)}
          sub={`${((summary?.stt_secs ?? 0)).toFixed(1)}s STT`}
        />
        <UsageCard
          icon={<Database className="h-5 w-5 text-cyan-500" />}
          label="Embedding Tokens"
          value={fmt(summary?.embedding_tokens ?? 0)}
        />
        <UsageCard
          icon={<TrendingUp className="h-5 w-5 text-emerald-500" />}
          label="Total Cost"
          value={`$${parseFloat(summary?.cost_usd ?? "0").toFixed(4)}`}
          sub={`${fmt(summary?.requests ?? 0)} requests`}
        />
      </div>

      {/* ── 30-day token history ───────────────────────────────────────── */}
      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold">Token Usage — Last 30 Days</p>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartDays} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="tokenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmt(v)} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              formatter={(v: number) => [fmt(v), "Tokens"]}
            />
            <Area type="monotone" dataKey="tokens" stroke="#6366f1" fill="url(#tokenGrad)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Cost by model ─────────────────────────────────────────────── */}
      {(cost?.by_model?.length ?? 0) > 0 && (
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold">Cost by Model (this month)</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Model</th>
                  <th className="pb-2 font-medium text-right">Tokens</th>
                  <th className="pb-2 font-medium text-right">Requests</th>
                  <th className="pb-2 font-medium text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {cost!.by_model.map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-mono text-xs">{row.model}</td>
                    <td className="py-2 text-right text-muted-foreground">{fmt(row.tokens)}</td>
                    <td className="py-2 text-right text-muted-foreground">{fmt(row.requests)}</td>
                    <td className="py-2 text-right font-semibold">${parseFloat(row.cost_usd).toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── Upgrade CTA ───────────────────────────────────────────────── */}
      {user?.role === "free" && (
        <Card className="border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-800 dark:bg-indigo-950">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-indigo-900 dark:text-indigo-100">Unlock unlimited usage</p>
              <p className="mt-0.5 text-sm text-indigo-700 dark:text-indigo-300">
                Upgrade to a paid plan for higher message caps, voice features, and advanced analytics.
              </p>
            </div>
            <a
              href="/pricing"
              className="inline-flex h-9 shrink-0 items-center rounded-lg bg-indigo-600 px-4 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              View Plans
            </a>
          </div>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UsageCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="flex items-start gap-4 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
