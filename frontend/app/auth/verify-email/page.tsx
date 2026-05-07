"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Status = "loading" | "success" | "error" | "missing";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<Status>(token ? "loading" : "missing");
  const called = useRef(false);

  useEffect(() => {
    if (!token || called.current) return;
    called.current = true;

    fetch(`${API_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((res) => setStatus(res.ok ? "success" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md text-center">
        {status === "loading" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Verifying…</CardTitle>
              <CardDescription>Please wait while we verify your email.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center py-4">
                <span className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-foreground" />
              </div>
            </CardContent>
          </>
        )}

        {status === "success" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Email verified</CardTitle>
              <CardDescription>
                Your email has been confirmed. You can now sign in.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center">
              <Link href="/login">
                <Button>Sign in</Button>
              </Link>
            </CardFooter>
          </>
        )}

        {status === "error" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Verification failed</CardTitle>
              <CardDescription>
                This link is invalid or has already been used. Request a new
                verification email by signing in.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center">
              <Link href="/login">
                <Button variant="outline">Go to sign in</Button>
              </Link>
            </CardFooter>
          </>
        )}

        {status === "missing" && (
          <>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">No token found</CardTitle>
              <CardDescription>
                Use the link sent to your email to verify your account.
              </CardDescription>
            </CardHeader>
            <CardFooter className="justify-center">
              <Link href="/login">
                <Button variant="outline">Go to sign in</Button>
              </Link>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  );
}
