"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Save, Loader2, Check, X, Settings, 
  Brain, Zap, Terminal, Webhook,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

const MODELS = [
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", recommended: true },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
];

const TOOLS = [
  { key: "web_search", label: "Web Search", description: "Search the internet" },
  { key: "browser", label: "Browser", description: "Visit web pages" },
  { key: "code", label: "Code Execution", description: "Run Python code" },
  { key: "http", label: "HTTP Requests", description: "Call external APIs" },
  { key: "sheets", label: "Google Sheets", description: "Read/write spreadsheets" },
  { key: "email", label: "Email", description: "Send emails" },
  { key: "sms", label: "SMS", description: "Send text messages" },
  { key: "verification", label: "Verification", description: "OTP verification" },
  { key: "agent_builder", label: "Agent Builder", description: "Create other agents" },
];

export default function ConfigureAgentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    model: "claude-sonnet-4-6",
    instructions: "",
    memory_enabled: false,
    max_steps: 10,
    is_active: true,
    webhook_url: "",
    tools: {} as Record<string, boolean>,
  });

  useEffect(() => {
    loadAgent();
  }, [id]);

  const loadAgent = async () => {
    try {
      const response = await apiClient.get(`/api/v1/agents/${id}`);
      const agentData = response.data.data;
      setAgent(agentData);
      setFormData({
        name: agentData.name,
        description: agentData.description || "",
        model: agentData.model,
        instructions: agentData.instructions || "",
        memory_enabled: agentData.memory_enabled,
        max_steps: agentData.max_steps,
        is_active: agentData.is_active,
        webhook_url: agentData.webhook_url || "",
        tools: agentData.tools || {},
      });
    } catch (error) {
      router.push("/dashboard/agents");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiClient.put(`/api/v1/agents/${id}`, {
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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (error) {
      console.error("Failed to save agent:", error);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleTool = (toolKey: string) => {
    setFormData(prev => ({
      ...prev,
      tools: { ...prev.tools, [toolKey]: !prev.tools[toolKey] },
    }));
  };

  if (loading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const enabledToolsCount = Object.values(formData.tools).filter(Boolean).length;

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Configure Agent</h1>
            <p className="text-muted-foreground">{formData.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => router.push(`/dashboard/agents/run/${id}`)}
            variant="outline"
          >
            <Terminal className="h-4 w-4 mr-2" />
            Run Agent
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : saved ? (
              <Check className="h-4 w-4 mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      <div className="space-y-8">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Basic Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  placeholder="Agent name"
                />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => updateField("is_active", checked)}
                  />
                  <span className="text-sm">
                    {formData.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => updateField("description", e.target.value)}
                placeholder="What does this agent do?"
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Model Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Model & Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Model</Label>
                <Select value={formData.model} onValueChange={(value) => updateField("model", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODELS.map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label} {model.recommended && "(Recommended)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Max Steps (1-30)</Label>
                <Input
                  type="number"
                  min={1}
                  max={30}
                  value={formData.max_steps}
                  onChange={(e) => updateField("max_steps", parseInt(e.target.value) || 1)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={formData.memory_enabled}
                  onCheckedChange={(checked) => updateField("memory_enabled", checked)}
                />
                <Label>Persistent Memory</Label>
              </div>
              <p className="text-sm text-muted-foreground">
                Agent remembers context across conversations
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Tools */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Tools ({enabledToolsCount} enabled)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {TOOLS.map((tool) => (
                <div key={tool.key} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium text-sm">{tool.label}</p>
                    <p className="text-xs text-muted-foreground">{tool.description}</p>
                  </div>
                  <Switch
                    checked={formData.tools[tool.key] || false}
                    onCheckedChange={() => toggleTool(tool.key)}
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle>Instructions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>System Prompt</Label>
              <Textarea
                value={formData.instructions}
                onChange={(e) => updateField("instructions", e.target.value)}
                placeholder="Define how the agent should behave..."
                rows={12}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Specify how the agent should use its tools and respond to users
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Advanced */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              Advanced
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                value={formData.webhook_url}
                onChange={(e) => updateField("webhook_url", e.target.value)}
                placeholder="https://your-server.com/webhook"
                type="url"
              />
              <p className="text-xs text-muted-foreground">
                Receive POST notifications after each agent run
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Save button at bottom */}
      <div className="flex justify-end mt-8 pt-6 border-t">
        <Button onClick={handleSave} disabled={saving} size="lg">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : saved ? (
            <Check className="h-4 w-4 mr-2" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {saved ? "Saved!" : "Save Configuration"}
        </Button>
      </div>
    </div>
  );
}