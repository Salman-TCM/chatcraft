"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Bot, Brain, Check, ChevronRight,
  Code2, Globe, Link2, Mail, Sparkles, Wand2, Zap,
  Chrome, Sheet, Smartphone, ShieldCheck, Loader2,
  BookOpen, Rocket, Search, Database, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { apiClient } from "@/lib/api";

type Step = "template" | "basics" | "model" | "tools" | "instructions";

const TEMPLATES = [
  {
    id: "research",
    icon: Search,
    title: "Research Assistant",
    description: "Searches web, analyzes sources, creates summaries",
    color: "bg-blue-100 text-blue-600",
    borderColor: "border-blue-200",
    model: "claude-sonnet-4-6",
    tools: { web_search: true, browser: true },
    instructions: `You are a research assistant. When given a topic:
1. Search the web for recent, authoritative sources
2. Visit the top 3-5 most relevant results
3. Extract and synthesize key information
4. Provide a structured summary with:
   - Key findings
   - Important details and context
   - Cited sources with links
Always prefer primary sources and verify information across multiple sources.`,
  },
  {
    id: "data",
    icon: Database,
    title: "Data Analyst",
    description: "Processes data, runs calculations, generates insights",
    color: "bg-purple-100 text-purple-600",
    borderColor: "border-purple-200",
    model: "claude-sonnet-4-6",
    tools: { code: true },
    instructions: `You are a data analyst. Use Python code to:
1. Process and analyze data provided by users
2. Calculate statistics and identify patterns
3. Generate clear visualizations when helpful
4. Present findings with:
   - Key metrics and insights
   - Statistical significance
   - Clear explanations
Always validate inputs and handle edge cases gracefully.`,
  },
  {
    id: "api",
    icon: Link2,
    title: "API Integrator",
    description: "Connects to APIs, fetches data, processes responses",
    color: "bg-green-100 text-green-600",
    borderColor: "border-green-200",
    model: "claude-sonnet-4-6",
    tools: { http: true, code: true },
    instructions: `You are an API integration specialist. When working with APIs:
1. Make HTTP requests to fetch data from external services
2. Parse and validate API responses
3. Transform data into useful formats
4. Handle errors gracefully with clear messages
Always check response status codes and provide helpful error context.`,
  },
  {
    id: "automation",
    icon: Zap,
    title: "Task Automator",
    description: "Automates workflows with multiple tools",
    color: "bg-amber-100 text-amber-600",
    borderColor: "border-amber-200",
    model: "claude-sonnet-4-6",
    tools: { web_search: true, code: true, http: true },
    instructions: `You are a task automation agent. Help users by:
1. Breaking down complex tasks into steps
2. Using appropriate tools for each step
3. Connecting results between operations
4. Providing clear status updates
Always confirm understanding before executing multi-step workflows.`,
  },
  {
    id: "custom",
    icon: Wand2,
    title: "Custom Agent",
    description: "Start from scratch with your own configuration",
    color: "bg-gray-100 text-gray-600",
    borderColor: "border-gray-200",
    model: "claude-sonnet-4-6",
    tools: {},
    instructions: "",
  },
];

const MODELS = [
  {
    value: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    description: "Best balance of speed, cost, and capability",
    badge: "Recommended",
    color: "bg-indigo-100 text-indigo-700",
  },
  {
    value: "claude-opus-4-7",
    label: "Claude Opus 4.7",
    description: "Most capable for complex reasoning",
    badge: "Premium",
    color: "bg-purple-100 text-purple-700",
  },
  {
    value: "claude-haiku-4-5-20251001",
    label: "Claude Haiku 4.5",
    description: "Fastest and most affordable",
    badge: "Fast",
    color: "bg-green-100 text-green-700",
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    description: "OpenAI's flagship with vision",
    badge: "Vision",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    value: "gpt-4o-mini",
    label: "GPT-4o Mini",
    description: "Cost-effective GPT variant",
    badge: "Budget",
    color: "bg-teal-100 text-teal-700",
  },
];

