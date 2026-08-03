"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { fadeUp, staggerChildren } from "@/lib/motion";
import { STATS } from "./content";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="bg-hero-glow pointer-events-none absolute inset-x-0 -top-40 -z-10 h-[500px]" />

      <motion.div
        className="mx-auto max-w-5xl px-6 pb-20 pt-20 text-center sm:pt-28"
        initial="hidden"
        animate="show"
        variants={staggerChildren}
      >
        <motion.div
          variants={fadeUp}
          className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground"
        >
          <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Now with Claude Sonnet 5, GPT-5.6 & Gemini 3.1
        </motion.div>

        <motion.h1 variants={fadeUp} className="text-4xl font-bold tracking-tight sm:text-6xl">
          Run your entire business
          <br />
          on one <span className="text-gradient-brand">AI platform</span>
        </motion.h1>

        <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
          ChatCraft AI unifies chatbots, automations, campaigns, and voice agents
          into a single system that talks to your customers and closes the loop —
          so your team doesn&apos;t have to.
        </motion.p>

        <motion.div
          variants={fadeUp}
          className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
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
      </motion.div>

      {/* Stats bar */}
      <div className="border-y bg-secondary/50">
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-6 py-10 sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-bold tracking-tight text-primary sm:text-3xl">
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
