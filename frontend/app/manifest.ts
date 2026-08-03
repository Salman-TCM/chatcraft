import type { MetadataRoute } from "next";
import { APP_NAME } from "@/lib/constants";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "AI chatbot platform for businesses worldwide",
    start_url: "/dashboard",
    display: "standalone",
    orientation: "portrait-primary",
    theme_color: "#4F46E5",
    background_color: "#ffffff",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    categories: ["business", "productivity"],
    shortcuts: [
      { name: "Dashboard", url: "/dashboard", description: "Go to your dashboard" },
      { name: "Chatbots", url: "/dashboard/chatbots", description: "Manage your chatbots" },
    ],
  };
}
