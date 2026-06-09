import { withSentryConfig } from "@sentry/nextjs";

const BACKEND_URL = process.env.BACKEND_URL || "http://backend:8000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**.supabase.co",
      },
      {
        protocol: "https",
        hostname: "**.amazonaws.com",
      },
    ],
  },
  // Proxy backend routes through Next.js so the browser only needs to reach
  // the frontend port. Excludes /api/auth/* (NextAuth), /api/health and
  // /api/widget-js (Next.js route handlers).
  async rewrites() {
    return [
      // Backend versioned API
      { source: "/api/v1/:path*",      destination: `${BACKEND_URL}/api/v1/:path*` },
      // Backend unversioned namespaces
      { source: "/api/wallet/:path*",  destination: `${BACKEND_URL}/api/wallet/:path*` },
      { source: "/api/admin/:path*",   destination: `${BACKEND_URL}/api/admin/:path*` },
      { source: "/api/public/:path*",  destination: `${BACKEND_URL}/api/public/:path*` },
      // Catch-all for any other backend /api/ routes
      // (does NOT match /api/auth, /api/health, /api/widget-js — those are
      //  handled by Next.js route files loaded before afterFiles rewrites)
      { source: "/api/:path((?!auth|health|widget-js).*)", destination: `${BACKEND_URL}/api/:path*` },
      // Other backend paths
      { source: "/a2a/:path*",         destination: `${BACKEND_URL}/a2a/:path*` },
      { source: "/webhooks/:path*",    destination: `${BACKEND_URL}/webhooks/:path*` },
      { source: "/health/:path*",      destination: `${BACKEND_URL}/health/:path*` },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Upload source maps only in CI/production builds
  silent: true,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
