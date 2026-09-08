"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard, Inbox, MessageSquare, Users,
  Bot, Hash, Megaphone, Share2,
  GitBranch, Zap, List, Activity,
  ClipboardList, LayoutTemplate, ShoppingBag, Wallet,
  Mic, Monitor, Plug, Tag, BarChart2, Settings,
  ChevronDown, LogOut, Menu, X, AlertCircle, ShieldAlert,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { Logo } from "@/components/branding/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { hasFeatureAccess, type FeatureKey } from "@/lib/features";
import { EASE_OUT, fadeIn } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

// ─── Nav structure ────────────────────────────────────────────────────────────
type NavItem = { href: string; label: string; icon: React.ElementType; feature?: FeatureKey };

const PINNED: NavItem[] = [
  { href: "/dashboard",           label: "Overview",      icon: LayoutDashboard },
  { href: "/dashboard/inbox",     label: "Inbox",         icon: Inbox,         feature: "inbox" },
  { href: "/dashboard/analytics", label: "Conversations", icon: MessageSquare, feature: "analytics" },
  { href: "/dashboard/contacts",  label: "Contacts",      icon: Users,         feature: "contacts" },
];

const SECTIONS: { label: string; items: NavItem[]; defaultOpen?: boolean }[] = [
  {
    label: "Engage",
    items: [
      { href: "/dashboard/chatbots",  label: "Chatbots",   icon: Bot,      feature: "chatbots" },
      { href: "/dashboard/keywords",  label: "Keywords",   icon: Hash,     feature: "keywords" },
      { href: "/dashboard/broadcast", label: "Broadcasts", icon: Megaphone, feature: "campaigns" },
      { href: "/dashboard/social",    label: "Social",     icon: Share2,   feature: "social" },
    ],
  },
  {
    label: "Automate",
    items: [
      { href: "/dashboard/flows",       label: "Flows",       icon: GitBranch, feature: "flows" },
      { href: "/dashboard/automations", label: "Automations", icon: Zap,       feature: "automations" },
      { href: "/dashboard/sequences",   label: "Sequences",   icon: List,      feature: "sequences" },
      { href: "/dashboard/pipelines",   label: "Pipelines",   icon: Activity,  feature: "pipelines" },
    ],
  },
  {
    label: "Build",
    items: [
      { href: "/dashboard/forms",         label: "Forms",         icon: ClipboardList, feature: "forms" },
      { href: "/dashboard/landing-pages", label: "Landing Pages", icon: LayoutTemplate, feature: "landing_pages" },
      { href: "/dashboard/stores",        label: "Stores",        icon: ShoppingBag,   feature: "stores" },
      { href: "/dashboard/wallet",        label: "Wallet",        icon: Wallet,        feature: "wallet" },
    ],
  },
];

