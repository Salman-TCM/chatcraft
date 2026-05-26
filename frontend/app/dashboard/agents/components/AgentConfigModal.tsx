"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bot, Globe, Code2, Chrome, Link2, Sheet, Mail, 
  Smartphone, ShieldCheck, Loader2, Check, X,
  Brain, Zap, Settings, Database,
} from "lucide-react";
import { apiClient } from "@/lib/api";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  tools: Record<string, boolean>;
  instructions: string | null;
  memory_enabled: boolean;
  max_steps: number;
  is_active: boolean;
  webhook_url: string | null;
}

interface AgentConfigModalProps {
  agent: Agent;
  open: boolean;
  onClose: () => void;
  onUpdate: (agent: Agent) => void;
}

interface ToolConfig {
  key: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  category: "research" | "compute" | "integration" | "communication" | "meta";
}

const TOOLS: ToolConfig[] = [
  {
    key: "web_search",
    label: "Web Search",
    description: "Search the internet for current information",
    icon: Globe,
    category: "research",
  },
  {
    key: "browser",
    label: "Browser",
    description: "Visit and extract content from web pages",
    icon: Chrome,
    category: "research",
  },
  {
    key: "code",
    label: "Code Execution",
    description: "Execute Python code for calculations and data processing",
    icon: Code2,
    category: "compute",
  },
  {
    key: "http",
    label: "HTTP Requests",
    description: "Make API calls to external services",
    icon: Link2,
    category: "integration",
  },
  {
    key: "sheets",
    label: "Google Sheets",
    description: "Read and write spreadsheet data",
    icon: Sheet,
    category: "integration",
  },
  {
    key: "email",
    label: "Email",
    description: "Send emails via configured service",
    icon: Mail,
    category: "communication",
  },
  {
    key: "sms",
    label: "SMS",
    description: "Send text messages via Twilio",
    icon: Smartphone,
    category: "communication",
  },
  {
    key: "verification",
    label: "Verification",
    description: "Send and verify OTP codes",
    icon: ShieldCheck,
    category: "communication",
  },
  {
    key: "agent_builder",
    label: "Agent Builder",
    description: "Create and manage other agents",
    icon: Bot,
    category: "meta",
  },
];

const MODELS = [
  {
    value: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    description: "Optimal balance of capability and efficiency",
    recommended: true,
  },
  {
    value: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    description: "Highest capability for complex reasoning",
    recommended: false,
  },
  {
    value: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Fast and cost-effective for simple tasks",
    recommended: false,
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    description: "OpenAI's flagship model with vision capabilities",
    recommended: false,
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    description: "Smaller, faster GPT variant",
    recommended: false,
  },
];

