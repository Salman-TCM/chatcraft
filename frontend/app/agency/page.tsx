"use client";

import { useEffect, useState } from "react";
import { Users, MessageSquare, DollarSign, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

interface AgencyStats {
  total_clients: number;
  active_subs: number;
  mrr: number;
}

export default function AgencyDashboardPage() {
  const [agency, setAgency] = useState<any>(null);
  const [stats, setStats] = useState<AgencyStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      apiClient.get("/api/v1/agency/me").then(r => setAgency(r.data.data)),
      apiClient.get("/api/v1/agency/subscriptions").then(r => {
        const subs = r.data.data ?? [];
        const active = subs.filter((s: any) => s.status === "active");
        setStats({
          total_clients: subs.length,
          active_subs: active.length,
          mrr: active.reduce((sum: number, s: any) => sum + (s.amount || 0), 0),
        });
      }),
    ]).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!agency) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">No agency found for your account.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          {agency.slug} <span className="text-muted-foreground font-normal text-base">Agency</span>
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Plan: {agency.plan}</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard icon={Users} label="Total Clients" value={stats?.total_clients ?? 0} />
        <StatCard icon={MessageSquare} label="Active Subscriptions" value={stats?.active_subs ?? 0} />
        <StatCard icon={DollarSign} label="MRR" value={`$${((stats?.mrr ?? 0) / 100).toFixed(2)}`} />
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        <Icon className="h-4 w-4" />
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </Card>
  );
}
