import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FAQS } from "./content";

export function Faq() {
  return (
    <section className="border-t">
      <div className="mx-auto max-w-3xl px-6 py-24">
        <div className="text-center">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>
          <p className="mt-4 text-muted-foreground">
            Can&apos;t find what you&apos;re looking for?{" "}
            <a href="mailto:support@chatcraft.ai" className="font-medium text-foreground underline-offset-4 hover:underline">
              Talk to us
            </a>
            .
          </p>
        </div>

        <Accordion type="single" collapsible className="mt-10 rounded-xl border bg-background px-6">
          {FAQS.map((item) => (
            <AccordionItem key={item.q} value={item.q} className="last:border-b-0">
              <AccordionTrigger className="text-left hover:no-underline">{item.q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
