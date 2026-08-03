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

        <div className="mt-14 grid gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.n} className="relative animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="mb-4 text-4xl font-bold text-primary/20">{step.n}</div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
