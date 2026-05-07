import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: "chatcraft-frontend@0.1.0",
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
  // Do not print Sentry debug output to server logs in production
  debug: false,
});
