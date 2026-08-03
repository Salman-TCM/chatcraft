import {
  Bot, Zap, GitBranch, Mic, Wallet, Share2, Database, Plug,
  ClipboardList, Megaphone, Monitor, MessageCircle,
} from "lucide-react";

export const FEATURES = [
  { icon: MessageCircle, title: "AI Chatbots", desc: "Deploy chatbots on Claude, GPT-5.6, Gemini 3.1, Grok, or your model of choice — swap providers anytime, no lock-in." },
  { icon: GitBranch, title: "Visual Flows", desc: "Build conversation flows and automation logic with a drag-and-drop builder — no code required." },
  { icon: Zap, title: "Automations", desc: "Trigger actions on events across your whole stack — tags, sequences, pipelines, and more." },
  { icon: Megaphone, title: "Broadcasts", desc: "Send targeted campaigns to segmented audiences and track opens, clicks, and replies." },
  { icon: Share2, title: "Social Inbox", desc: "Manage every DM, comment, and mention across channels from one unified inbox." },
  { icon: ClipboardList, title: "Forms & Landing Pages", desc: "Capture leads with high-converting forms and pages, built directly into your funnel." },
  { icon: Wallet, title: "Wallet Passes", desc: "Issue Apple & Google Wallet loyalty and membership passes with live push updates." },
];

export const AI_TOOLS = [
  { icon: Bot, title: "Agent Builder", desc: "Design autonomous AI agents that reason step by step, call tools, and complete multi-step tasks without a human in the loop." },
  { icon: Database, title: "Knowledge Base (RAG)", desc: "Upload docs, URLs, and files — chatbots embed and retrieve the right context automatically, powered by pgvector." },
  { icon: Plug, title: "MCP Servers", desc: "Connect Model Context Protocol servers so your agents can discover and call external tools and APIs on the fly." },
  { icon: Mic, title: "Voice Lab", desc: "Give your agents a natural voice for phone and in-app voice interactions." },
  { icon: Monitor, title: "Browser Agent", desc: "Let AI agents navigate the web and complete tasks on your behalf, autonomously." },
];

export const STEPS = [
  { n: "01", title: "Connect your channels", desc: "Link your website, WhatsApp, Instagram, and voice lines in minutes." },
  { n: "02", title: "Train your AI", desc: "Upload your knowledge base and let ChatCraft learn your business." },
  { n: "03", title: "Automate & grow", desc: "Launch flows, sequences, and campaigns that run without you." },
];

export const STATS = [
  { value: "7", label: "AI providers — Claude, GPT, Gemini, Grok & more" },
  { value: "20+", label: "Built-in tools, from chatbots to wallet passes" },
  { value: "Free", label: "Plan to start, no card required" },
  { value: "14-day", label: "Money-back guarantee on paid plans" },
];

export const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "/pricing", label: "Pricing" },
];
