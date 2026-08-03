"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store";
import { hexToHslTriple } from "@/lib/color";

interface AgencyTheme {
  primaryColour?: string;
  logo?: string;
  name?: string;
  favicon?: string;
}

export function ThemeInjector({ theme }: { theme: AgencyTheme | null }) {
  const setAgencyTheme = useAppStore((s) => s.setAgencyTheme);

  useEffect(() => {
    setAgencyTheme(theme);

    if (theme?.primaryColour) {
      const hsl = hexToHslTriple(theme.primaryColour);
      if (hsl) {
        document.documentElement.style.setProperty("--brand-primary", hsl);
      }
    }

    if (theme?.favicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = theme.favicon;
    }
  }, [theme, setAgencyTheme]);

  return null;
}
