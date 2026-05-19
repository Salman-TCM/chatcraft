"use client";

import { useEffect } from "react";

interface AgencyTheme {
  primaryColour?: string;
  logo?: string;
  name?: string;
  favicon?: string;
}

export function ThemeInjector({ theme }: { theme: AgencyTheme | null }) {
  useEffect(() => {
    if (!theme?.primaryColour) return;
    const root = document.documentElement;
    root.style.setProperty("--brand-primary", theme.primaryColour);
    // Darken by ~10% for hover
    root.style.setProperty("--brand-primary-hover", theme.primaryColour);

    if (theme.favicon) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = theme.favicon;
    }
  }, [theme]);

  return null;
}
