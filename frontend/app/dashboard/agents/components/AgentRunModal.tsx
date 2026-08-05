"use client";

import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Play, Send, Loader2, Bot, User, Zap, Check,
  AlertCircle, X, RotateCcw, Copy, Download,
} from "lucide-react";
import { getSession } from "next-auth/react";

interface Agent {
  id: string;
  name: string;
  model: string;
  tools: Record<string, boolean>;
  max_steps: number;
}

interface AgentRunModalProps {
  agent: Agent;
  open: boolean;
  onClose: () => void;
  isRunning: boolean;
  setIsRunning: (running: boolean) => void;
}

interface ChatMessage {
  role: "user" | "assistant" | "tool_call" | "tool_result" | "error";
  content: string;
  tool?: string;
  step?: number;
  timestamp: Date;
}

interface ToolCall {
  tool: string;
  step: number;
  input: string;
  result?: string;
  status: "running" | "completed" | "error";
}

function formatTimestamp(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function modelShortName(model: string): string {
  if (model.startsWith("claude-opus")) return "Opus";
  if (model.startsWith("claude-sonnet")) return "Sonnet";
  if (model.startsWith("claude-haiku")) return "Haiku";
  if (model.startsWith("gpt-4o-mini")) return "GPT-4o mini";
  if (model.startsWith("gpt-4o")) return "GPT-4o";
  return model;
}

export function AgentRunModal({ 
  agent, 
  open, 
  onClose, 
  isRunning, 
  setIsRunning 
}: AgentRunModalProps) {
  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [currentStep, setCurrentStep] = useState(0);
  const [toolCalls, setToolCalls] = useState<ToolCall[]>([]);
  
  // UI state
  const [showToolDetails, setShowToolDetails] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      resetChat();
    }
  }, [open]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, toolCalls]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const resetChat = () => {
    setMessages([]);
    setInputValue("");
    setCurrentStep(0);
    setToolCalls([]);
    setIsRunning(false);
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  };

  const stopExecution = () => {
    abortControllerRef.current?.abort();
    setIsRunning(false);
    setMessages(prev => [...prev, {
      role: "error",
      content: "Execution stopped by user",
      timestamp: new Date(),
    }]);
  };

  const copyConversation = () => {
    const text = messages
      .filter(m => m.role === "user" || m.role === "assistant")
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
  };

  const exportConversation = () => {
    const data = {
      agent: agent.name,
      model: agent.model,
      timestamp: new Date().toISOString(),
      messages: messages,
      toolCalls: toolCalls,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${agent.name}_conversation_${new Date().getTime()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendMessage = async () => {
    const userMessage = inputValue.trim();
    if (!userMessage || isRunning) return;

    setInputValue("");
    setIsRunning(true);
    setCurrentStep(0);

    // Add user message
    const userMsg: ChatMessage = {
      role: "user",
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const session = await getSession();
      const token = (session?.user as any)?.accessToken;

      if (!token) {
        throw new Error("Authentication required");
      }

      // Create abort controller for this request
      abortControllerRef.current = new AbortController();

      const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const response = await fetch(`${apiBase}/api/v1/agents/${agent.id}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: userMessage,
          conversation_history: messages
            .filter(m => m.role === "user" || m.role === "assistant")
            .map(m => ({ role: m.role, content: m.content })),
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || `Request failed (${response.status})`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response stream received");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let assistantMessage = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
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
              
              const newToolCall: ToolCall = {
                tool: event.tool,
                step,
                input: JSON.stringify(event.input, null, 2),
                status: "running",
              };
              
              setToolCalls(prev => [...prev, newToolCall]);
              assistantMessage = ""; // Reset for next assistant response
            } else if (event.type === "tool_result") {
              setToolCalls(prev => 
                prev.map(call => 
                  call.step === currentStep && call.tool === event.tool
                    ? { ...call, result: event.result, status: "completed" }
                    : call
                )
              );
            } else if (event.type === "error") {
              setMessages(prev => [...prev, {
                role: "error",
                content: event.content,
                timestamp: new Date(),
              }]);
            }
          } catch (e) {
            // Ignore malformed JSON chunks
          }
        }
      }

      // Handle any remaining buffer content
      if (buffer.startsWith("data: ")) {
        try {
          const event = JSON.parse(buffer.slice(6));
          // Handle final event if needed
        } catch (e) {
          // Ignore
        }
      }

    } catch (error: any) {
      if (error.name !== "AbortError") {
        setMessages(prev => [...prev, {
          role: "error",
          content: error.message || "Network error occurred",
          timestamp: new Date(),
        }]);
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

  const enabledTools = Object.entries(agent.tools).filter(([, enabled]) => enabled);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5" />
              Run Agent: {agent.name}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                {modelShortName(agent.model)}
              </Badge>
              <Badge variant="outline">
                {agent.max_steps} turns max
              </Badge>
            </div>
          </DialogTitle>
          <DialogDescription>
            Chat with your agent to test its capabilities and behavior
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 gap-4 min-h-0">
          {/* Main chat area */}
          <div className="flex-1 flex flex-col min-h-0">
            <ScrollArea className="flex-1 p-4 border rounded-lg">
              <div className="space-y-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <Bot className="h-12 w-12 text-muted-foreground/30 mb-3" />
                    <p className="text-muted-foreground">
                      Start a conversation with {agent.name}
                    </p>
                    {enabledTools.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        Available tools: {enabledTools.map(([key]) => key).join(", ")}
                      </p>
                    )}
                  </div>
                )}

                {messages.map((message, index) => (
                  <div key={index} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                      message.role === "user"
                        ? "bg-blue-500 text-white"
                        : message.role === "error"
                        ? "bg-red-50 border border-red-200"
                        : "bg-muted"
                    }`}>
                      {message.role === "error" && (
                        <div className="flex items-center gap-2 text-red-600 mb-2">
                          <AlertCircle className="h-4 w-4" />
                          <span className="text-sm font-medium">Error</span>
                        </div>
                      )}
                      <div className="whitespace-pre-wrap text-sm">
                        {message.content}
                      </div>
                      <div className={`text-xs mt-2 ${
                        message.role === "user" ? "text-blue-100" : "text-muted-foreground"
                      }`}>
                        {formatTimestamp(message.timestamp)}
                      </div>
                    </div>
                  </div>
                ))}

                {isRunning && currentStep > 0 && (
                  <div className="flex justify-start">
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 max-w-[80%]">
                      <div className="flex items-center gap-2 text-amber-600 mb-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span className="text-sm font-medium">
                          Executing step {currentStep}...
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {isRunning && messages[messages.length - 1]?.role !== "assistant" && currentStep === 0 && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" />
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }} />
                          <div className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                        </div>
                        <span className="text-sm text-muted-foreground">Thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="flex gap-2 pt-4">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Type your message..."
                disabled={isRunning}
                className="flex-1"
              />
              <Button onClick={sendMessage} disabled={!inputValue.trim() || isRunning}>
                {isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
              {isRunning && (
                <Button variant="outline" onClick={stopExecution}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Tool execution panel */}
          {showToolDetails && (
            <Card className="w-80 flex flex-col">
              <div className="p-4 border-b">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">Tool Execution</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowToolDetails(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <ScrollArea className="flex-1 p-4">
                {toolCalls.length === 0 ? (
                  <div className="text-center text-muted-foreground text-sm">
                    No tool calls yet
                  </div>
                ) : (
                  <div className="space-y-3">
                    {toolCalls.map((call, index) => (
                      <Card key={index} className={`p-3 ${
                        call.status === "running" ? "border-amber-200 bg-amber-50" :
                        call.status === "completed" ? "border-green-200 bg-green-50" :
                        "border-red-200 bg-red-50"
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          {call.status === "running" && <Loader2 className="h-3 w-3 animate-spin" />}
                          {call.status === "completed" && <Check className="h-3 w-3 text-green-600" />}
                          {call.status === "error" && <AlertCircle className="h-3 w-3 text-red-600" />}
                          <span className="text-xs font-medium">
                            Step {call.step}: {call.tool}
                          </span>
                        </div>
                        
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground">Input:</p>
                            <pre className="text-xs bg-background p-2 rounded border overflow-x-auto">
                              {call.input}
                            </pre>
                          </div>
                          
                          {call.result && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground">Result:</p>
                              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-24">
                                {call.result}
                              </pre>
                            </div>
                          )}
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </Card>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={resetChat}>
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
            {!showToolDetails && toolCalls.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setShowToolDetails(true)}>
                <Zap className="h-4 w-4 mr-1" />
                Show Tools
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            {messages.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={copyConversation}>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={exportConversation}>
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </>
            )}
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}