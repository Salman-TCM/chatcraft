"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { APP_NAME } from "@/lib/constants";

interface LogoProps {
  logoUrl?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  className?: string;
}

const SIZES = {
  sm: { icon: "h-5 w-5", wordmark: "text-sm" },
  md: { icon: "h-6 w-6", wordmark: "text-base" },
  lg: { icon: "h-7 w-7", wordmark: "text-xl" },
} as const;

export function Logo({ logoUrl, name = APP_NAME, size = "md", iconOnly, className }: LogoProps) {
  const dims = SIZES[size];

  if (logoUrl) {
    const imageHeight = { sm: 24, md: 28, lg: 36 }[size];
    return (
      <Image
        src={logoUrl}
        alt={name}
        height={imageHeight}
        width={imageHeight * 4}
        className={cn("object-contain", className)}
        style={{ height: imageHeight, width: "auto" }}
      />
    );
  }

  return (
    <span className={cn("flex items-center gap-2", className)}>
      <LogoMark className={cn("shrink-0 text-primary", dims.icon)} />
      {!iconOnly && (
        <span className={cn("truncate font-semibold tracking-tight", dims.wordmark)}>{name}</span>
      )}
    </span>
  );
}

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <rect x="2.25" y="3.25" width="19.5" height="13.5" rx="3.75" fill="currentColor" />
      <path d="M6.75 16.75v3.75c0 .5.57.78.96.48l4.79-4.23H6.75Z" fill="currentColor" />
    </svg>
  );
}
