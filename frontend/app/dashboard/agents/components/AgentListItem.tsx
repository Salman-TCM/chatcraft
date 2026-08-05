"use client";

import { useRouter } from "next/navigation";
import {
  Play, Settings, Trash2, Circle, Zap, MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  tools: Record<string, boolean>;
  is_active: boolean;
  max_steps: number;
  share_enabled: boolean;
  share_token: string | null;
  created_at: string;
  memory_enabled: boolean;
}

interface AgentListItemProps {
  agent: Agent;
  onDelete: (id: string) => void;
}

function modelShortName(model: string): string {
  if (model.startsWith("claude-opus")) return "Opus";
  if (model.startsWith("claude-sonnet")) return "Sonnet";
  if (model.startsWith("claude-haiku")) return "Haiku";
  if (model.startsWith("gpt-4o-mini")) return "GPT-4o mini";
  if (model.startsWith("gpt-4o")) return "GPT-4o";
  if (model.startsWith("gemini")) return model.replace("gemini-", "Gemini ");
  return model;
}

export function AgentListItem({ agent, onDelete }: AgentListItemProps) {
  const router = useRouter();
  
  const enabledToolsCount = Object.values(agent.tools).filter(Boolean).length;
  
  const handleRun = () => {
    router.push(`/dashboard/agents/run/${agent.id}`);
  };

  const handleConfigure = () => {
    router.push(`/dashboard/agents/configure/${agent.id}`);
  };

  const handleDelete = () => {
    if (confirm(`Delete agent "${agent.name}"? This action cannot be undone.`)) {
      onDelete(agent.id);
    }
  };

  const copyShareLink = () => {
    if (agent.share_token) {
      navigator.clipboard.writeText(`${window.location.origin}/agent/${agent.share_token}`);
    }
  };

  return (
    <div className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-medium text-lg truncate">{agent.name}</h3>
            <Circle
              className={`h-2 w-2 fill-current ${
                agent.is_active ? "text-green-600" : "text-gray-400"
              }`}
            />
            <span className="text-xs text-muted-foreground">
              {agent.is_active ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Description */}
          {agent.description && (
            <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
              {agent.description}
            </p>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
            <span>{modelShortName(agent.model)}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <Zap className="h-3 w-3" />
              {agent.max_steps} turns
            </span>
            {enabledToolsCount > 0 && (
              <>
                <span>•</span>
                <span>{enabledToolsCount} tools</span>
              </>
            )}
            {agent.memory_enabled && (
              <>
                <span>•</span>
                <span>Memory</span>
              </>
            )}
          </div>

          {/* Tools */}
          {enabledToolsCount > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {Object.entries(agent.tools)
                .filter(([, enabled]) => enabled)
                .slice(0, 6)
                .map(([tool]) => (
                  <Badge key={tool} variant="outline" className="text-xs">
                    {tool.replace(/_/g, " ")}
                  </Badge>
                ))}
              {enabledToolsCount > 6 && (
                <Badge variant="outline" className="text-xs">
                  +{enabledToolsCount - 6} more
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-4">
          <Button
            onClick={handleRun}
            disabled={!agent.is_active}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            <Play className="h-4 w-4 mr-2" />
            Run
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleConfigure}>
                <Settings className="h-4 w-4 mr-2" />
                Configure
              </DropdownMenuItem>
              
              {agent.share_enabled && agent.share_token && (
                <DropdownMenuItem onClick={copyShareLink}>
                  Copy Share Link
                </DropdownMenuItem>
              )}
              
              <DropdownMenuItem
                onClick={() => window.open(`/agent/${agent.share_token}`, "_blank")}
                disabled={!agent.share_token}
              >
                Open Preview
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={handleDelete} className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}