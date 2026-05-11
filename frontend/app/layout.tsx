import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { SessionProvider } from "next-auth/react";
import { SessionSync } from "@/components/session-sync";
import { TrialBanner } from "@/components/trial-banner";
import { UpgradeModal } from "@/components/upgrade-modal";
import { HardPaywallModal } from "@/components/hard-paywall-modal";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "ChatCraft AI",
    template: "%s | ChatCraft AI",
  },
  description: "Production-grade AI chatbot platform for businesses worldwide",
  keywords: ["AI chatbot", "customer support", "ChatCraft", "AI platform"],
  authors: [{ name: "ChatCraft AI" }],
  creator: "ChatCraft AI",
  metadataBase: new URL(
    process.env.NEXTAUTH_URL ?? "http://localhost:3000"
  ),
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <SessionProvider>
          <SessionSync />
          <TrialBanner />
          <UpgradeModal />
          <HardPaywallModal />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
