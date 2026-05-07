import { auth } from "@/auth";
import { NextResponse } from "next/server";

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

export default auth((req) => {
  const { nextUrl, auth: session } = req;
  const isAuthenticated = !!session?.user;
  const path = nextUrl.pathname;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    path.startsWith(prefix)
  );
  const isAuthPage = AUTH_PAGES.some((p) => path.startsWith(p));

  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", path);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
