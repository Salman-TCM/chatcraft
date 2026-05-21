"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Inbox, MessageSquare, Users,
  Bot, Hash, Megaphone, Share2,
  GitBranch, Zap, List, Activity,
  ClipboardList, LayoutTemplate, ShoppingBag, Wallet,
  Mic, Monitor, Plug, Tag, BarChart2, Settings,
  ChevronDown, LogOut, Menu, X, AlertCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useAppStore } from "@/store";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { PlatformLogo } from "@/components/platform-logo";

// ─── Brand colour ─────────────────────────────────────────────────────────────
const INDIGO = "#3B52D4";

// ─── Nav structure ────────────────────────────────────────────────────────────
type NavItem = { href: string; label: string; icon: React.ElementType };

const PINNED: NavItem[] = [
  { href: "/dashboard",          label: "Overview",      icon: LayoutDashboard },
  { href: "/dashboard/inbox",    label: "Inbox",         icon: Inbox },
  { href: "/dashboard/analytics",label: "Conversations", icon: MessageSquare },
  { href: "/dashboard/contacts", label: "Contacts",      icon: Users },
];

const SECTIONS: { label: string; items: NavItem[]; defaultOpen?: boolean }[] = [
  {
    label: "Engage",
    items: [
      { href: "/dashboard/chatbots",    label: "Chatbots",   icon: Bot },
      { href: "/dashboard/keywords",    label: "Keywords",   icon: Hash },
      { href: "/dashboard/broadcast",   label: "Broadcasts", icon: Megaphone },
      { href: "/dashboard/social",      label: "Social",     icon: Share2 },
    ],
  },
  {
    label: "Automate",
    items: [
      { href: "/dashboard/flows",       label: "Flows",       icon: GitBranch },
      { href: "/dashboard/automations", label: "Automations", icon: Zap },
      { href: "/dashboard/sequences",   label: "Sequences",   icon: List },
      { href: "/dashboard/pipelines",   label: "Pipelines",   icon: Activity },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/dashboard/forms",         label: "Forms",         icon: ClipboardList },
      { href: "/dashboard/landing-pages", label: "Landing Pages", icon: LayoutTemplate },
      { href: "/dashboard/stores",        label: "Stores",        icon: ShoppingBag },
      { href: "/dashboard/wallet",        label: "Wallet",        icon: Wallet },
    ],
  },
];

const AI_TOOLS: NavItem[] = [
  { href: "/dashboard/agents",       label: "Agent Builder", icon: Bot },
  { href: "/dashboard/voice-lab",    label: "Voice Lab",     icon: Mic },
  { href: "/dashboard/browser-agent",label: "Browser Agent", icon: Monitor },
  { href: "/dashboard/settings/mcp", label: "MCP Servers",   icon: Plug },
];

