import Link from "next/link";
import { Logo } from "@/components/branding/logo";
import { APP_NAME } from "@/lib/constants";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "#features", label: "Features" },
      { href: "#how-it-works", label: "How it works" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/terms", label: "Terms" },
      { href: "/privacy", label: "Privacy" },
      { href: "mailto:support@chatcraft.ai", label: "Contact" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 sm:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <Logo size="sm" />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              One AI platform for chatbots, automations, campaigns, and voice —
              built to close the loop with your customers.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <div className="text-sm font-semibold">{col.title}</div>
              <nav className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground">
                {col.links.map((l) => (
                  <Link key={l.href} href={l.href} className="hover:text-foreground">
                    {l.label}
                  </Link>
                ))}
              </nav>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 text-center text-xs text-muted-foreground sm:flex-row sm:text-left">
          <span>© {new Date().getFullYear()} {APP_NAME}. All rights reserved.</span>
          <span>Made for teams who&apos;d rather build than babysit tools.</span>
        </div>
      </div>
    </footer>
  );
}
