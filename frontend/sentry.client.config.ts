import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: "chatcraft-frontend@0.1.0",

  // Capture 20% of transactions in production, 100% in dev
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Session replay: 10% of sessions, 100% on error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
    Sentry.browserTracingIntegration(),
  ],

  // Strip sensitive query params before sending to Sentry
  beforeSend(event) {
    if (event.request?.url) {
      const url = new URL(event.request.url);
      ["token", "key", "secret", "password"].forEach((p) => url.searchParams.delete(p));
      event.request.url = url.toString();
    }
    return event;
  },
});
