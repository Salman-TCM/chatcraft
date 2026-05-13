"use client";

import { useEffect, useState } from "react";
import {
  Users, Bot, DollarSign, MessageSquare, TrendingUp,
  TrendingDown, CreditCard, Zap, AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Stats {
  users: {
    total: number;
    paying: number;
    by_role: Record<string, number>;
    new_today: number;
    new_yesterday: number;
  };
  subscriptions: { active: number; past_due: number };
  revenue: { mrr_cents: number };
  ai: { cost_usd_this_month: string };
  platform: { chatbot_count: number; messages_today: number; messages_this_month: number };
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [signups, setSignups] = useState<{ date: string; count: number }[]>([]);
  const [revenue, setRevenue] = useState<{ date: string; amount_cents: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get("/api/admin/stats"),
      apiClient.get("/api/admin/signups-per-day"),
      apiClient.get("/api/admin/revenue-per-day"),
    ]).then(([s, sg, rv]) => {
      setStats(s.data.data);
      setSignups(sg.data.data);
      setRevenue(rv.data.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading stats…</div>;
  }

  if (!stats) return null;

  const signupTrend = stats.users.new_today - stats.users.new_yesterday;
  const mrrFormatted = `$${(stats.revenue.mrr_cents / 100).toFixed(2)}`;

  const roleOrder = ["admin", "creator", "premium", "trial", "free"];
  const roleColors: Record<string, string> = {
    admin: "#ef4444",
    creator: "#8b5cf6",
    premium: "#6366f1",
    trial: "#f59e0b",
    free: "#94a3b8",
  };

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Platform Overview</h1>
        <p className="text-sm text-muted-foreground">Real-time health of ChatCraft AI</p>
      </div>

      {/* Past-due alert */}
      {stats.subscriptions.past_due > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span><strong>{stats.subscriptions.past_due}</strong> subscription{stats.subscriptions.past_due > 1 ? "s" : ""} past due — check Stripe.</span>
        </div>
      )}

      {/* KPI grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Users className="h-5 w-5 text-indigo-500" />}
          label="Total Users"
          value={fmt(stats.users.total)}
          sub={`${stats.users.paying} paying`}
        />
        <KpiCard
          icon={<DollarSign className="h-5 w-5 text-emerald-500" />}
          label="Revenue (MTD)"
          value={mrrFormatted}
          sub={`${stats.subscriptions.active} active subs`}
        />
        <KpiCard
          icon={<Bot className="h-5 w-5 text-violet-500" />}
          label="Chatbots"
          value={fmt(stats.platform.chatbot_count)}
          sub={`${fmt(stats.platform.messages_today)} msgs today`}
        />
        <KpiCard
          icon={<Zap className="h-5 w-5 text-amber-500" />}
          label="AI Cost (MTD)"
          value={`$${parseFloat(stats.ai.cost_usd_this_month).toFixed(4)}`}
          sub={`${fmt(stats.platform.messages_this_month)} msgs/mo`}
        />
      </div>

      {/* New signups today */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs text-muted-foreground">New users today</p>
          <div className="mt-1 flex items-end gap-2">
            <p className="text-3xl font-semibold">{stats.users.new_today}</p>
            <div className={`mb-1 flex items-center gap-0.5 text-sm ${signupTrend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {signupTrend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
              {Math.abs(signupTrend)} vs yesterday
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <p className="text-xs text-muted-foreground">Active subscriptions</p>
          <p className="mt-1 text-3xl font-semibold">{stats.subscriptions.active}</p>
          {stats.subscriptions.past_due > 0 && (
            <p className="text-xs text-amber-600">{stats.subscriptions.past_due} past due</p>
          )}
        </Card>

        <Card className="p-5">
          <p className="text-xs text-muted-foreground mb-2">Users by role</p>
          <div className="space-y-1">
            {roleOrder.filter((r) => (stats.users.by_role[r] ?? 0) > 0).map((r) => (
              <div key={r} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full" style={{ backgroundColor: roleColors[r] }} />
                  <span className="capitalize">{r}</span>
                </div>
                <span className="font-medium">{stats.users.by_role[r] ?? 0}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold">New Signups (30d)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={signups.map((d) => ({ ...d, label: d.date.slice(5) }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="count" name="Signups" fill="#6366f1" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <p className="mb-4 text-sm font-semibold">Daily Revenue (30d)</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenue.map((d) => ({ ...d, label: d.date.slice(5), usd: d.amount_cents / 100 }))} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`$${v.toFixed(2)}`, "Revenue"]}
              />
              <Line type="monotone" dataKey="usd" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="text-xl font-semibold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </div>
    </Card>
  );
}

function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return String(n);
}
