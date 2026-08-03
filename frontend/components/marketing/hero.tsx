"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { fadeUp, staggerChildren } from "@/lib/motion";
import { APP_NAME } from "@/lib/constants";
import { CornerFrame } from "./corner-frame";
import { PROVIDERS, STATS } from "./content";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-hero-glow pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[500px]" />

      <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 pb-16 pt-20 sm:pt-28 lg:grid-cols-[1.1fr_1fr] lg:gap-6">
        <motion.div
          className="text-center lg:text-left"
          initial="hidden"
          animate="show"
          variants={staggerChildren}
        >
          <motion.div
            variants={fadeUp}
            className="mx-auto mb-6 inline-flex items-center gap-2 border border-primary/25 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-primary lg:mx-0"
          >
            <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            now shipping: claude sonnet 5 / gpt-5.6 / gemini 3.1
          </motion.div>

          <motion.h1
            variants={fadeUp}
            className="text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl"
          >
            Run your entire business
            <br />
            on one <span className="text-primary">AI platform</span>
          </motion.h1>

          <motion.p
            variants={fadeUp}
            className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground lg:mx-0"
          >
            {APP_NAME} unifies chatbots, automations, campaigns, and voice agents
            into a single system that talks to your customers and closes the loop —
            so your team doesn&apos;t have to.
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start"
          >
            <Button size="lg" variant="glow" className="w-full sm:w-auto" asChild>
              <Link href="/register">
                Start free — no card required
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="w-full sm:w-auto" asChild>
              <Link href="/pricing">See pricing</Link>
            </Button>
          </motion.div>

          <motion.p variants={fadeUp} className="mt-4 text-xs text-muted-foreground">
            Free forever plan · Setup in under 5 minutes · Cancel anytime
          </motion.p>

          <motion.div
            variants={fadeUp}
            className="mt-8 flex flex-wrap items-center justify-center gap-y-2 font-mono text-xs uppercase tracking-wide text-muted-foreground/70 lg:justify-start"
          >
            <span className="text-muted-foreground">runs on</span>
            {PROVIDERS.map((p) => (
              <span key={p} className="ml-4 border-l border-border pl-4">
                {p}
              </span>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="relative mx-auto hidden w-full max-w-md lg:block"
        >
          <ChatMockup />
        </motion.div>
      </div>

      {/* Stats bar */}
      <div className="border-y bg-secondary/50">
        <div className="mx-auto grid max-w-5xl grid-cols-2 divide-x divide-border sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="px-4 py-8 text-center sm:text-left">
              <div className="font-mono text-2xl font-medium tracking-tight text-primary sm:text-3xl">
                {s.value}
              </div>
              <div className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ChatMockup() {
  return (
    <div className="relative">
      <CornerFrame />

      <div className="relative rounded-lg border bg-card p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between border-b pb-3">
          <span className="font-mono text-xs text-muted-foreground">live_chat.preview</span>
          <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            online
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <div className="max-w-[80%] rounded-lg bg-secondary px-3 py-2 text-sm">
            Hey! Do you ship internationally, and how long does delivery take?
          </div>
          <div className="ml-auto max-w-[80%] rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
            Yes — we ship worldwide. Most orders arrive in 3–5 business days. Want me to check a specific country?
          </div>
          <div className="max-w-[80%] rounded-lg bg-secondary px-3 py-2 text-sm">
            Canada please
          </div>
          <div className="flex items-center gap-1 rounded-lg bg-secondary px-3 py-2.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground" />
          </div>
        </div>
      </div>
    </div>
  );
}
