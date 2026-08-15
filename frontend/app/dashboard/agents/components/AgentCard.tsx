"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bot, Play, Settings, Eye, Trash2, Circle, Zap, 
  Globe, Code2, Chrome, Link2, Sheet, Mail, 
  Smartphone, ShieldCheck, MoreVertical, 
  Pause, Copy, Share2, BarChart3, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { AgentConfigModal } from "./AgentConfigModal";
import { AgentRunModal } from "./AgentRunModal";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  tools: Record<string, boolean>;
  instructions: string | null;
  webhook_url: string | null;
  welcome_message: string | null;
  suggestions_enabled: boolean;
  is_published: boolean;
  is_active: boolean;
  max_steps: number;
  share_enabled: boolean;
  share_token: string | null;
  created_at: string;
  memory_enabled: boolean;
  last_run_at?: string;
  total_runs?: number;
}

interface AgentCardProps {
  agent: Agent;
  onDelete: (id: string) => void;
  onUpdate: (agent: Agent) => void;
}

const TOOL_META: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  web_search: { icon: Globe, label: "Web Search", color: "text-blue-500" },
  browser: { icon: Chrome, label: "Browser", color: "text-orange-500" },
  code: { icon: Code2, label: "Code", color: "text-purple-500" },
  http: { icon: Link2, label: "HTTP", color: "text-green-500" },
  sheets: { icon: Sheet, label: "Sheets", color: "text-emerald-500" },
  email: { icon: Mail, label: "Email", color: "text-rose-500" },
  sms: { icon: Smartphone, label: "SMS", color: "text-violet-500" },
  verification: { icon: ShieldCheck, label: "Verification", color: "text-amber-500" },
  agent_builder: { icon: Bot, label: "Agent Builder", color: "text-sky-500" },
};

function modelShortName(model: string) {
  if (model.startsWith("claude-opus")) return "Opus";
  if (model.startsWith("claude-sonnet")) return "Sonnet";
  if (model.startsWith("claude-haiku")) return "Haiku";
  if (model.startsWith("gpt-4o-mini")) return "GPT-4o mini";
  if (model.startsWith("gpt-4o")) return "GPT-4o";
  if (model.startsWith("gemini")) return model.replace("gemini-", "Gemini ");
  return model;
}

function modelBadgeColor(model: string) {
  if (model.startsWith("claude")) return "bg-indigo-100 text-indigo-700 border-indigo-200";
  if (model.startsWith("gpt")) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (model.startsWith("gemini")) return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-muted text-muted-foreground border-muted-foreground/20";
}

export function AgentCard({ agent, onDelete, onUpdate }: AgentCardProps) {
  const router = useRouter();
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showRunModal, setShowRunModal] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const enabledTools = Object.entries(agent.tools).filter(([, v]) => v);
  const toolCount = enabledTools.length;

  const handleRun = () => {
    setShowRunModal(true);
  };

  const handleConfigure = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowConfigModal(true);
  };

  const handlePreview = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (agent.share_token) {
      window.open(`/agent/${agent.share_token}`, "_blank");
    } else {
      setShowConfigModal(true);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Delete "${agent.name}"? This cannot be undone.`)) {
      onDelete(agent.id);
    }
  };

  const copyShareLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (agent.share_token) {
      navigator.clipboard.writeText(`${window.location.origin}/agent/${agent.share_token}`);
    }
  };

  const formatLastRun = (lastRunAt?: string) => {
    if (!lastRunAt) return "Never run";
    const date = new Date(lastRunAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <Card className="group relative overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-1 bg-gradient-to-br from-white to-gray-50/50">
        {/* Status indicator */}
        <div className={`absolute top-0 left-0 right-0 h-1 ${
          agent.is_active ? "bg-gradient-to-r from-green-400 to-green-500" : "bg-gray-200"
        }`} />

        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-all ${
                agent.is_active 
                  ? "bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg" 
                  : "bg-gray-100"
              }`}>
                <Bot className={`h-6 w-6 ${
                  agent.is_active ? "text-white" : "text-gray-400"
                }`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 truncate">{agent.name}</h3>
                  <Circle className={`h-2 w-2 fill-current shrink-0 ${
                    agent.is_active ? "text-green-500" : "text-gray-300"
                  }`} />
                </div>
                <p className="text-sm text-gray-500 line-clamp-2 mb-2">
                  {agent.description || "No description provided"}
                </p>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock className="h-3 w-3" />
                  <span>{formatLastRun(agent.last_run_at)}</span>
                  {agent.total_runs && (
                    <>
                      <span>•</span>
                      <span>{agent.total_runs} runs</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Actions dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleConfigure}>
                  <Settings className="h-4 w-4 mr-2" />
                  Configure
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePreview}>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </DropdownMenuItem>
                {agent.share_token && (
                  <DropdownMenuItem onClick={copyShareLink}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Link
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => router.push(`/dashboard/agents/${agent.id}?tab=analytics`)}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Analytics
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleDelete}
                  className="text-red-600 focus:text-red-600"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Model and settings */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className={modelBadgeColor(agent.model)}>
              {modelShortName(agent.model)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              {agent.max_steps} steps
            </Badge>
            {agent.memory_enabled && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                Memory
              </Badge>
            )}
            {agent.share_enabled && (
              <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                <Share2 className="h-3 w-3 mr-1" />
                Shared
              </Badge>
            )}
          </div>

          {/* Tools */}
          {toolCount > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {enabledTools.slice(0, 4).map(([key]) => {
                const meta = TOOL_META[key];
                if (!meta) return null;
                const Icon = meta.icon;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-1 px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                    title={meta.label}
                  >
                    <Icon className={`h-3 w-3 ${meta.color}`} />
                    <span className="text-xs font-medium">{meta.label}</span>
                  </div>
                );
              })}
              {toolCount > 4 && (
                <div className="flex items-center px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                  <span className="text-xs font-medium">+{toolCount - 4} more</span>
                </div>
              )}
            </div>
          ) : (
            <div className="text-xs text-gray-400 italic">No tools configured</div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleRun}
              disabled={!agent.is_active || isRunning}
              className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white border-0 shadow-md hover:shadow-lg transition-all"
            >
              {isRunning ? (
                <>
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                  Running...
                </>
              ) : agent.is_active ? (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Run Agent
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Inactive
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleConfigure}
              className="px-3 hover:bg-gray-50"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Modals */}
      <AgentConfigModal
        agent={agent}
        open={showConfigModal}
        onClose={() => setShowConfigModal(false)}
        onUpdate={onUpdate}
      />
      
      <AgentRunModal
        agent={agent}
        open={showRunModal}
        onClose={() => setShowRunModal(false)}
        isRunning={isRunning}
        setIsRunning={setIsRunning}
      />
    </>
  );
}