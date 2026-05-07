"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/store";
import type { UserRole } from "@chatcraft/shared";

export function SessionSync() {
  const { data: session, status } = useSession();
  const setUser = useAppStore((s) => s.setUser);
  const clearAuth = useAppStore((s) => s.clearAuth);

  useEffect(() => {
    if (status === "loading") return;

    if (status === "authenticated" && session?.user) {
      setUser({
        id: session.user.id,
        email: session.user.email ?? "",
        name: session.user.name ?? null,
        role: session.user.role as UserRole,
        avatarUrl: session.user.image ?? null,
        accessToken: session.user.accessToken,
      });
    } else {
      clearAuth();
    }
  }, [session, status, setUser, clearAuth]);

  return null;
}
