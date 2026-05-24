"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Mic,
  Upload,
  Play,
  Pause,
  Trash2,
  Plus,
  Copy,
  Check,
  Bot,
  Volume2,
  Shield,
  ChevronDown,
  ChevronUp,
  Settings2,
} from "lucide-react";
import { apiClient } from "@/lib/api";

interface Voice {
  id: string;
  name: string;
  category: string;
  cloned: boolean;
  preview_url?: string;
}

interface Agent {
  id: string;
  name: string;
  voice_id?: string;
  created_at?: number;
}

interface AgentDetail {
  agent_id: string;
  name: string;
  system_prompt: string;
  first_message: string;
  language: string;
  voice_id?: string;
  auth_enabled: boolean;
  allowed_origins: string[];
  client_events: string[];
}

const AVAILABLE_CLIENT_EVENTS = [
  { id: "user_transcript", label: "User transcript", description: "Receive each user utterance as text" },
  { id: "agent_response", label: "Agent response", description: "Receive each agent text response" },
  { id: "audio", label: "Audio chunks", description: "Receive raw audio from the agent" },
  { id: "interruption", label: "Interruption", description: "Notified when user interrupts agent" },
  { id: "ping", label: "Ping / latency", description: "Periodic ping events for latency measurement" },
  { id: "internal_tentative_agent_response", label: "Tentative response (debug)", description: "Partial responses before final output" },
];

