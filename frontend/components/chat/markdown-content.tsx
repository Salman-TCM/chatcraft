"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownContentProps {
  content: string;
  className?: string;
}

/**
 * Renders assistant message text as Markdown (bold, lists, headings, tables,
 * links, code) so `**bold**`-style syntax shows up formatted instead of as
 * literal asterisks. Colors inherit from the surrounding chat bubble rather
 * than Tailwind Typography's own palette, since bubbles already set their
 * own foreground color for light/dark and user vs. assistant.
 */
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none whitespace-normal break-words [&_*]:text-inherit",
        "prose-p:my-1.5 prose-headings:my-2 prose-headings:font-semibold",
        "prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5",
        "prose-pre:my-2 prose-pre:bg-black/10 prose-code:before:content-none prose-code:after:content-none",
        "prose-table:my-2 prose-blockquote:my-2 prose-blockquote:border-current/30",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          table: ({ children, ...props }) => (
            <div className="overflow-x-auto">
              <table {...props}>{children}</table>
            </div>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
