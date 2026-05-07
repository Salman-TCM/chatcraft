"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function BillingSuccessPage() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const { update } = useSession();
  const router = useRouter();
  const [countdown, setCountdown] = useState(5);
  const refreshed = useRef(false);

  // Refresh the NextAuth session so the new role is reflected immediately
  useEffect(() => {
    if (refreshed.current) return;
    refreshed.current = true;
    update();
  }, [update]);

  // Auto-redirect to dashboard after 5 s
  useEffect(() => {
    if (countdown <= 0) {
      router.push("/dashboard");
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-3 pb-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-8 w-8 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
          </div>
          <CardTitle className="text-2xl font-bold">Payment successful!</CardTitle>
          <CardDescription>
            Welcome to ChatCraft AI Pro. Your account has been upgraded and all
            Pro features are now unlocked.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-3 text-sm text-muted-foreground">
          {sessionId && (
            <p>
              Reference:{" "}
              <span className="font-mono text-xs text-foreground">{sessionId}</span>
            </p>
          )}
          <p>Redirecting to your dashboard in {countdown}s…</p>
        </CardContent>

        <CardFooter className="flex gap-3 justify-center">
          <Link href="/dashboard">
            <Button>Go to dashboard</Button>
          </Link>
          <Link href="/billing">
            <Button variant="outline">Manage billing</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
