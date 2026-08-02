"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bot, Zap, GitBranch, Mic, Wallet, Share2, Database, Plug,
  ClipboardList, Megaphone, Monitor, MessageCircle,
  ArrowRight, Menu, X, Check, MessageSquare, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const BRAND = "#3B52D4";

const FEATURES = [
  { icon: MessageCircle, title: "AI Chatbots", desc: "Deploy chatbots on Claude, GPT-5.6, Gemini 3.1, Grok, or your model of choice — swap providers anytime, no lock-in." },
  { icon: GitBranch, title: "Visual Flows", desc: "Build conversation flows and automation logic with a drag-and-drop builder — no code required." },
  { icon: Zap, title: "Automations", desc: "Trigger actions on events across your whole stack — tags, sequences, pipelines, and more." },
  { icon: Megaphone, title: "Broadcasts", desc: "Send targeted campaigns to segmented audiences and track opens, clicks, and replies." },
  { icon: Share2, title: "Social Inbox", desc: "Manage every DM, comment, and mention across channels from one unified inbox." },
  { icon: ClipboardList, title: "Forms & Landing Pages", desc: "Capture leads with high-converting forms and pages, built directly into your funnel." },
  { icon: Wallet, title: "Wallet Passes", desc: "Issue Apple & Google Wallet loyalty and membership passes with live push updates." },
];

const AI_TOOLS = [
  { icon: Bot, title: "Agent Builder", desc: "Design autonomous AI agents that reason step by step, call tools, and complete multi-step tasks without a human in the loop." },
  { icon: Database, title: "Knowledge Base (RAG)", desc: "Upload docs, URLs, and files — chatbots embed and retrieve the right context automatically, powered by pgvector." },
  { icon: Plug, title: "MCP Servers", desc: "Connect Model Context Protocol servers so your agents can discover and call external tools and APIs on the fly." },
  { icon: Mic, title: "Voice Lab", desc: "Give your agents a natural voice for phone and in-app voice interactions." },
  { icon: Monitor, title: "Browser Agent", desc: "Let AI agents navigate the web and complete tasks on your behalf, autonomously." },
];

const STEPS = [
  { n: "01", title: "Connect your channels", desc: "Link your website, WhatsApp, Instagram, and voice lines in minutes." },
  { n: "02", title: "Train your AI", desc: "Upload your knowledge base and let ChatCraft learn your business." },
  { n: "03", title: "Automate & grow", desc: "Launch flows, sequences, and campaigns that run without you." },
];

const STATS = [
  { value: "7", label: "AI providers — Claude, GPT, Gemini, Grok & more" },
  { value: "20+", label: "Built-in tools, from chatbots to wallet passes" },
  { value: "Free", label: "Plan to start, no card required" },
  { value: "14-day", label: "Money-back guarantee on paid plans" },
];

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];