export default function VoiceLabPage() {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [cloneOpen, setCloneOpen] = useState(false);
  const [agentOpen, setAgentOpen] = useState(false);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [cloneForm, setCloneForm] = useState({ name: "", description: "" });
  const [cloneFiles, setCloneFiles] = useState<FileList | null>(null);
  const [cloning, setCloning] = useState(false);

  const [agentForm, setAgentForm] = useState({
    name: "",
    voice_id: "",
    system_prompt: "You are a helpful assistant.",
    first_message: "Hello! How can I help you today?",
    language: "en",
  });
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [agentDetails, setAgentDetails] = useState<Record<string, AgentDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [savingDetail, setSavingDetail] = useState<string | null>(null);

  const [previewForm, setPreviewForm] = useState({ voice_id: "", text: "Hello, this is a preview of my voice." });
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [voiceRes, agentRes] = await Promise.all([
        apiClient.get("/api/v1/voice-lab/voices"),
        apiClient.get("/api/v1/voice-lab/agents"),
      ]);
      setVoices(voiceRes.data.data || []);
      setAgents(agentRes.data.data || []);
    } catch {}
    setLoading(false);
  }

  async function handleClone(e: React.FormEvent) {
    e.preventDefault();
    if (!cloneFiles?.length) return;
    setCloning(true);
    try {
      const fd = new FormData();
      fd.append("name", cloneForm.name);
      fd.append("description", cloneForm.description);
      for (const f of Array.from(cloneFiles)) fd.append("files", f);
      await apiClient.post("/api/v1/voice-lab/voices/clone", fd);
      setCloneOpen(false);
      setCloneForm({ name: "", description: "" });
      setCloneFiles(null);
      await loadData();
    } catch {}
    setCloning(false);
  }

  async function handleDeleteVoice(id: string) {
    if (!confirm("Delete this voice?")) return;
    await apiClient.delete(`/api/v1/voice-lab/voices/${id}`);
    await loadData();
  }

  async function handlePreview(voiceId: string) {
    if (previewing) return;
    setPreviewing(true);
    setPreviewingId(voiceId);
    try {
      const res = await apiClient.post(
        "/api/v1/voice-lab/preview",
        { voice_id: voiceId, text: previewForm.text },
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(res.data);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
      }
    } catch {}
    setPreviewing(false);
    setPreviewingId(null);
  }

  async function handleCreateAgent(e: React.FormEvent) {
    e.preventDefault();
    setCreatingAgent(true);
    try {
      await apiClient.post("/api/v1/voice-lab/agents", agentForm);
      setAgentOpen(false);
      await loadData();
    } catch {}
    setCreatingAgent(false);
  }

  async function handleDeleteAgent(id: string) {
    if (!confirm("Delete this agent?")) return;
    await apiClient.delete(`/api/v1/voice-lab/agents/${id}`);
    await loadData();
  }

  async function toggleAgentDetail(agentId: string) {
    if (expandedAgentId === agentId) {
      setExpandedAgentId(null);
      return;
    }
    setExpandedAgentId(agentId);
    if (agentDetails[agentId]) return;
    setLoadingDetail(agentId);
    try {
      const { data } = await apiClient.get(`/api/v1/voice-lab/agents/${agentId}`);
      setAgentDetails((prev) => ({ ...prev, [agentId]: data.data }));
    } catch {}
    setLoadingDetail(null);
  }

  function updateDetail(agentId: string, patch: Partial<AgentDetail>) {
    setAgentDetails((prev) => ({ ...prev, [agentId]: { ...prev[agentId], ...patch } }));
  }

  async function saveAgentDetail(agentId: string) {
    const detail = agentDetails[agentId];
    if (!detail) return;
    setSavingDetail(agentId);
    try {
      await apiClient.patch(`/api/v1/voice-lab/agents/${agentId}`, {
        auth_enabled: detail.auth_enabled,
        allowed_origins: detail.allowed_origins,
        client_events: detail.client_events,
      });
    } catch {}
    setSavingDetail(null);
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="p-6 space-y-6">
      <audio ref={audioRef} className="hidden" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Voice Lab</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Clone voices and create ElevenLabs conversational voice agents
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={cloneOpen} onOpenChange={setCloneOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" /> Clone Voice
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clone a Voice</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleClone} className="space-y-4">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input
                    value={cloneForm.name}
                    onChange={(e) => setCloneForm({ ...cloneForm, name: e.target.value })}
                    placeholder="e.g. My Voice Clone"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Description (optional)</Label>
                  <Input
                    value={cloneForm.description}
                    onChange={(e) => setCloneForm({ ...cloneForm, description: e.target.value })}
                    placeholder="Short description"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Audio Files (1–25 wav/mp3 files, min 1 min each)</Label>
                  <Input
                    type="file"
                    accept="audio/*"
                    multiple
                    onChange={(e) => setCloneFiles(e.target.files)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={cloning}>
                  {cloning ? "Cloning..." : "Create Clone"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={agentOpen} onOpenChange={setAgentOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" /> New Agent
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Create Voice Agent</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateAgent} className="space-y-4">
                <div className="space-y-1">
                  <Label>Agent Name</Label>
                  <Input
                    value={agentForm.name}
                    onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                    placeholder="e.g. Support Agent"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Voice</Label>
                  <Select
                    value={agentForm.voice_id}
                    onValueChange={(v) => setAgentForm({ ...agentForm, voice_id: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a voice" />
                    </SelectTrigger>
                    <SelectContent>
                      {voices.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                          {v.cloned && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              Cloned
                            </Badge>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>System Prompt</Label>
                  <Textarea
                    value={agentForm.system_prompt}
                    onChange={(e) => setAgentForm({ ...agentForm, system_prompt: e.target.value })}
                    rows={3}
                  />
                </div>
                <div className="space-y-1">
                  <Label>First Message</Label>
                  <Input
                    value={agentForm.first_message}
                    onChange={(e) => setAgentForm({ ...agentForm, first_message: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Language</Label>
                  <Select
                    value={agentForm.language}
                    onValueChange={(v) => setAgentForm({ ...agentForm, language: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[["en","English"],["es","Spanish"],["fr","French"],["de","German"],["ar","Arabic"],["zh","Chinese"],["ja","Japanese"]].map(([code, name]) => (
                        <SelectItem key={code} value={code}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={creatingAgent || !agentForm.voice_id}>
                  {creatingAgent ? "Creating..." : "Create Agent"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Preview text input */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex gap-2 items-center">
            <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              value={previewForm.text}
              onChange={(e) => setPreviewForm({ ...previewForm, text: e.target.value })}
              placeholder="Enter text to preview with any voice..."
              className="flex-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Voices */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Voices ({voices.length})</h2>
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading...</p>
        ) : voices.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Mic className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No voices yet</p>
              <p className="text-sm text-muted-foreground">Clone a voice or use ElevenLabs shared voices</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {voices.map((voice) => (
              <Card key={voice.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{voice.name}</CardTitle>
                      <div className="flex gap-1 mt-1">
                        <Badge variant={voice.cloned ? "default" : "secondary"} className="text-xs">
                          {voice.cloned ? "Cloned" : voice.category}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => handlePreview(voice.id)}
                        disabled={previewingId === voice.id}
                      >
                        {previewingId === voice.id ? (
                          <Pause className="h-3 w-3" />
                        ) : (
                          <Play className="h-3 w-3" />
                        )}
                      </Button>
                      {voice.cloned && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteVoice(voice.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                    <span className="truncate flex-1">{voice.id}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={() => copyId(voice.id)}
                    >
                      {copiedId === voice.id ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Agents */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Conversational Agents ({agents.length})</h2>
        {agents.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Bot className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="font-medium">No agents yet</p>
              <p className="text-sm text-muted-foreground">Create a voice agent to use in your widget</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {agents.map((agent) => {
              const detail = agentDetails[agent.id];
              const isExpanded = expandedAgentId === agent.id;
              return (
                <Card key={agent.id}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <CardTitle className="text-base">{agent.name}</CardTitle>
                      <div className="flex gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          title="Setup checklist"
                          onClick={() => toggleAgentDetail(agent.id)}
                        >
                          <Settings2 className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDeleteAgent(agent.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Agent ID (copy for widget settings)</p>
                      <div className="flex items-center gap-1 bg-muted rounded px-2 py-1">
                        <code className="text-xs flex-1 truncate">{agent.id}</code>
                        <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => copyId(agent.id)}>
                          {copiedId === agent.id ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                      </div>
                    </div>
                    {agent.voice_id && (
                      <p className="text-xs text-muted-foreground">
                        Voice: {voices.find((v) => v.id === agent.voice_id)?.name || agent.voice_id}
                      </p>
                    )}

                    {/* Setup checklist */}
                    {isExpanded && (
                      <div className="mt-3 border-t pt-3 space-y-4">
                        {loadingDetail === agent.id ? (
                          <p className="text-xs text-muted-foreground">Loading configuration…</p>
                        ) : detail ? (
                          <>
                            {/* Security overrides */}
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                                <p className="text-xs font-semibold">Security Overrides</p>
                              </div>
                              <div className="space-y-2">
                                <label className="flex items-center justify-between">
                                  <div>
                                    <p className="text-xs font-medium">Require authentication</p>
                                    <p className="text-[10px] text-muted-foreground">Force signed-URL auth — prevents unauthorized widget usage</p>
                                  </div>
                                  <button
                                    role="switch"
                                    aria-checked={detail.auth_enabled}
                                    onClick={() => updateDetail(agent.id, { auth_enabled: !detail.auth_enabled })}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${detail.auth_enabled ? "bg-primary" : "bg-input"}`}
                                  >
                                    <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${detail.auth_enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                                  </button>
                                </label>
                                <div>
                                  <p className="text-xs font-medium mb-1">Allowed origins</p>
                                  <input
                                    value={detail.allowed_origins.join(", ")}
                                    onChange={(e) =>
                                      updateDetail(agent.id, {
                                        allowed_origins: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                                      })
                                    }
                                    placeholder="example.com, app.example.com"
                                    className="w-full h-8 rounded-md border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                  <p className="text-[10px] text-muted-foreground mt-1">Leave blank to allow all origins. Comma-separated hostnames.</p>
                                </div>
                              </div>
                            </div>

                            {/* Client events */}
                            <div>
                              <p className="text-xs font-semibold mb-2">Client Events</p>
                              <p className="text-[10px] text-muted-foreground mb-2">
                                Select which events the ElevenLabs widget sends to your page's JavaScript. Use these to build custom UI reactions.
                              </p>
                              <div className="space-y-1.5">
                                {AVAILABLE_CLIENT_EVENTS.map((ev) => {
                                  const active = detail.client_events.includes(ev.id);
                                  return (
                                    <label key={ev.id} className="flex items-start gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={() =>
                                          updateDetail(agent.id, {
                                            client_events: active
                                              ? detail.client_events.filter((e) => e !== ev.id)
                                              : [...detail.client_events, ev.id],
                                          })
                                        }
                                        className="mt-0.5 h-3.5 w-3.5 rounded"
                                      />
                                      <div>
                                        <p className="text-xs font-medium leading-none">{ev.label}</p>
                                        <p className="text-[10px] text-muted-foreground">{ev.description}</p>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>
                            </div>

                            <Button
                              size="sm"
                              className="w-full h-8 text-xs"
                              disabled={savingDetail === agent.id}
                              onClick={() => saveAgentDetail(agent.id)}
                            >
                              {savingDetail === agent.id ? "Saving…" : "Save Security & Events"}
                            </Button>
                          </>
                        ) : null}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
