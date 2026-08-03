import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CtaBanner() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <div className="rounded-xl bg-gradient-brand px-8 py-16 text-center text-primary-foreground shadow-glow">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to put your business on autopilot?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-primary-foreground/80">
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
  );
}
