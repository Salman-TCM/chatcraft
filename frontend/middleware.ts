import { auth } from "@/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/billing",
  "/settings",
  "/chat",
  "/knowledge",
  "/analytics",
  "/team",
];

const AUTH_PAGES = ["/login", "/register", "/forgot-password"];

const AGENCY_ROUTE_PREFIXES = ["/agency"];

async function resolveAgency(host: string): Promise<{ id: string; theme: string } | null> {
  try {
    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const res = await fetch(`${apiBase}/api/public/agency-by-domain?host=${encodeURIComponent(host)}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.data) return null;
    return {
      id: data.data.id,
      theme: JSON.stringify({
        primaryColour: data.data.primary_colour,
        logo: data.data.logo_url,
        name: data.data.name ?? "Agency",
        favicon: data.data.favicon_url,
      }),
    };
  } catch {
    return null;
  }
}

export default auth(async (req) => {
  const { nextUrl, auth: session } = req;
  const isAuthenticated = !!session?.user;
  const path = nextUrl.pathname;
  const host = req.headers.get("host") || "";

  // Strip port for local dev
  const hostname = host.split(":")[0];
  const platformDomain = (process.env.NEXT_PUBLIC_DOMAIN || "localhost").split(":")[0];

  // Resolve agency for custom domains or subdomains
  let agencyId: string | null = null;
  let agencyTheme: string | null = null;

  if (hostname !== platformDomain && hostname !== "localhost") {
    const agency = await resolveAgency(hostname);
    if (agency) {
      agencyId = agency.id;
      agencyTheme = agency.theme;
    }
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) => path.startsWith(prefix));
  const isAuthPage = AUTH_PAGES.some((p) => path.startsWith(p));

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
  }

  const response = NextResponse.next();

  if (agencyId) {
    response.headers.set("x-agency-id", agencyId);
  }
  if (agencyTheme) {
    response.headers.set("x-agency-theme", agencyTheme);
  }

  return response;
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
