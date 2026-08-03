import { APP_NAME } from "@/lib/constants";
import { CornerFrame } from "./corner-frame";

type Seg = { t: string; c?: "attr" | "str" };

const SNIPPET: { n: number; segs: Seg[] }[] = [
  { n: 1, segs: [{ t: "<script" }] },
  { n: 2, segs: [{ t: "  src", c: "attr" }, { t: '="https://cdn.tiertech.app/widget.js"', c: "str" }] },
  { n: 3, segs: [{ t: "  data-chatbot-id", c: "attr" }, { t: '="cb_9f21ae"', c: "str" }] },
  { n: 4, segs: [{ t: "  data-position", c: "attr" }, { t: '="bottom-right"', c: "str" }] },
  { n: 5, segs: [{ t: "></script>" }] },
];

const SEG_COLOR: Record<string, string> = {
  attr: "text-[#7dd3fc]",
  str: "text-[#86efac]",
};

export function Integration() {
  return (
    <section className="border-t bg-secondary/30">
      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-24 lg:grid-cols-2 lg:items-center lg:gap-16">
        <div>
          <span className="font-mono text-xs uppercase tracking-widest text-primary/70">
            01 — Integration
          </span>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            One script tag. That&apos;s the whole install.
          </h2>
          <p className="mt-4 max-w-md text-muted-foreground">
            No SDK, no build step, no backend to stand up. Paste one snippet into
            your site and {APP_NAME} handles auth, streaming, history, and
            hand-off to a human — end to end.
          </p>
          <dl className="mt-8 grid grid-cols-2 gap-6 border-t pt-6 sm:max-w-sm">
            <div>
              <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Install time
              </dt>
              <dd className="mt-1 font-mono text-lg">&lt; 2 min</dd>
            </div>
            <div>
              <dt className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
                Runtime
              </dt>
              <dd className="mt-1 font-mono text-lg">~14kb gz</dd>
            </div>
          </dl>
        </div>

        <div className="relative mx-auto w-full max-w-lg">
          <CornerFrame />
          <div className="rounded-lg border bg-[#0b0d10] shadow-lg">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-2.5">
              <span className="font-mono text-xs text-white/40">embed.html</span>
              <span className="flex items-center gap-1.5 font-mono text-[11px] text-white/40">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                copy-paste ready
              </span>
            </div>
            <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
              {SNIPPET.map((line) => (
                <div key={line.n} className="flex gap-4">
                  <span className="select-none text-white/25">{String(line.n).padStart(2, "0")}</span>
                  <span className="text-white/85">
                    {line.segs.map((seg, i) => (
                      <span key={i} className={seg.c ? SEG_COLOR[seg.c] : undefined}>
                        {seg.t}
                      </span>
                    ))}
                  </span>
                </div>
              ))}
            </pre>
          </div>
        </div>
      </div>
    </section>
  );
}
