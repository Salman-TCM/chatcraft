import Link from "next/link";
import { ArrowRight, BarChart2, Check, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Nav } from "@/components/marketing/nav";
import { Hero } from "@/components/marketing/hero";
import { FeatureGrid } from "@/components/marketing/feature-grid";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Callout } from "@/components/marketing/callout";
import { Integration } from "@/components/marketing/integration";
import { Faq } from "@/components/marketing/faq";
import { CtaBanner } from "@/components/marketing/cta-banner";
import { Footer } from "@/components/marketing/footer";
import { FEATURES, AI_TOOLS } from "@/components/marketing/content";
import { APP_NAME } from "@/lib/constants";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <Hero />
      <Integration />

      <FeatureGrid
        id="features"
        title="Everything you need, built in"
        description={`No stitching together five different tools. ${APP_NAME} covers the whole customer journey from first message to repeat purchase.`}
        items={FEATURES}
      />

      <FeatureGrid
        eyebrow="New"
        title="The latest in agentic AI, built in"
        description="Go beyond scripted chatbots — with autonomous agents, retrieval-augmented knowledge, and Model Context Protocol tool access."
        items={AI_TOOLS}
        sectionClassName="border-t bg-secondary/30"
        cardClassName="bg-background"
      />

      <HowItWorks />

      <Callout
        icon={MessageSquare}
        title="One inbox, one source of truth"
        description={`Stop stitching together a chatbot tool, a campaign tool, and a support inbox. ${APP_NAME} keeps every conversation, contact, and automation in one place — so context never gets lost between tools.`}
      />

      <Callout
        icon={BarChart2}
        title="Simple pricing that scales with you"
        description="Start free. Upgrade to Pro when you're ready for unlimited chatbots, all AI models, and a full analytics dashboard."
        sectionClassName="border-t bg-secondary/30"
      >
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
          <Button size="lg" variant="glow" asChild>
            <Link href="/pricing">
              View plans
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </Callout>

      <Faq />
      <CtaBanner />
      <Footer />
    </div>
  );
}