const TOOLS = [
  {
    key: "web_search",
    label: "Web Search",
    icon: Globe,
    description: "Search the internet for current information",
    category: "research",
  },
  {
    key: "browser",
    label: "Browser",
    icon: Chrome,
    description: "Visit web pages and extract content",
    category: "research",
  },
  {
    key: "code",
    label: "Code Execution",
    icon: Code2,
    description: "Run Python code for calculations and processing",
    category: "compute",
  },
  {
    key: "http",
    label: "HTTP Requests",
    icon: Link2,
    description: "Make API calls to external services",
    category: "integration",
  },
  {
    key: "sheets",
    label: "Google Sheets",
    icon: Sheet,
    description: "Read and write spreadsheet data",
    category: "integration",
  },
  {
    key: "email",
    label: "Email",
    icon: Mail,
    description: "Send emails via configured service",
    category: "communication",
  },
  {
    key: "sms",
    label: "SMS",
    icon: Smartphone,
    description: "Send text messages via Twilio",
    category: "communication",
  },
];

export default function NewAgentPage() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [currentStep, setCurrentStep] = useState<Step>("template");
  
  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [model, setModel] = useState("claude-sonnet-4-6");
  const [tools, setTools] = useState<Record<string, boolean>>({});
  const [instructions, setInstructions] = useState("");

  const steps: Step[] = ["template", "basics", "model", "tools", "instructions"];
  const currentIndex = steps.indexOf(currentStep);

  function selectTemplate(templateId: string) {
    setSelectedTemplate(templateId);
    const template = TEMPLATES.find(t => t.id === templateId);
    if (template) {
      if (templateId !== "custom") {
        setModel(template.model);
        setTools(template.tools);
        setInstructions(template.instructions);
      }
      setCurrentStep("basics");
    }
  }

  function goBack() {
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1]);
    } else {
      router.back();
    }
  }

  function goNext() {
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1]);
    }
  }

  async function createAgent() {
    if (!name.trim()) return;
    
    setCreating(true);
    try {
      const { data } = await apiClient.post("/api/v1/agents", {
        name: name.trim(),
        description: description.trim() || null,
        model,
        tools,
        instructions: instructions.trim() || null,
        max_steps: 10,
        memory_enabled: false,
        is_active: true,
      });
      router.push(`/dashboard/agents/${data.data.id}?created=true`);
    } catch (error) {
      console.error("Failed to create agent:", error);
      setCreating(false);
    }
  }

  const isValid = () => {
    switch (currentStep) {
      case "template": return selectedTemplate !== null;
      case "basics": return name.trim().length > 0;
      case "model": return true;
      case "tools": return true;
      case "instructions": return true;
      default: return false;
    }
  };

  const selectedTemplateData = TEMPLATES.find(t => t.id === selectedTemplate);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="mx-auto max-w-4xl p-6">
        
        {/* Header */}
        <div className="mb-8">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to agents
          </Button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100">
              <Sparkles className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">Create New Agent</h1>
              <p className="text-sm text-muted-foreground">
                Configure your AI agent with tools and instructions
              </p>
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            {steps.map((step, idx) => (
              <div key={step} className="flex items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-all ${
                    idx <= currentIndex
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {idx < currentIndex ? <Check className="h-4 w-4" /> : idx + 1}
                </div>
                {idx < steps.length - 1 && (
                  <div
                    className={`h-0.5 w-20 transition-all ${
                      idx < currentIndex ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Template</span>
            <span>Basics</span>
            <span>Model</span>
            <span>Tools</span>
            <span>Instructions</span>
          </div>
        </div>

        {/* Step content */}
        <Card className="p-6 mb-6">
          {currentStep === "template" && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Choose a template</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Start with a pre-configured template or build from scratch
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => selectTemplate(template.id)}
                    className={`flex items-start gap-3 rounded-lg border-2 p-4 text-left transition-all hover:shadow-md ${
                      selectedTemplate === template.id
                        ? `${template.borderColor} bg-opacity-5`
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${template.color}`}>
                      <template.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{template.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {template.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {currentStep === "basics" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Basic information</h2>
                <p className="text-sm text-muted-foreground">
                  Give your agent a name and description
                </p>
              </div>
              
              {selectedTemplateData && selectedTemplateData.id !== "custom" && (
                <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selectedTemplateData.color}`}>
                    <selectedTemplateData.icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Using {selectedTemplateData.title} template</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pre-configured with tools and instructions
                    </p>
                  </div>
                </div>
              )}
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Agent Name <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder="e.g., Market Research Assistant"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="text-lg"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    Choose a descriptive name for your agent
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label>Description <span className="text-muted-foreground text-xs">(optional)</span></Label>
                  <Textarea
                    placeholder="Briefly describe what this agent does and when to use it..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[100px] resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Help users understand your agent's capabilities
                  </p>
                </div>
              </div>
            </div>
          )}

          {currentStep === "model" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Select AI model</h2>
                <p className="text-sm text-muted-foreground">
                  Choose the language model that powers your agent
                </p>
              </div>
              
              <div className="space-y-3">
                {MODELS.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setModel(m.value)}
                    className={`w-full flex items-center gap-4 rounded-lg border-2 p-4 text-left transition-all ${
                      model === m.value
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Brain className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{m.label}</p>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${m.color}`}>
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {m.description}
                      </p>
                    </div>
                    <div className={`h-4 w-4 rounded-full border-2 ${
                      model === m.value
                        ? "border-primary bg-primary"
                        : "border-muted-foreground/30"
                    }`}>
                      {model === m.value && (
                        <Check className="h-3 w-3 text-primary-foreground" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
              
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-xs font-medium mb-2">Model recommendations</p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  <li>• <strong>Sonnet 4.6</strong>: Best for most agents</li>
                  <li>• <strong>Opus 4.7</strong>: Complex multi-step tasks</li>
                  <li>• <strong>Haiku 4.5</strong>: Simple, high-volume tasks</li>
                  <li>• <strong>GPT-4o</strong>: When you need vision capabilities</li>
                </ul>
              </div>
            </div>
          )}

          {currentStep === "tools" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">Enable tools</h2>
                <p className="text-sm text-muted-foreground">
                  Select the tools your agent can use to complete tasks
                </p>
              </div>
              
              <div className="space-y-4">
                {["research", "compute", "integration", "communication"].map((category) => (
                  <div key={category}>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
                      {category}
                    </p>
                    <div className="space-y-2">
                      {TOOLS.filter(t => t.category === category).map((tool) => (
                        <button
                          key={tool.key}
                          onClick={() => setTools(prev => ({ ...prev, [tool.key]: !prev[tool.key] }))}
                          className={`w-full flex items-center gap-3 rounded-lg border p-3 transition-all ${
                            tools[tool.key]
                              ? "border-primary/40 bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            tools[tool.key]
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            <tool.icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-medium">{tool.label}</p>
                            <p className="text-xs text-muted-foreground">
                              {tool.description}
                            </p>
                          </div>
                          <div className={`h-4 w-4 rounded-full border-2 ${
                            tools[tool.key]
                              ? "border-primary bg-primary"
                              : "border-muted-foreground/30"
                          }`}>
                            {tools[tool.key] && (
                              <Check className="h-2.5 w-2.5 text-primary-foreground" />
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              {Object.values(tools).filter(Boolean).length === 0 && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <p className="text-sm text-amber-800">
                    No tools selected — agent will only use its knowledge and instructions
                  </p>
                </div>
              )}
            </div>
          )}

          {currentStep === "instructions" && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-semibold mb-2">System instructions</h2>
                <p className="text-sm text-muted-foreground">
                  Define how your agent should behave and respond
                </p>
              </div>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea
                    placeholder={`Example instructions:

You are a helpful assistant. When responding:
1. Be concise and clear
2. Use the tools available to gather information
3. Cite sources when providing facts
4. Ask for clarification if the request is ambiguous

Always maintain a professional and friendly tone.`}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    className="min-h-[300px] font-mono text-sm resize-none"
                  />
                  <p className="text-xs text-muted-foreground">
                    Be specific about how the agent should use its tools and format responses
                  </p>
                </div>
                
                {selectedTemplateData && selectedTemplateData.id !== "custom" && instructions && (
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-xs font-medium mb-2 flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      Pre-filled from template
                    </p>
                    <p className="text-xs text-muted-foreground">
                      These instructions were added from the {selectedTemplateData.title} template. 
                      You can modify them to fit your specific needs.
                    </p>
                  </div>
                )}
              </div>
              
              {/* Summary */}
              <div className="rounded-lg bg-primary/5 border border-primary/20 p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-2">
                  <Rocket className="h-4 w-4 text-primary" />
                  Agent Summary
                </p>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span className="font-medium">{name || "Not set"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Model:</span>
                    <span className="font-medium">{MODELS.find(m => m.value === model)?.label}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tools enabled:</span>
                    <span className="font-medium">{Object.values(tools).filter(Boolean).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Template:</span>
                    <span className="font-medium">{selectedTemplateData?.title || "None"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Navigation */}
        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={goBack}
            disabled={creating}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            {currentStep === "template" ? "Cancel" : "Back"}
          </Button>
          
          {currentStep === "instructions" ? (
            <Button
              onClick={createAgent}
              disabled={!isValid() || creating}
            >
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-1" />
                  Create Agent
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={goNext}
              disabled={!isValid()}
            >
              Next
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}