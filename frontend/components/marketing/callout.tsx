import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface CalloutProps {
  icon: LucideIcon;
  title: string;
  description: string;
  sectionClassName?: string;
  children?: ReactNode;
}

export function Callout({ icon: Icon, title, description, sectionClassName, children }: CalloutProps) {
  return (
    <section className={cn("py-24", sectionClassName)}>
      <div className="mx-auto max-w-4xl px-6 text-center">
        <Icon className="mx-auto h-8 w-8 text-primary" />
        <h2 className="mt-6 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">{description}</p>
        {children}
      </div>
    </section>
  );
}
