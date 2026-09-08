"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { FiCheck } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface Plan {
  name: string;
  description: string;
  price: string;
  priceDetail: string;
  priceId: string | null;
  highlight: boolean;
  features: string[];
  cta: string;
}

const PLANS: Plan[] = [
  {
    name: "Free",
    description: `Try ${APP_NAME} at no cost`,
    price: "$0",
    priceDetail: "forever",
    priceId: null,
    highlight: false,
    features: [
      "20 messages per month",
      "1 chatbot",
      "Basic AI models",
      "Standard support",
    ],
    cta: "Get started",
  },
  {
    name: "Pro",
    description: "For growing businesses",
    price: "$49",
    priceDetail: "per month",
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID ?? "",
    highlight: true,
    features: [
      "5,000 messages per month",
      "Unlimited chatbots",
      "All AI models (GPT-4, Claude, Gemini)",
      "Knowledge base (RAG)",
      "Custom branding",
      "Priority support",
      "Analytics dashboard",
    ],
    cta: "Upgrade to Pro",
  },
  {
    name: "Enterprise",
    description: "For large teams and custom needs",
    price: "Custom",
    priceDetail: "contact us",
    priceId: null,
    highlight: false,
    features: [
      "Unlimited messages",
      "Unlimited chatbots",
      "All AI models",
      "Knowledge base (RAG)",
      "Custom branding & white-label",
      "Stripe Connect payouts",
      "Dedicated support",
      "SLA guarantee",
      "Custom integrations",
    ],
    cta: "Contact sales",
  },
];

const CHECK = <FiCheck className="h-4 w-4 text-green-500 shrink-0" aria-hidden="true" />;

export default function PricingPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleUpgrade(plan: Plan) {
    if (!plan.priceId) {
      if (plan.name === "Free") {
        router.push(session ? "/dashboard" : "/register");
      } else {
        // No payment gateway configured yet — route Pro/Enterprise
        // upgrades to a manual sales email in the meantime.
        const subject = encodeURIComponent(`${plan.name} plan — ${APP_NAME}`);
        const body = encodeURIComponent(
          session?.user?.email
            ? `Hi, I'd like to upgrade my account (${session.user.email}) to the ${plan.name} plan.`
            : `Hi, I'd like to sign up for the ${plan.name} plan.`
        );
        window.location.href = `mailto:bytecurebd@gmail.com?subject=${subject}&body=${body}`;
      }
      return;
    }

    if (!session) {
      router.push(`/login?callbackUrl=/pricing`);
      return;
    }

    setLoading(plan.name);
    try {
      const res = await fetch(`${API_URL}/api/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.user.accessToken}`,
        },
        body: JSON.stringify({ price_id: plan.priceId }),
      });
      const body = await res.json();
      if (res.ok && body.data?.checkout_url) {
        window.location.href = body.data.checkout_url;
      }
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Simple, transparent pricing
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Start for free. Upgrade when you&apos;re ready. No hidden fees.
        </p>
      </div>

      {/* Plan cards */}
      <div className="mx-auto max-w-5xl px-6 pb-24">
        <div className="grid gap-8 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <Card
              key={plan.name}
              className={
                plan.highlight
                  ? "relative border-2 border-foreground shadow-lg"
                  : "border"
              }
            >
              {plan.highlight && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background">
                    Most popular
                  </span>
                </div>
              )}

              <CardHeader className="pb-2">
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-6">
                <div>
                  <span className="text-4xl font-bold">{plan.price}</span>
                  <span className="ml-1.5 text-sm text-muted-foreground">
                    {plan.priceDetail}
                  </span>
                </div>

                <ul className="space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      {CHECK}
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  className="w-full"
                  variant={plan.highlight ? "default" : "outline"}
                  disabled={loading === plan.name}
                  onClick={() => handleUpgrade(plan)}
                >
                  {loading === plan.name ? "Redirecting…" : plan.cta}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Comparison note */}
        <p className="mt-12 text-center text-sm text-muted-foreground">
          All plans include HTTPS, GDPR-compliant data handling, and a{" "}
          <span className="font-medium text-foreground">14-day money-back guarantee</span>.
          Questions?{" "}
          <Link href="mailto:support@chatcraft.ai" className="underline underline-offset-4 hover:text-foreground">
            Contact us
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
