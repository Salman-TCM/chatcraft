"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChatWindow } from "@/components/chat/chat-window";
import { ConversationSidebar } from "@/components/chat/conversation-sidebar";
import { apiClient } from "@/lib/api";
import type { ChatbotConfig } from "@/components/chat/types";

export default function ChatPage() {
  const { chatbotId } = useParams<{ chatbotId: string }>();
  const [chatbot, setChatbot] = useState<ChatbotConfig | null>(null);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadChatbot();
  }, [chatbotId]);

  async function loadChatbot() {
    try {
      const { data } = await apiClient.get(`/api/chatbots/${chatbotId}`);
      const b = data.data;
      setChatbot({
        id: b.id,
        name: b.name,
        defaultModel: b.default_model,
        fallbackModel: b.fallback_model,
        allowModelSwitch: b.allow_model_switch,
        published: b.published,
        systemPrompt: b.system_prompt,
        logoUrl: b.logo_url ?? null,
        primaryColour: b.primary_colour ?? "#6366f1",
        secondaryColour: b.secondary_colour ?? "#8b5cf6",
        backgroundColour: b.background_colour ?? "#ffffff",
        fontFamily: b.font_family ?? "Inter",
        welcomeMessage: b.welcome_message ?? null,
        placeholderText: b.placeholder_text ?? "Type a message…",
        bubbleStyle: b.bubble_style ?? "rounded",
        darkMode: b.dark_mode ?? false,
        ttsEnabled: b.tts_enabled ?? false,
        sttEnabled: b.stt_enabled ?? false,
        autoPlayTts: b.auto_play_tts ?? false,
        voiceId: b.voice_id ?? null,
        voiceStability: b.voice_stability ?? 0.5,
        voiceSimilarityBoost: b.voice_similarity_boost ?? 0.75,
      });
    } catch {
      setError("Chatbot not found or unavailable.");
    }
  }

  const handleNewConversation = useCallback(() => {
    setActiveConvId(null);
    setSidebarOpen(false);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id);
    setSidebarOpen(false);
  }, []);

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConvId(id);
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!chatbot) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always shown on md+, slide-in on mobile */}
      <div
        className={`
          fixed inset-y-0 left-0 z-30 transition-transform duration-200
          md:relative md:translate-x-0
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}
      >
        <ConversationSidebar
          chatbotId={chatbotId}
          activeId={activeConvId}
          onSelect={handleSelectConversation}
          onNew={handleNewConversation}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="flex items-center gap-2 border-b px-3 py-2 md:hidden">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
          <span className="text-sm font-medium truncate">{chatbot.name}</span>
        </div>

        <ChatWindow
          chatbot={chatbot}
          initialConversationId={activeConvId}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    </div>
  );
}
