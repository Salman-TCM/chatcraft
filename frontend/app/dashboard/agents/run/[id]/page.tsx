"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Send, Square, RotateCcw, Download, Copy, Settings,
  Play, Loader2, Terminal, Code, Clock, Zap, AlertTriangle,
  Minimize2, Maximize2, PanelLeftClose, PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";
import { getSession } from "next-auth/react";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  tools: Record<string, boolean>;
  instructions: string | null;
  max_steps: number;
  is_active: boolean;
}

interface Message {
  role: "user" | "assistant" | "system" | "error";
  content: string;
  timestamp: Date;
}

interface ToolExecution {
  step: number;
  tool: string;
  input: any;
  output?: string;
  status: "running" | "completed" | "failed";
  duration?: number;
  startTime: Date;
}

export default function AgentRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  
  // Agent data
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);

  // Execution state
  const [messages, setMessages] = useState<Message[]>([]);
  const [toolExecutions, setToolExecutions] = useState<ToolExecution[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  
  // UI state
  const [input, setInput] = useState("");
  const [showSidebar, setShowSidebar] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    loadAgent();
  }, [id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadAgent = async () => {
    try {
      const response = await apiClient.get(`/api/v1/agents/${id}`);
      setAgent(response.data.data);
    } catch (error) {
      router.push("/dashboard/agents");
    } finally {
      setLoading(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const stopExecution = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsRunning(false);
      addMessage("system", "Execution stopped by user");
    }
  };

  const resetConversation = () => {
    setMessages([]);
    setToolExecutions([]);
    setCurrentStep(0);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsRunning(false);
  };

  const addMessage = (role: Message["role"], content: string) => {
    setMessages(prev => [...prev, {
      role,
      content,
      timestamp: new Date(),
    }]);
  };

  const exportConversation = () => {
    const data = {
      agent: agent?.name,
      model: agent?.model,
      timestamp: new Date().toISOString(),
      messages,
      toolExecutions,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `agent-conversation-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyConversation = () => {
    const text = messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\\n\\n");
    navigator.clipboard.writeText(text);
  };

  const sendMessage = async () => {
    const userInput = input.trim();
    if (!userInput || isRunning || !agent) return;

    setInput("");
    setIsRunning(true);
    setCurrentStep(0);

    addMessage("user", userInput);

    try {
      const session = await getSession();
      const token = (session?.user as any)?.accessToken;

      if (!token) {
        addMessage("error", "Authentication required. Please refresh the page.");
        return;
      }

      abortControllerRef.current = new AbortController();
      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      const response = await fetch(`${apiBase}/api/v1/agents/${id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userInput,
          conversation_history: messages
            .filter(m => m.role === "user" || m.role === "assistant")
            .map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMessage = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const event = JSON.parse(line.slice(6));
            
            if (event.type === "text") {
              assistantMessage += event.content;
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMsg = newMessages[newMessages.length - 1];
                
                if (lastMsg?.role === "assistant") {
                  lastMsg.content = assistantMessage;
                } else {
                  newMessages.push({
                    role: "assistant",
                    content: assistantMessage,
                    timestamp: new Date(),
                  });
                }
                return newMessages;
              });
            } else if (event.type === "tool_call") {
              const step = event.step || currentStep + 1;
              setCurrentStep(step);
              
              const execution: ToolExecution = {
                step,
                tool: event.tool,
                input: event.input,
                status: "running",
                startTime: new Date(),
              };
              
              setToolExecutions(prev => [...prev, execution]);
              assistantMessage = "";
            } else if (event.type === "tool_result") {
              setToolExecutions(prev =>
                prev.map(exec =>
                  exec.step === currentStep && exec.tool === event.tool
                    ? {
                        ...exec,
                        output: event.result,
                        status: "completed",
                        duration: Date.now() - exec.startTime.getTime(),
                      }
                    : exec
                )
              );
            } else if (event.type === "error") {
              addMessage("error", event.content);
            }
          } catch (e) {
            // Ignore malformed JSON
          }
        }
      }

    } catch (error: any) {
      if (error.name !== "AbortError") {
        addMessage("error", error.message || "Network error occurred");
      }
    } finally {
      setIsRunning(false);
      setCurrentStep(0);
      abortControllerRef.current = null;
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading agent...</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Agent not found</p>
        </div>
      </div>
    );
  }

  const enabledTools = Object.entries(agent.tools).filter(([, enabled]) => enabled);

  return (
    <div className={`h-screen flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-background" : ""}`}>
      {/* Header */}
      <header className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="font-medium">{agent.name}</h1>
            <p className="text-xs text-muted-foreground">
              {agent.model} • Max {agent.max_steps} steps
              {enabledTools.length > 0 && ` • ${enabledTools.length} tools`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowSidebar(!showSidebar)}>
            {showSidebar ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(!isFullscreen)}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => router.push(`/dashboard/agents/${id}`)}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Main chat area */}
        <main className="flex flex-1 flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-center">
                <div>
                  <Terminal className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="font-medium mb-2">Ready to execute</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Send a message to start a conversation with {agent.name}
                  </p>
                </div>
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === "user"
                        ? "bg-foreground text-background"
                        : message.role === "error"
                        ? "bg-red-50 border border-red-200 text-red-800"
                        : message.role === "system"
                        ? "bg-yellow-50 border border-yellow-200 text-yellow-800"
                        : "bg-muted"
                    }`}
                  >
                    <div className="whitespace-pre-wrap text-sm">{message.content}</div>
                    <div className="text-xs opacity-60 mt-2">
                      {message.timestamp.toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))
            )}
            
            {isRunning && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg p-3 flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">
                    {currentStep > 0 ? `Executing step ${currentStep}...` : "Processing..."}
                  </span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Type your message..."
                disabled={isRunning || !agent.is_active}
                className="flex-1 min-h-[44px] max-h-32 resize-none"
                rows={1}
              />
              <div className="flex flex-col gap-2">
                <Button onClick={sendMessage} disabled={!input.trim() || isRunning || !agent.is_active} size="sm">
                  {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
                {isRunning && (
                  <Button onClick={stopExecution} variant="outline" size="sm">
                    <Square className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            
            <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
              <span>
                Press Enter to send, Shift+Enter for new line
                {!agent.is_active && " • Agent is inactive"}
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={resetConversation} disabled={isRunning}>
                  <RotateCcw className="h-3 w-3" />
                </Button>
                {messages.length > 0 && (
                  <>
                    <Button variant="ghost" size="sm" onClick={copyConversation}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={exportConversation}>
                      <Download className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* Sidebar */}
        {showSidebar && (
          <aside className="w-80 border-l flex flex-col">
            {/* Tool executions */}
            <div className="p-4 border-b">
              <h3 className="font-medium mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Tool Executions
                {toolExecutions.length > 0 && (
                  <Badge variant="secondary">{toolExecutions.length}</Badge>
                )}
              </h3>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {toolExecutions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No tool executions yet</p>
                ) : (
                  toolExecutions.map((execution, index) => (
                    <Card key={index} className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Step {execution.step}
                          </Badge>
                          <span className="text-sm font-medium">{execution.tool}</span>
                        </div>
                        <div className={`text-xs px-2 py-1 rounded ${
                          execution.status === "running" ? "bg-yellow-100 text-yellow-800" :
                          execution.status === "completed" ? "bg-green-100 text-green-800" :
                          "bg-red-100 text-red-800"
                        }`}>
                          {execution.status}
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-xs">
                        <div>
                          <p className="font-medium">Input:</p>
                          <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                            {JSON.stringify(execution.input, null, 2)}
                          </pre>
                        </div>
                        
                        {execution.output && (
                          <div>
                            <p className="font-medium">Output:</p>
                            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-20">
                              {execution.output}
                            </pre>
                          </div>
                        )}
                        
                        {execution.duration && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{execution.duration}ms</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </div>

            {/* Agent info */}
            <div className="p-4">
              <h3 className="font-medium mb-3">Agent Info</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">Description</p>
                  <p className="text-muted-foreground">
                    {agent.description || "No description provided"}
                  </p>
                </div>
                
                <div>
                  <p className="font-medium">Available Tools</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {enabledTools.length === 0 ? (
                      <span className="text-muted-foreground text-xs">No tools enabled</span>
                    ) : (
                      enabledTools.map(([toolName]) => (
                        <Badge key={toolName} variant="outline" className="text-xs">
                          {toolName.replace("_", " ")}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>

                {agent.instructions && (
                  <div>
                    <p className="font-medium">Instructions</p>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">
                      {agent.instructions}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}