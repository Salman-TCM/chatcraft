"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, Phone, Mail, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RichBlock, RichButton, CarouselItem } from "./types";

interface RichContentProps {
  block: RichBlock;
  onQuickReply?: (reply: string) => void;
  onPostback?: (payload: string) => void;
  usedReplies?: Set<string>;
}

export function RichContent({ block, onQuickReply, onPostback, usedReplies }: RichContentProps) {
  if (block.type === "carousel") {
    return <Carousel items={block.items} onPostback={onPostback} />;
  }
  if (block.type === "card") {
    return (
      <Card
        title={block.title}
        subtitle={block.subtitle}
        imageUrl={block.image_url}
        buttons={block.buttons}
        onPostback={onPostback}
      />
    );
  }
  if (block.type === "quick_replies") {
    return (
      <QuickReplies
        text={block.text}
        replies={block.replies}
        onSelect={onQuickReply}
        usedReplies={usedReplies}
      />
    );
  }
  if (block.type === "buttons") {
    return (
      <ButtonList
        text={block.text}
        buttons={block.buttons}
        onPostback={onPostback}
      />
    );
  }
  return null;
}

// ── Carousel ──────────────────────────────────────────────────────────────────

function Carousel({ items, onPostback }: { items: CarouselItem[]; onPostback?: (p: string) => void }) {
  const [index, setIndex] = useState(0);
  if (!items.length) return null;

  const item = items[index];
  return (
    <div className="mt-2 w-full max-w-xs">
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        {item.image_url && (
          <img
            src={item.image_url}
            alt={item.title}
            className="w-full h-40 object-cover"
            loading="lazy"
          />
        )}
        <div className="p-3">
          <p className="font-semibold text-sm">{item.title}</p>
          {item.subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5">{item.subtitle}</p>
          )}
          {item.buttons?.length ? (
            <div className="mt-2 flex flex-col gap-1">
              {item.buttons.map((btn, i) => (
                <RichBtn key={i} button={btn} onPostback={onPostback} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {items.length > 1 && (
        <div className="flex items-center justify-between mt-1.5 px-1">
          <button
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            className="inline-flex items-center justify-center p-1 rounded hover:bg-muted disabled:opacity-30 transition-opacity"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground">
            {index + 1} / {items.length}
          </span>
          <button
            onClick={() => setIndex((i) => Math.min(items.length - 1, i + 1))}
            disabled={index === items.length - 1}
            className="inline-flex items-center justify-center p-1 rounded hover:bg-muted disabled:opacity-30 transition-opacity"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

function Card({
  title,
  subtitle,
  imageUrl,
  buttons,
  onPostback,
}: {
  title: string;
  subtitle?: string;
  imageUrl?: string;
  buttons?: RichButton[];
  onPostback?: (p: string) => void;
}) {
  return (
    <div className="mt-2 w-full max-w-xs rounded-xl border bg-card overflow-hidden shadow-sm">
      {imageUrl && (
        <img src={imageUrl} alt={title} className="w-full h-40 object-cover" loading="lazy" />
      )}
      <div className="p-3">
        <p className="font-semibold text-sm">{title}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        {buttons?.length ? (
          <div className="mt-2 flex flex-col gap-1">
            {buttons.map((btn, i) => (
              <RichBtn key={i} button={btn} onPostback={onPostback} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Quick replies ─────────────────────────────────────────────────────────────

function QuickReplies({
  text,
  replies,
  onSelect,
  usedReplies,
}: {
  text?: string;
  replies: string[];
  onSelect?: (r: string) => void;
  usedReplies?: Set<string>;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  if (selected) return null; // disappear after selection

  return (
    <div className="mt-2">
      {text && <p className="text-sm mb-2">{text}</p>}
      <div className="flex flex-wrap gap-1.5">
        {replies.map((reply, i) => {
          const used = usedReplies?.has(reply);
          return (
            <button
              key={i}
              disabled={!!used}
              onClick={() => {
                setSelected(reply);
                onSelect?.(reply);
              }}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                used
                  ? "opacity-40 cursor-default"
                  : "hover:bg-primary hover:text-primary-foreground hover:border-primary"
              )}
            >
              {reply}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Button list ───────────────────────────────────────────────────────────────

function ButtonList({
  text,
  buttons,
  onPostback,
}: {
  text?: string;
  buttons: RichButton[];
  onPostback?: (p: string) => void;
}) {
  return (
    <div className="mt-2">
      {text && <p className="text-sm mb-2">{text}</p>}
      <div className="flex flex-col gap-1.5 max-w-xs">
        {buttons.map((btn, i) => (
          <RichBtn key={i} button={btn} onPostback={onPostback} />
        ))}
      </div>
    </div>
  );
}

// ── Individual button ─────────────────────────────────────────────────────────

function RichBtn({
  button,
  onPostback,
}: {
  button: RichButton;
  onPostback?: (p: string) => void;
}) {
  const baseClass =
    "flex items-center justify-center gap-1.5 w-full rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-muted";

  if (button.type === "url" && button.url) {
    return (
      <a href={button.url} target="_blank" rel="noopener noreferrer" className={baseClass}>
        <ExternalLink className="h-3 w-3 shrink-0" />
        {button.label}
      </a>
    );
  }
  if (button.type === "phone" && button.phone) {
    return (
      <a href={`tel:${button.phone}`} className={baseClass}>
        <Phone className="h-3 w-3 shrink-0" />
        {button.label}
      </a>
    );
  }
  if (button.type === "email" && button.email) {
    return (
      <a href={`mailto:${button.email}`} className={baseClass}>
        <Mail className="h-3 w-3 shrink-0" />
        {button.label}
      </a>
    );
  }
  if (button.type === "postback" && button.payload) {
    return (
      <button onClick={() => onPostback?.(button.payload!)} className={baseClass}>
        <MessageSquare className="h-3 w-3 shrink-0" />
        {button.label}
      </button>
    );
  }
  // landing_page or unknown — render as plain text button
  return (
    <button className={cn(baseClass, "cursor-default opacity-60")}>{button.label}</button>
  );
}

// ── Parser utility ────────────────────────────────────────────────────────────

const RICH_START = "<<<RICH>>>";
const RICH_END = "<<<END>>>";

export function parseRichContent(content: string): { text: string; blocks: RichBlock[] } {
  const blocks: RichBlock[] = [];
  const parts = content.split(RICH_START);
  let text = parts[0].trim();

  for (let i = 1; i < parts.length; i++) {
    const endIdx = parts[i].indexOf(RICH_END);
    if (endIdx >= 0) {
      const jsonStr = parts[i].slice(0, endIdx).trim();
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object" && "type" in parsed) {
          blocks.push(parsed as RichBlock);
        }
      } catch {}
      const afterEnd = parts[i].slice(endIdx + RICH_END.length).trim();
      if (afterEnd) text = text ? `${text}\n${afterEnd}` : afterEnd;
    }
    // If <<<END>>> not found yet (still streaming), skip this block
  }

  return { text, blocks };
}