export function AgentConfigModal({ agent, open, onClose, onUpdate }: AgentConfigModalProps) {
  // Form state
  const [formData, setFormData] = useState({
    name: agent.name,
    description: agent.description || "",
    model: agent.model,
    instructions: agent.instructions || "",
    memory_enabled: agent.memory_enabled,
    max_steps: agent.max_steps,
    is_active: agent.is_active,
    webhook_url: agent.webhook_url || "",
    tools: { ...agent.tools },
  });

  // UI state
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("basic");

  useEffect(() => {
    if (open) {
      setFormData({
        name: agent.name,
        description: agent.description || "",
        model: agent.model,
        instructions: agent.instructions || "",
        memory_enabled: agent.memory_enabled,
        max_steps: agent.max_steps,
        is_active: agent.is_active,
        webhook_url: agent.webhook_url || "",
        tools: { ...agent.tools },
      });
      setErrors({});
      setActiveTab("basic");
    }
  }, [agent, open]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Agent name is required";
    }

    if (formData.max_steps < 1 || formData.max_steps > 30) {
      newErrors.max_steps = "Max steps must be between 1 and 30";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      const response = await apiClient.put(`/api/v1/agents/${agent.id}`, {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        model: formData.model,
        instructions: formData.instructions.trim() || null,
        memory_enabled: formData.memory_enabled,
        max_steps: formData.max_steps,
        is_active: formData.is_active,
        webhook_url: formData.webhook_url.trim() || null,
        tools: formData.tools,
      });

      onUpdate(response.data.data);
      onClose();
    } catch (error) {
      console.error("Failed to update agent:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleToolToggle = (toolKey: string) => {
    setFormData(prev => ({
      ...prev,
      tools: {
        ...prev.tools,
        [toolKey]: !prev.tools[toolKey],
      },
    }));
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: "" }));
    }
  };

  const groupedTools = TOOLS.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<string, ToolConfig[]>);

  const enabledToolsCount = Object.values(formData.tools).filter(Boolean).length;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Configure Agent
          </DialogTitle>
          <DialogDescription>
            Modify your agent&apos;s settings, tools, and behavior
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden">
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="basic">Basic</TabsTrigger>
            <TabsTrigger value="model">Model</TabsTrigger>
            <TabsTrigger value="tools">
              Tools {enabledToolsCount > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 px-1 text-xs">
                  {enabledToolsCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="advanced">Advanced</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto mt-4">
            <TabsContent value="basic" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Enter agent name"
                    className={errors.name ? "border-red-500" : ""}
                  />
                  {errors.name && (
                    <p className="text-sm text-red-500">{errors.name}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => updateField("description", e.target.value)}
                    placeholder="Describe what this agent does"
                    className="min-h-[100px]"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="instructions">Instructions</Label>
                  <Textarea
                    id="instructions"
                    value={formData.instructions}
                    onChange={(e) => updateField("instructions", e.target.value)}
                    placeholder="Define how the agent should behave"
                    className="min-h-[200px] font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    Specify how the agent should use its tools and respond to users
                  </p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="model" className="space-y-6 mt-0">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>AI Model</Label>
                  <Select value={formData.model} onValueChange={(value) => updateField("model", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MODELS.map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          <div className="flex items-center gap-2">
                            <span>{model.label}</span>
                            {model.recommended && (
                              <Badge variant="secondary" className="text-xs">Recommended</Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {MODELS.find(m => m.value === formData.model)?.description && (
                    <p className="text-xs text-muted-foreground">
                      {MODELS.find(m => m.value === formData.model)?.description}
                    </p>
                  )}
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Model Comparison</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {MODELS.map((model) => (
                      <div
                        key={model.value}
                        className={`flex items-center justify-between p-2 rounded-lg border ${
                          formData.model === model.value ? "border-blue-500 bg-blue-50" : ""
                        }`}
                      >
                        <div>
                          <p className="font-medium text-sm">{model.label}</p>
                          <p className="text-xs text-muted-foreground">{model.description}</p>
                        </div>
                        {model.recommended && (
                          <Badge variant="secondary">Recommended</Badge>
                        )}
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="tools" className="space-y-6 mt-0">
              {Object.entries(groupedTools).map(([category, tools]) => (
                <Card key={category}>
                  <CardHeader>
                    <CardTitle className="text-sm capitalize flex items-center gap-2">
                      {category === "research" && <Globe className="h-4 w-4" />}
                      {category === "compute" && <Code2 className="h-4 w-4" />}
                      {category === "integration" && <Link2 className="h-4 w-4" />}
                      {category === "communication" && <Mail className="h-4 w-4" />}
                      {category === "meta" && <Bot className="h-4 w-4" />}
                      {category} Tools
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {tools.map((tool) => (
                      <div
                        key={tool.key}
                        className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <tool.icon className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="font-medium text-sm">{tool.label}</p>
                            <p className="text-xs text-muted-foreground">{tool.description}</p>
                          </div>
                        </div>
                        <Switch
                          checked={formData.tools[tool.key] || false}
                          onCheckedChange={() => handleToolToggle(tool.key)}
                        />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
              
              {enabledToolsCount === 0 && (
                <Card className="border-amber-200 bg-amber-50">
                  <CardContent className="pt-6">
                    <p className="text-center text-amber-800">
                      No tools enabled. Agent will only use its knowledge and instructions.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="advanced" className="space-y-6 mt-0">
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Zap className="h-4 w-4" />
                      Execution Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="max_steps">Maximum Steps (1-30)</Label>
                      <Input
                        id="max_steps"
                        type="number"
                        min={1}
                        max={30}
                        value={formData.max_steps}
                        onChange={(e) => updateField("max_steps", parseInt(e.target.value) || 1)}
                        className={errors.max_steps ? "border-red-500" : ""}
                      />
                      {errors.max_steps && (
                        <p className="text-sm text-red-500">{errors.max_steps}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Limits how many tool calls the agent can make in one conversation
                      </p>
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Active Status</p>
                        <p className="text-xs text-muted-foreground">
                          {formData.is_active ? "Agent can accept requests" : "Agent is paused"}
                        </p>
                      </div>
                      <Switch
                        checked={formData.is_active}
                        onCheckedChange={(checked) => updateField("is_active", checked)}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      Memory Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm">Persistent Memory</p>
                        <p className="text-xs text-muted-foreground">
                          {formData.memory_enabled 
                            ? "Agent remembers context across conversations" 
                            : "Each conversation starts fresh"
                          }
                        </p>
                      </div>
                      <Switch
                        checked={formData.memory_enabled}
                        onCheckedChange={(checked) => updateField("memory_enabled", checked)}
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Integration Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="webhook_url">Webhook URL</Label>
                      <Input
                        id="webhook_url"
                        value={formData.webhook_url}
                        onChange={(e) => updateField("webhook_url", e.target.value)}
                        placeholder="https://your-server.com/webhook"
                      />
                      <p className="text-xs text-muted-foreground">
                        Receive POST notifications after each agent run
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </div>
        </Tabs>

        <div className="flex justify-between items-center pt-4 border-t">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}