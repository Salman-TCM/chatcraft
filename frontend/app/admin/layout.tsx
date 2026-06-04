"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Users, Bot, CreditCard, LogOut,
  ShieldAlert, Menu, X, Building2, ScrollText, Settings,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";

const NAV = [
  { href: "/admin",                   label: "Overview",  icon: LayoutDashboard },
  { href: "/admin/users",             label: "Users",     icon: Users },
  { href: "/admin/chatbots",          label: "Chatbots",  icon: Bot },
  { href: "/admin/payments",          label: "Payments",  icon: CreditCard },
  { href: "/admin/agencies",          label: "Agencies",  icon: Building2 },
  { href: "/admin/action-log",        label: "Action Log",    icon: ScrollText },
  { href: "/admin/impersonation-log", label: "Impersonation", icon: ShieldAlert },
  { href: "/admin/settings",          label: "Settings",      icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Guard: redirect non-admins out immediately
  useEffect(() => {
    if (status === "loading") return;
    const role = (session?.user as any)?.role;
    if (!session || role !== "admin") {
      router.replace("/dashboard");
    }
  }, [session, status, router]);

  function isActive(href: string) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
        Verifying access…
      </div>
    );
  }

  const Sidebar = () => (
    <div className="flex h-full w-56 flex-col border-r bg-background">
      {/* Logo */}
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-600 text-white text-xs font-bold">
          A
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">ChatCraft AI</p>
          <p className="text-[10px] text-rose-600 font-semibold uppercase tracking-wide">Admin</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 p-2">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive(href)
                ? "bg-rose-600 text-white"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t p-2 space-y-1">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          Back to Dashboard
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-50 flex">
            <Sidebar />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="flex h-14 items-center gap-3 border-b px-4 md:hidden">
          <button className="rounded-md p-1.5 hover:bg-muted" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <ShieldAlert className="h-4 w-4 text-rose-600" />
          <span className="text-sm font-semibold">Admin Panel</span>
        </div>

        {/* Alert bar */}
        <div className="flex items-center gap-2 border-b bg-rose-50 px-6 py-1.5 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-400">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          You are in the superadmin panel. Actions here affect all users and data.
        </div>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
