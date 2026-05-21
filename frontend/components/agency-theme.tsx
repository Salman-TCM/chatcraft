"use client";

import { useEffect } from "react";
import { useAppStore } from "@/store";

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
      const root = document.documentElement;
      root.style.setProperty("--brand-primary", theme.primaryColour);
      root.style.setProperty("--brand-primary-hover", theme.primaryColour);
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
