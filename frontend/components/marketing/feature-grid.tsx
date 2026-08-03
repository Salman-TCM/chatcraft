import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface FeatureItem {
  icon: LucideIcon;
  title: string;
  desc: string;
}

interface FeatureGridProps {
  id?: string;
  eyebrow?: string;
  title: string;
  description: string;
  items: FeatureItem[];
  sectionClassName?: string;
  cardClassName?: string;
}

export function FeatureGrid({
  id,
  eyebrow,
  title,
  description,
  items,
  sectionClassName,
  cardClassName,
}: FeatureGridProps) {
  return (
    <section id={id} className={cn("py-24", sectionClassName)}>
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          {eyebrow && (
            <div className="mx-auto mb-4 inline-flex items-center gap-2 border border-emerald-500/30 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-emerald-600">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {eyebrow}
            </div>
          )}
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 text-muted-foreground">{description}</p>
        </div>

        <div className="mt-14 grid gap-px overflow-hidden rounded-xl border sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f, i) => (
            <Card
              key={f.title}
              className={cn(
                "rounded-none border-0 p-6 shadow-none transition-colors hover:bg-secondary/40",
                cardClassName
              )}
            >
              <div className="flex items-start justify-between">
                <f.icon className="h-5 w-5 text-primary" strokeWidth={1.75} />
                <span className="font-mono text-xs text-muted-foreground/50">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
