"use client";

import { motion } from "framer-motion";
import { fadeUp, staggerChildren } from "@/lib/motion";
import { STEPS } from "./content";

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-t">
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Live in minutes, not months
          </h2>
        </div>

        <motion.div
          className="relative mt-16 grid gap-10 sm:grid-cols-3 sm:gap-8"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: "-80px" }}
          variants={staggerChildren}
        >
          <div
            aria-hidden
            className="absolute left-0 right-0 top-3 hidden border-t border-dashed sm:block"
          />

          {STEPS.map((step) => (
            <motion.div key={step.n} variants={fadeUp} className="relative text-center sm:text-left">
              <div className="relative z-10 inline-flex items-center gap-2 bg-background pr-3 sm:pl-0">
                <step.icon className="h-4 w-4 text-primary" strokeWidth={1.75} />
                <span className="font-mono text-xs tracking-widest text-primary/60">
                  step_{step.n}
                </span>
              </div>
              <h3 className="mt-3 font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
