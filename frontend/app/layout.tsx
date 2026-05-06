import type { Metadata } from "next";
import { Inter } from "next/font/google";
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
  description: "Production-grade AI chatbot platform for UK businesses",
  keywords: ["AI chatbot", "UK business", "customer support", "ChatCraft"],
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
        {children}
      </body>
    </html>
  );
}
