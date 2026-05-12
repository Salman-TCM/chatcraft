"use client";

import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Bot,
  MessageSquare,
  Users,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Overview {
  conversations_this_month: number;
  messages_this_month: number;
  unique_users_this_month: number;
  cost_usd_this_month: string;
  chatbot_count: number;
}

interface DayPoint {
  date: string;
  count: number;
}

interface ModelPoint {
  model: string;
  tokens: number;
  cost_usd: string;
  requests: number;
}

interface Satisfaction {
  thumbs_up: number;
  thumbs_down: number;
  satisfaction_rate: number | null;
}

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444"];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [msgPerDay, setMsgPerDay] = useState<DayPoint[]>([]);
  const [modelBreakdown, setModelBreakdown] = useState<ModelPoint[]>([]);
  const [satisfaction, setSatisfaction] = useState<Satisfaction | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get("/api/analytics/overview"),
      apiClient.get("/api/analytics/messages-per-day"),
      apiClient.get("/api/analytics/model-breakdown"),
      apiClient.get("/api/analytics/satisfaction"),
    ]).then(([ov, mpd, mb, sat]) => {
      setOverview(ov.data.data);
      setMsgPerDay(mpd.data.data);
      setModelBreakdown(mb.data.data);
      setSatisfaction(sat.data.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading dashboard…</p>
      </div>
    );
  }

  const satisfactionTotal = (satisfaction?.thumbs_up ?? 0) + (satisfaction?.thumbs_down ?? 0);
  const pieData = satisfaction && satisfactionTotal > 0 ? [
    { name: "Positive", value: satisfaction.thumbs_up },
    { name: "Negative", value: satisfaction.thumbs_down },
  ] : [];

  // Shorten day labels to MM-DD
  const chartDays = msgPerDay.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">This month's overview</p>
      </div>

      {/* ── KPI Cards ─────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Bot className="h-5 w-5 text-indigo-500" />}
          label="Active Chatbots"
          value={String(overview?.chatbot_count ?? 0)}
        />
        <KpiCard
          icon={<MessageSquare className="h-5 w-5 text-violet-500" />}
          label="Messages"
          value={fmt(overview?.messages_this_month ?? 0)}
        />
        <KpiCard
          icon={<Users className="h-5 w-5 text-cyan-500" />}
          label="Unique Users"
          value={fmt(overview?.unique_users_this_month ?? 0)}
        />
        <KpiCard
          icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
          label="AI Cost"
          value={`$${parseFloat(overview?.cost_usd_this_month ?? "0").toFixed(4)}`}
        />
      </div>

      {/* ── Messages per day ──────────────────────────────────────────── */}
      <Card className="p-5">
        <p className="mb-4 text-sm font-semibold">Messages per Day (30d)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartDays} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
            />
            <Bar dataKey="count" name="Messages" fill="#6366f1" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── Model breakdown + Satisfaction side by side ────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Model usage */}
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold">Model Usage (this month)</p>
          {modelBreakdown.length === 0 ? (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={modelBreakdown}
                  dataKey="tokens"
                  nameKey="model"
                  cx="50%"
                  cy="50%"
                  outerRadius={75}
                  label={({ model, percent }) => `${shortModel(model)} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {modelBreakdown.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number) => [fmt(v) + " tokens"]}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Satisfaction */}
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold">User Satisfaction</p>
          {satisfactionTotal === 0 ? (
            <p className="text-sm text-muted-foreground">No feedback yet.</p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={65}>
                    <Cell fill="#10b981" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-1.5 text-emerald-600">
                  <ThumbsUp className="h-4 w-4" />
                  <span className="font-semibold">{satisfaction!.thumbs_up}</span>
                </div>
                <div className="flex items-center gap-1.5 text-red-500">
                  <ThumbsDown className="h-4 w-4" />
                  <span className="font-semibold">{satisfaction!.thumbs_down}</span>
                </div>
                {satisfaction!.satisfaction_rate !== null && (
                  <span className="text-muted-foreground">
                    {satisfaction!.satisfaction_rate}% positive
                  </span>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
      </div>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}

function shortModel(model: string): string {
  return model.split("-").slice(0, 2).join("-");
}
