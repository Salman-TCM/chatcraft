"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";

interface LogoProps {
  logoUrl?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  className?: string;
}

const SIZES = {
  sm: { image: 24, box: "h-6 w-6", text: "text-sm", wordmark: "text-sm" },
  md: { image: 28, box: "h-7 w-7", text: "text-base", wordmark: "text-base" },
  lg: { image: 36, box: "h-9 w-9", text: "text-lg", wordmark: "text-xl" },
} as const;

export function Logo({ logoUrl, name = "ChatCraft AI", size = "md", iconOnly, className }: LogoProps) {
  const dims = SIZES[size];

  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={name}
        height={dims.image}
        width={dims.image * 4}
        className={cn("object-contain", className)}
        style={{ height: dims.image, width: "auto" }}
      />
    );
  }

  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span
        className={cn(
          "flex items-center justify-center shrink-0 rounded-lg bg-gradient-brand font-bold text-primary-foreground",
          dims.box,
          dims.text
        )}
      >
        {name[0]}
      </span>
      {!iconOnly && (
        <span className={cn("truncate font-semibold tracking-tight", dims.wordmark)}>{name}</span>
      )}
    </span>
  );
}