export default function HomePage() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            <div
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ backgroundColor: BRAND }}
            >
              C
            </div>
            <span className="text-base font-semibold tracking-tight">ChatCraft AI</span>
          </Link>

          <nav className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" style={{ backgroundColor: BRAND }} asChild>
              <Link href="/register">
                Get started free
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <button
            className="rounded-md p-2 md:hidden"
            onClick={() => setMobileOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {mobileOpen && (
          <div className="border-t px-6 py-4 md:hidden">
            <nav className="flex flex-col gap-4">
              {NAV_LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="text-sm font-medium text-muted-foreground hover:text-foreground"
                >
                  {l.label}
                </Link>
              ))}
              <div className="flex flex-col gap-2 pt-2">
                <Button variant="outline" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
                <Button style={{ backgroundColor: BRAND }} asChild>
                  <Link href="/register">Get started free</Link>
                </Button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[500px] opacity-20 blur-3xl"
          style={{ background: `radial-gradient(ellipse at top, ${BRAND}, transparent 70%)` }}
        />
        <div className="mx-auto max-w-5xl px-6 pb-20 pt-20 text-center sm:pt-28">
          <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground">
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Now with Claude Sonnet 5, GPT-5.6 & Gemini 3.1
          </div>

          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Run your entire business
            <br />
            on one <span style={{ color: BRAND }}>AI platform</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            ChatCraft AI unifies chatbots, automations, campaigns, and voice agents
            into a single system that talks to your customers and closes the loop —
            so your team doesn&apos;t have to.
          </p>

          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" className="w-full sm:w-auto" style={{ backgroundColor: BRAND }} asChild>
              <Link href="/register">
                Start free — no card required
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            Free forever plan · Setup in under 5 minutes · Cancel anytime
          </p>
        </div>

        {/* Stats bar */}
        <div className="border-y bg-secondary/50">
          <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-10 sm:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold tracking-tight sm:text-3xl" style={{ color: BRAND }}>
                  {s.value}
                </div>
                <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need, built in
          </h2>
          <p className="mt-4 text-muted-foreground">
            No stitching together five different tools. ChatCraft AI covers the whole
            customer journey from first message to repeat purchase.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="border p-6 transition-shadow hover:shadow-md">
              <div
                className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${BRAND}1A` }}
              >
                <f.icon className="h-5 w-5" style={{ color: BRAND }} />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* AI Tools */}
      <section className="border-t bg-secondary/30">
        <div className="mx-auto max-w-6xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              New
            </div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              The latest in agentic AI, built in
            </h2>
            <p className="mt-4 text-muted-foreground">
              Go beyond scripted chatbots — with autonomous agents, retrieval-augmented
              knowledge, and Model Context Protocol tool access.
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {AI_TOOLS.map((f) => (
              <Card key={f.title} className="border bg-background p-6 transition-shadow hover:shadow-md">
                <div
                  className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${BRAND}1A` }}
                >
                  <f.icon className="h-5 w-5" style={{ color: BRAND }} />
                </div>
                <h3 className="font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="border-t">
        <div className="mx-auto max-w-5xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Live in minutes, not months
            </h2>
          </div>

          <div className="mt-14 grid gap-8 sm:grid-cols-3">
            {STEPS.map((step) => (
              <div key={step.n} className="relative">
                <div
                  className="mb-4 text-4xl font-bold opacity-20"
                  style={{ color: BRAND }}
                >
                  {step.n}
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why ChatCraft AI */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <MessageSquare className="mx-auto h-8 w-8" style={{ color: BRAND }} />
        <h2 className="mt-6 text-2xl font-bold tracking-tight sm:text-3xl">
          One inbox, one source of truth
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Stop stitching together a chatbot tool, a campaign tool, and a support
          inbox. ChatCraft AI keeps every conversation, contact, and automation in
          one place — so context never gets lost between tools.
        </p>
      </section>

      {/* Pricing teaser */}
      <section className="border-t bg-secondary/30">
        <div className="mx-auto max-w-4xl px-6 py-24 text-center">
          <BarChart2 className="mx-auto h-8 w-8" style={{ color: BRAND }} />
          <h2 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">
            Simple pricing that scales with you
          </h2>
          <p className="mt-4 text-muted-foreground">
            Start free. Upgrade to Pro when you&apos;re ready for unlimited chatbots,
            all AI models, and a full analytics dashboard.
          </p>
          <ul className="mx-auto mt-8 flex max-w-md flex-col gap-2 text-left text-sm">
            {[
              "Free plan with no credit card",
              "Unlimited chatbots on Pro",
              "14-day money-back guarantee",
            ].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-8">
            <Button size="lg" style={{ backgroundColor: BRAND }} asChild>
              <Link href="/pricing">
                View plans
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-5xl px-6 py-24">
        <div
          className="rounded-2xl px-8 py-16 text-center text-white"
          style={{ background: `linear-gradient(135deg, ${BRAND}, #6366F1)` }}
        >
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to put your business on autopilot?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            Join teams using ChatCraft AI to automate support, sales, and marketing
            in one place.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" className="w-full sm:w-auto" asChild>
              <Link href="/register">
                Get started free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <div
                className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold text-white"
                style={{ backgroundColor: BRAND }}
              >
                C
              </div>
              <span className="text-sm font-semibold">ChatCraft AI</span>
            </div>

            <nav className="flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
              <Link href="/pricing" className="hover:text-foreground">Pricing</Link>
              <Link href="/terms" className="hover:text-foreground">Terms</Link>
              <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
              <Link href="mailto:support@chatcraft.ai" className="hover:text-foreground">Contact</Link>
            </nav>
          </div>

          <div className="mt-8 border-t pt-6 text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} ChatCraft AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
