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
            <div className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-600">
              <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {eyebrow}
            </div>
          )}
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
          <p className="mt-4 text-muted-foreground">{description}</p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((f) => (
            <Card key={f.title} variant="interactive" className={cn("border p-6", cardClassName)}>
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
