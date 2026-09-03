"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Users, Settings, Globe, Mail, Menu, X, LogOut, CreditCard, UserCheck, Tag,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";

const NAV = [
  { href: "/agency",                    label: "Dashboard",  icon: LayoutDashboard },
  { href: "/agency/clients",            label: "Clients",    icon: Users },
  { href: "/agency/subscriptions",      label: "Revenue",    icon: CreditCard },
  { href: "/agency/team",               label: "Team",       icon: UserCheck },
  { href: "/agency/settings/branding",  label: "Branding",   icon: Settings },
  { href: "/agency/settings/pricing",   label: "Pricing",    icon: Tag },
  { href: "/agency/settings/domain",    label: "Domain",     icon: Globe },
  { href: "/agency/settings/email",     label: "Email",      icon: Mail },
];

export default function AgencyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === "loading") return;
    if (!session) router.replace("/login");
  }, [session, status, router]);

  if (status === "loading" || !session) return null;

  return (
    <div className="flex h-screen bg-muted/30">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-56 bg-background border-r flex flex-col transition-transform md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b">
          <span className="font-bold text-sm">Agency Portal</span>
          <button className="inline-flex items-center justify-center md:hidden" onClick={() => setMobileOpen(false)}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                pathname === href || pathname.startsWith(href + "/")
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t">
          <button
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground w-full px-3 py-2 rounded-md hover:bg-muted transition-colors"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="h-3.5 w-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col md:ml-56 min-w-0">
        <header className="h-14 border-b bg-background flex items-center px-4 md:hidden">
          <button className="inline-flex items-center justify-center" onClick={() => setMobileOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
        </header>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
