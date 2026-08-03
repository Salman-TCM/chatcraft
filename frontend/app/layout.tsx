import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { headers } from "next/headers";
import { SessionProvider } from "next-auth/react";
import { SessionSync } from "@/components/session-sync";
import { TrialBanner } from "@/components/trial-banner";
import { UpgradeModal } from "@/components/upgrade-modal";
import { HardPaywallModal } from "@/components/hard-paywall-modal";
import { Toaster } from "@/components/ui/toaster";
import { CookieConsent } from "@/components/cookie-consent";
import { ThemeInjector } from "@/components/agency-theme";
import { ThemeProvider } from "@/components/theme-provider";
import { PwaRegister } from "@/components/pwa-register";
import { APP_NAME } from "@/lib/constants";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export async function generateViewport(): Promise<Viewport> {
  const headersList = await headers();
  const agencyThemeRaw = headersList.get("x-agency-theme");
  const agencyTheme = agencyThemeRaw ? JSON.parse(agencyThemeRaw) : null;

  return {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    themeColor: agencyTheme?.primaryColour ?? "#4F46E5",
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const headersList = await headers();
  const agencyThemeRaw = headersList.get("x-agency-theme");
  const agencyTheme = agencyThemeRaw ? JSON.parse(agencyThemeRaw) : null;
  const platformName: string = agencyTheme?.name ?? APP_NAME;
  const base = new URL(process.env.NEXTAUTH_URL ?? "http://localhost:3000");

  return {
    title: {
      default: platformName,
      template: `%s | ${platformName}`,
    },
    description: "Production-grade AI chatbot platform for businesses worldwide",
    keywords: ["AI chatbot", "customer support", platformName, "AI platform"],
    authors: [{ name: platformName }],
    creator: platformName,
    metadataBase: base,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: platformName,
    },
    ...(agencyTheme?.logo
      ? {
          openGraph: {
            title: platformName,
            images: [{ url: agencyTheme.logo }],
          },
        }
      : {}),
    icons: agencyTheme?.favicon
      ? { icon: agencyTheme.favicon, apple: agencyTheme.favicon }
      : undefined,
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const agencyThemeRaw = headersList.get("x-agency-theme");
  const agencyTheme = agencyThemeRaw ? JSON.parse(agencyThemeRaw) : null;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <SessionProvider>
            <ThemeInjector theme={agencyTheme} />
            <SessionSync />
            <TrialBanner />
            <UpgradeModal />
            <HardPaywallModal />
            <CookieConsent />
            <PwaRegister />
            <Toaster />
            {children}
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