const AI_TOOLS: NavItem[] = [
  { href: "/dashboard/agents",        label: "Agent Builder", icon: Bot,     feature: "agent_builder" },
  { href: "/dashboard/voice-lab",     label: "Voice Lab",     icon: Mic,     feature: "voice_lab" },
  { href: "/dashboard/browser-agent", label: "Browser Agent", icon: Monitor, feature: "browser_agent" },
  { href: "/dashboard/settings/mcp",  label: "MCP Servers",   icon: Plug,    feature: "mcp_servers" },
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
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  badge?: number;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  const Icon = item.icon;

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={item.href}
            onClick={onClick}
            className={cn(
              "relative flex h-8 w-8 items-center justify-center rounded-lg mx-auto transition-colors",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {badge !== undefined && badge > 0 && (
              <span className="absolute -top-1 -right-1 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-semibold text-white leading-none">
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </Link>
        </TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg py-[7px] px-2 text-xs font-medium transition-colors",
        isActive
          ? "bg-primary text-primary-foreground"
          : "text-foreground/70 hover:bg-accent hover:text-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
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
  collapsed,
  onToggleCollapse,
}: {
  pathname: string;
  onNavigate: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const user = useAppStore((s) => s.user);
  const agencyTheme = useAppStore((s) => s.agencyTheme);
  const platformName = agencyTheme?.name ?? APP_NAME;

  const canSee = (item: NavItem) =>
    !item.feature || hasFeatureAccess(user?.role, user?.allowedFeatures ?? null, item.feature);

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

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  // Dismissible system-alert badge (admin only; wire to a real endpoint when ready)
  const [sysAlerts, setSysAlerts] = useState(0);
  useEffect(() => {
    if (isAdmin) setSysAlerts(1);
  }, [isAdmin]);

  const initials = user?.name
    ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : (user?.email?.[0] ?? "?").toUpperCase();

  function toggleSection(label: string) {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  }

  const allNavItems = [
    ...PINNED,
    ...SECTIONS.flatMap((s) => s.items),
    ...AI_TOOLS,
    ...FOOTER_NAV,
  ].filter(canSee);

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 flex-col bg-secondary border-r transition-all duration-200">
        {/* Brand mark */}
        <div className="flex h-12 shrink-0 items-center justify-center">
          <Logo logoUrl={agencyTheme?.logo} name={platformName} size="sm" iconOnly />
        </div>

        {/* Expand button */}
        <button
          title="Expand sidebar"
          onClick={onToggleCollapse}
          className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>

        {/* Scrollable icon-only nav */}
        <div className="flex-1 overflow-y-auto py-1 space-y-1 [&::-webkit-scrollbar]:w-0">
          {allNavItems.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              isActive={active(pathname, item.href)}
              badge={item.href === "/dashboard/inbox" ? inboxUnread : undefined}
              onClick={onNavigate}
              collapsed
            />
          ))}
        </div>

        {/* Footer: avatar + sign-out */}
        <div className="shrink-0 pb-2 space-y-1 border-t border-border/50 pt-2">
          {isAdmin && (
            <Link href="/admin" title="Admin Panel"
              className="flex h-8 w-8 mx-auto items-center justify-center rounded-lg text-rose-600 hover:bg-rose-50 transition-colors">
              <ShieldAlert className="h-4 w-4" />
            </Link>
          )}
          <Avatar className="h-8 w-8 mx-auto" title={user?.name ?? user?.email ?? ""}>
            <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <ThemeToggle className="h-8 w-8 mx-auto text-muted-foreground hover:text-foreground" />
          <button title="Sign out" onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex h-8 w-8 mx-auto items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[216px] flex-col bg-secondary border-r transition-all duration-200">

      {/* ── Brand header ─────────────────────────────────────────────────────── */}
      <div className="flex h-12 shrink-0 items-center gap-2.5 px-3">
        <Logo logoUrl={agencyTheme?.logo} name={platformName} size="md" className="flex-1 min-w-0" />
        {/* Collapse button */}
        <button
          title="Collapse sidebar"
          onClick={onToggleCollapse}
          className="inline-flex items-center justify-center shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-auto"
        >
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-2 pt-1 pb-2 [&::-webkit-scrollbar]:w-[3px] [&::-webkit-scrollbar-thumb]:rounded [&::-webkit-scrollbar-thumb]:bg-border">

        {/* Pinned top items */}
        <div className="space-y-0.5">
          {PINNED.filter(canSee).map((item) => (
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
          {SECTIONS.map((section) => {
            const visibleItems = section.items.filter(canSee);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.label}>
                <SectionLabel
                  label={section.label}
                  open={!!openSections[section.label]}
                  onToggle={() => toggleSection(section.label)}
                />
                {openSections[section.label] && (
                  <div className="mt-0.5 space-y-0.5">
                    {visibleItems.map((item) => (
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
            );
          })}

          {/* AI Tools — only show section if at least one item is visible */}
          {AI_TOOLS.filter(canSee).length > 0 && (
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
                {AI_TOOLS.filter(canSee).map((item) => (
                  <NavLink
                    key={item.href}
                    item={item}
                    isActive={active(pathname, item.href)}
                    onClick={onNavigate}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky footer ───────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <div className="border-t border-border/50 mx-2" />

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

        {isAdmin && (
          <div className="px-2 pt-1.5 pb-1">
            <Link
              href="/admin"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 transition-colors w-full"
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
              Admin Panel
            </Link>
          </div>
        )}

        <div className="border-t border-border/50 mx-2" />

        {/* User row */}
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Avatar className="h-7 w-7 shrink-0">
            <AvatarFallback className="bg-primary text-[11px] font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium leading-tight truncate">
              {user?.name ?? user?.email ?? "—"}
            </p>
            <p className="text-[10px] leading-tight text-muted-foreground capitalize truncate">
              {user?.role ?? "free"}
            </p>
          </div>
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
          <ThemeToggle className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground" />
          <button
            title="Sign out"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="inline-flex items-center justify-center shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
  const [mobileOpen,    setMobileOpen]    = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const agencyTheme = useAppStore((s) => s.agencyTheme);
  const platformName = agencyTheme?.name ?? APP_NAME;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-screen overflow-hidden bg-background">
        <ImpersonationBanner />

        {/* Desktop sidebar */}
        <div className="hidden md:flex shrink-0">
          <SidebarContent
            pathname={pathname}
            onNavigate={() => {}}
            collapsed={sideCollapsed}
            onToggleCollapse={() => setSideCollapsed((c) => !c)}
          />
        </div>

        {/* Mobile overlay */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              className="fixed inset-0 z-40 md:hidden"
              initial="hidden"
              animate="show"
              exit="hidden"
              variants={fadeIn}
            >
              <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={() => setMobileOpen(false)}
              />
              <motion.div
                className="relative z-50 h-full"
                initial={{ x: -24, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -24, opacity: 0 }}
                transition={{ duration: 0.2, ease: EASE_OUT }}
              >
                <SidebarContent pathname={pathname} onNavigate={() => setMobileOpen(false)} />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
            <Logo logoUrl={agencyTheme?.logo} name={platformName} size="sm" />
          </div>

          <div className="flex-1 overflow-y-auto">
            {children}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