const FOOTER_NAV: NavItem[] = [
  { href: "/dashboard/tags",     label: "Tags",     icon: Tag },
  { href: "/dashboard/usage",    label: "Usage",    icon: BarChart2 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const EXACT_ROUTES = new Set(["/dashboard/settings"]);
function active(pathname: string, href: string) {
  if (EXACT_ROUTES.has(href)) return pathname === href;
  return href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href);
}
function sectionHasActive(pathname: string, items: NavItem[]) {
  return items.some((i) => active(pathname, i.href));
}

// ─── Atom components ──────────────────────────────────────────────────────────
function NavLink({
  item,
  isActive,
  badge,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  badge?: number;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg py-[7px] px-2 text-xs font-medium transition-colors"
      style={isActive ? { backgroundColor: INDIGO, color: "#fff" } : undefined}
      data-inactive={!isActive || undefined}
    >
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        style={isActive ? { color: "#fff" } : undefined}
      />
      <span
        className={`flex-1 truncate ${isActive ? "text-white" : "text-foreground/70 group-hover:text-foreground"}`}
        style={isActive ? { color: "#fff" } : undefined}
      >
        {item.label}
      </span>
      {badge !== undefined && badge > 0 && (
        <span className="ml-auto flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white leading-none">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({
  label,
  open,
  onToggle,
  badge,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  badge?: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
    >
      <span className="flex items-center gap-1.5">
        {label}
        {badge}
      </span>
      <ChevronDown
        className={`h-3 w-3 transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
      />
    </button>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function SidebarContent({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate: () => void;
}) {
  const user = useAppStore((s) => s.user);
  const agencyTheme = useAppStore((s) => s.agencyTheme);
  const brandColour = agencyTheme?.primaryColour ?? INDIGO;
  const platformName = agencyTheme?.name ?? "ChatCraft AI";

  // Collapsible section state — auto-open whichever section has the active route
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      SECTIONS.map((s) => [s.label, sectionHasActive(pathname, s.items)])
    )
  );
  useEffect(() => {
    setOpenSections((prev) => {
      const next = { ...prev };
      SECTIONS.forEach((s) => {
        if (sectionHasActive(pathname, s.items)) next[s.label] = true;
      });
      return next;
    });
  }, [pathname]);

  // Inbox unread count
  const [inboxUnread, setInboxUnread] = useState(0);
  useEffect(() => {
    if (!user?.accessToken) return;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/conversations?status=active&limit=100`, {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.data) return;
        setInboxUnread(data.data.filter((c: { unread_count: number }) => c.unread_count > 0).length);
      })
      .catch(() => {});
  }, [user?.accessToken]);

  // Dismissible system-alert badge (admin only; wire to a real endpoint when ready)
  const [sysAlerts, setSysAlerts] = useState(0);
  useEffect(() => {
    if (user?.role === "admin") setSysAlerts(1);
  }, [user?.role]);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : (user?.email?.[0] ?? "?").toUpperCase();

  function toggleSection(label: string) {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside className="flex h-full w-[216px] flex-col bg-secondary border-r">

      {/* ── Brand header (max 48px) ─────────────────────────────────────────── */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3">
        {agencyTheme?.logo ? (
          <PlatformLogo logoUrl={agencyTheme.logo} platformName={platformName} height={28} />
        ) : (
          <>
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: brandColour }}
            >
              {platformName[0]}
            </div>
            <span className="text-sm font-semibold tracking-tight">{platformName}</span>
          </>
        )}
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-border">

        {/* Pinned top items */}
        <div className="space-y-0.5">
          {PINNED.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={active(pathname, item.href)}
              badge={item.href === "/dashboard/inbox" ? inboxUnread : undefined}
              onClick={onNavigate}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="my-2 border-t border-border/50" />

        {/* Collapsible sections */}
        <div className="space-y-3">
          {SECTIONS.map((section) => (
            <div key={section.label}>
              <SectionLabel
                label={section.label}
                open={!!openSections[section.label]}
                onToggle={() => toggleSection(section.label)}
              />
              {openSections[section.label] && (
                <div className="mt-0.5 space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.href}
                      item={item}
                      isActive={active(pathname, item.href)}
                      onClick={onNavigate}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* AI Tools — always expanded, "New" badge */}
          <div>
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-[10px] font-semibold uppercase tracking-[0.07em] text-muted-foreground/60">
                AI Tools
              </span>
              <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-emerald-500/15 text-emerald-600">
                New
              </span>
            </div>
            <div className="mt-0.5 space-y-0.5">
              {AI_TOOLS.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  isActive={active(pathname, item.href)}
                  onClick={onNavigate}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky footer ───────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <div className="border-t border-border/50 mx-2" />

        {/* Utility nav */}
        <div className="px-2 pt-1.5 pb-1 space-y-0.5">
          {FOOTER_NAV.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={active(pathname, item.href)}
              onClick={onNavigate}
            />
          ))}
        </div>

        <div className="border-t border-border/50 mx-2" />

        {/* User row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Avatar */}
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ backgroundColor: brandColour }}
          >
            {initials}
          </div>
          {/* Name / role */}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-tight truncate">
              {user?.name ?? user?.email ?? "—"}
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground capitalize truncate">
              {user?.role ?? "free"}
            </p>
          </div>
          {/* System-alert badge */}
          {sysAlerts > 0 && (
            <button
              title="System alerts — click to dismiss"
              onClick={() => setSysAlerts(0)}
              className="flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold text-white bg-red-500 hover:bg-red-600 transition-colors shrink-0"
            >
              <AlertCircle className="h-2.5 w-2.5" />
              {sysAlerts}
            </button>
          )}
          {/* Sign out */}
          <button
            title="Sign out"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const agencyTheme = useAppStore((s) => s.agencyTheme);
  const brandColour = agencyTheme?.primaryColour ?? INDIGO;
  const platformName = agencyTheme?.name ?? "ChatCraft AI";

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ImpersonationBanner />

      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <SidebarContent pathname={pathname} onNavigate={() => {}} />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 h-full">
            <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile topbar */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b bg-secondary px-4 md:hidden">
          <button
            className="rounded-md p-1.5 hover:bg-muted transition-colors"
            onClick={() => setMobileOpen((o) => !o)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2">
            {agencyTheme?.logo ? (
              <PlatformLogo logoUrl={agencyTheme.logo} platformName={platformName} height={24} />
            ) : (
              <>
                <div
                  className="flex h-6 w-6 items-center justify-center rounded text-xs font-bold text-white"
                  style={{ backgroundColor: brandColour }}
                >
                  {platformName[0]}
                </div>
                <span className="text-sm font-semibold">{platformName}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
