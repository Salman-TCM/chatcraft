"use client";

import { useEffect, useState } from "react";
import { CreditCard, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiClient } from "@/lib/api";

interface AdminPayment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  stripe_payment_intent_id: string | null;
  created_at: string;
  user: { id: string; email: string } | null;
}

const STATUS_COLORS: Record<string, string> = {
  succeeded: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
  canceled: "bg-slate-100 text-slate-500",
  past_due: "bg-amber-100 text-amber-700",
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<AdminPayment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const LIMIT = 50;

  async function load(p: number) {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/admin/payments?page=${p}&limit=${LIMIT}`);
      setPayments(prev => p === 1 ? res.data.data : [...prev, ...res.data.data]);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(1); }, []);

  const totalRevenue = payments
    .filter((p) => p.status === "succeeded")
    .reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payments</h1>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} transactions · ${(totalRevenue / 100).toFixed(2)} loaded
          </p>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">User</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Stripe PI</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground"></th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-xs font-medium">{p.user?.email ?? "—"}</p>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {p.currency.toUpperCase()} {(p.amount / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium capitalize ${STATUS_COLORS[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground truncate max-w-[180px] block">
                      {p.stripe_payment_intent_id ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {p.stripe_payment_intent_id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => window.open(`https://dashboard.stripe.com/payments/${p.stripe_payment_intent_id}`, "_blank")}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>}
          {!loading && payments.length === 0 && (
            <div className="py-12 text-center">
              <CreditCard className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            </div>
          )}
        </div>
        {payments.length < total && !loading && (
          <div className="border-t p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => { const next = page + 1; setPage(next); load(next); }}>
              Load more ({total - payments.length} remaining)
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
