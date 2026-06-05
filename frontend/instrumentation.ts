export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { init } = await import("@sentry/nextjs");
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      release: "chatcraft-frontend@0.1.0",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
      debug: false,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    const { init } = await import("@sentry/nextjs");
    init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NODE_ENV,
      release: "chatcraft-frontend@0.1.0",
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
      debug: false,
    });
  }
}
