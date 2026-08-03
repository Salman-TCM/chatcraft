"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { APP_NAME } from "@/lib/constants";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ROLE_LABELS: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "text-muted-foreground" },
  trial: { label: "Trial", color: "text-blue-600" },
  premium: { label: "Pro", color: "text-green-600" },
  creator: { label: "Creator", color: "text-purple-600" },
  admin: { label: "Admin", color: "text-orange-600" },
};

export default function BillingPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const role = session?.user?.role ?? "free";
  const roleInfo = ROLE_LABELS[role] ?? ROLE_LABELS.free;

  async function openPortal() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/billing/portal`, {
        headers: { Authorization: `Bearer ${session?.user?.accessToken}` },
      });
      const body = await res.json();
      if (res.ok && body.data?.portal_url) {
        window.location.href = body.data.portal_url;
      } else {
        setError(body.detail?.error ?? "Could not open billing portal.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12 space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Billing</h1>
        <p className="text-muted-foreground mt-1">
          Manage your subscription and payment details.
        </p>
      </div>

      {/* Current plan */}
      <Card>
        <CardHeader>
          <CardTitle>Current plan</CardTitle>
          <CardDescription>Your active {APP_NAME} subscription.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Plan</p>
              <p className={`text-lg font-semibold ${roleInfo.color}`}>
                {roleInfo.label}
              </p>
            </div>
            {role === "free" && (
              <Link href="/pricing">
                <Button size="sm">Upgrade to Pro</Button>
              </Link>
            )}
          </div>

          <Separator />

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Account</p>
              <p className="font-medium truncate">{session?.user?.email}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="font-medium capitalize">
                {role === "free" ? "No active subscription" : "Active"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stripe portal */}
      {role !== "free" && (
        <Card>
          <CardHeader>
            <CardTitle>Payment & invoices</CardTitle>
            <CardDescription>
              Update your payment method, download invoices, or cancel your
              subscription via the Stripe customer portal.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button onClick={openPortal} disabled={loading}>
              {loading ? "Opening portal…" : "Open billing portal"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Creator payouts */}
      {(role === "creator" || role === "admin") && (
        <Card>
          <CardHeader>
            <CardTitle>Creator payouts</CardTitle>
            <CardDescription>
              Connect your bank account to receive payouts via Stripe Connect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/billing/connect">
              <Button variant="outline">Manage payouts</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
