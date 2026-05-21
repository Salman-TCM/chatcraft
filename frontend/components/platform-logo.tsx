"use client";

import Image from "next/image";

interface PlatformLogoProps {
  logoUrl?: string | null;
  platformName?: string;
  className?: string;
  height?: number;
}

export function PlatformLogo({
  logoUrl,
  platformName = "ChatCraft AI",
  className = "",
  height = 32,
}: PlatformLogoProps) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={platformName}
        height={height}
        width={height * 4}
        className={`object-contain ${className}`}
        style={{ height, width: "auto" }}
      />
    );
  }

  return (
    <span
      className={`font-bold text-indigo-600 dark:text-indigo-400 ${className}`}
      style={{ fontSize: height * 0.6 }}
    >
      {platformName}
    </span>
  );
}
