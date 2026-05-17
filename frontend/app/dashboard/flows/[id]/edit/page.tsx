"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  GitFork,
  Loader2,
  Pause,
  Play,
  Plus,
  Save,
  Trash2,
  Webhook,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

// ── Node definitions ──────────────────────────────────────────────────────────

interface NodeDef {
  type: string;
  label: string;
  icon: string;
  color: string;
  category: string;
}

const NODE_DEFS: NodeDef[] = [
  // Core
  { type: "start",        label: "Start",          icon: "▶",  color: "#22c55e", category: "Core" },
  { type: "end",          label: "End",            icon: "⏹",  color: "#ef4444", category: "Core" },
  { type: "notes",        label: "Notes",          icon: "📝", color: "#94a3b8", category: "Core" },
  // Messaging
  { type: "send_message", label: "Send Message",   icon: "💬", color: "#6366f1", category: "Messages" },
  { type: "ai_response",  label: "AI Response",    icon: "🤖", color: "#8b5cf6", category: "Messages" },
  // Logic
  { type: "condition",    label: "Condition",      icon: "🔀", color: "#f59e0b", category: "Logic" },
  { type: "delay",        label: "Delay",          icon: "⏳", color: "#f97316", category: "Logic" },
  { type: "jump_to",      label: "Jump To",        icon: "↪",  color: "#06b6d4", category: "Logic" },
  { type: "randomizer",   label: "Randomizer",     icon: "🎲", color: "#ec4899", category: "Logic" },
  // Input & Actions
  { type: "user_input",   label: "User Input",     icon: "⌨",  color: "#0ea5e9", category: "Input" },
  { type: "http_request", label: "HTTP Request",   icon: "🌐", color: "#14b8a6", category: "Actions" },
  { type: "action",       label: "Action",         icon: "⚡", color: "#64748b", category: "Actions" },
];

const NODE_MAP = Object.fromEntries(NODE_DEFS.map(d => [d.type, d]));

// ── Custom node component ─────────────────────────────────────────────────────

import { Handle, Position } from "@xyflow/react";

function FlowNode({ data, selected }: { data: any; selected: boolean }) {
  const def = NODE_MAP[data.nodeType] ?? { label: data.nodeType, icon: "◻", color: "#64748b" };
  const isStart = data.nodeType === "start";
  const isEnd = data.nodeType === "end";
  const isCondition = data.nodeType === "condition";

  return (
    <div
      className={`rounded-lg border-2 bg-white shadow-sm transition-shadow min-w-[160px] max-w-[220px] ${
        selected ? "shadow-md ring-2 ring-primary/40" : ""
      }`}
      style={{ borderColor: selected ? def.color : `${def.color}66` }}
    >
      {!isStart && <Handle type="target" position={Position.Top} className="!bg-slate-400 !w-3 !h-3" />}

      <div className="flex items-center gap-2 px-3 py-2 rounded-t-[6px]" style={{ backgroundColor: `${def.color}18` }}>
        <span className="text-base leading-none">{def.icon}</span>
        <span className="text-xs font-semibold text-slate-700 truncate">{def.label}</span>
      </div>

      {data.label && (
        <div className="px-3 py-1.5 text-[11px] text-slate-500 leading-tight line-clamp-2">
          {data.label}
        </div>
      )}

      {!isEnd && !isCondition && (
        <Handle type="source" position={Position.Bottom} className="!bg-slate-400 !w-3 !h-3" />
      )}
      {isCondition && (
        <>
          <Handle type="source" position={Position.Bottom} id="yes" style={{ left: "30%" }} className="!bg-green-500 !w-3 !h-3" />
          <Handle type="source" position={Position.Bottom} id="no" style={{ left: "70%" }} className="!bg-red-400 !w-3 !h-3" />
        </>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { flowNode: FlowNode };

// ── Config panels ─────────────────────────────────────────────────────────────

function NodeConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: {
  node: Node;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}) {
  const data = node.data as any;
  const nodeType = data.nodeType as string;
  const [local, setLocal] = useState<any>(data);

  function set(key: string, val: any) {
    setLocal((prev: any) => ({ ...prev, [key]: val }));
  }

  function save() {
    onUpdate(node.id, local);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold capitalize">
          {NODE_MAP[nodeType]?.icon} {NODE_MAP[nodeType]?.label ?? nodeType}
        </span>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Common: display label */}
        <div className="space-y-1">
          <Label className="text-xs">Display label (optional)</Label>
          <Input
            className="h-8 text-xs"
            value={local.label ?? ""}
            onChange={e => set("label", e.target.value)}
            placeholder="e.g. Welcome message"
          />
        </div>

        {/* Type-specific fields */}
        {nodeType === "send_message" && (
          <div className="space-y-1">
            <Label className="text-xs">Message text</Label>
            <textarea
              className="w-full rounded-md border text-xs px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              value={local.text ?? ""}
              onChange={e => set("text", e.target.value)}
              placeholder="Hello {{first_name}}! How can I help?"
            />
            <p className="text-[10px] text-muted-foreground">Use {"{{"} variable {"}}"}  for dynamic values</p>
          </div>
        )}

        {nodeType === "user_input" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Prompt (optional)</Label>
              <textarea
                className="w-full rounded-md border text-xs px-3 py-2 min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                value={local.prompt ?? ""}
                onChange={e => set("prompt", e.target.value)}
                placeholder="What is your name?"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save response to variable</Label>
              <Input
                className="h-8 text-xs font-mono"
                value={local.variable ?? ""}
                onChange={e => set("variable", e.target.value)}
                placeholder="user_name"
              />
            </div>
          </>
        )}

        {nodeType === "condition" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Variable / field</Label>
              <Input className="h-8 text-xs font-mono" value={local.field ?? ""} onChange={e => set("field", e.target.value)} placeholder="user_name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Operator</Label>
              <select
                className="w-full rounded-md border text-xs px-2 py-1.5 focus:outline-none"
                value={local.operator ?? "eq"}
                onChange={e => set("operator", e.target.value)}
              >
                {[["eq","equals"],["neq","not equals"],["contains","contains"],["not_contains","not contains"],["gt","greater than"],["lt","less than"],["empty","is empty"],["not_empty","is not empty"],["has_tag","has tag"]].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Value</Label>
              <Input className="h-8 text-xs" value={local.value ?? ""} onChange={e => set("value", e.target.value)} placeholder="expected value" />
            </div>
            <p className="text-[10px] text-muted-foreground">Bottom-left handle = Yes (true) · Bottom-right = No (false)</p>
          </>
        )}

        {nodeType === "ai_response" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Prompt</Label>
              <textarea
                className="w-full rounded-md border text-xs px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                value={local.prompt ?? ""}
                onChange={e => set("prompt", e.target.value)}
                placeholder="Summarize the conversation so far"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Model</Label>
              <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.model ?? "claude-sonnet-4-6"} onChange={e => set("model", e.target.value)}>
                {["claude-sonnet-4-6","claude-opus-4-7","claude-haiku-4-5","gpt-4o","gpt-4o-mini"].map(m => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save result to variable (optional)</Label>
              <Input className="h-8 text-xs font-mono" value={local.save_to ?? ""} onChange={e => set("save_to", e.target.value)} placeholder="ai_result" />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={local.send_reply !== false} onChange={e => set("send_reply", e.target.checked)} />
              Send AI response to user
            </label>
          </>
        )}

        {nodeType === "delay" && (
          <div className="flex gap-2">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input type="number" min="1" className="h-8 text-xs" value={local.amount ?? 1} onChange={e => set("amount", parseInt(e.target.value) || 1)} />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Unit</Label>
              <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.unit ?? "minutes"} onChange={e => set("unit", e.target.value)}>
                {["seconds","minutes","hours","days"].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
        )}

        {nodeType === "http_request" && (
          <>
            <div className="flex gap-2">
              <div className="w-24 space-y-1">
                <Label className="text-xs">Method</Label>
                <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.method ?? "GET"} onChange={e => set("method", e.target.value)}>
                  {["GET","POST","PUT","PATCH","DELETE"].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">URL</Label>
                <Input className="h-8 text-xs" value={local.url ?? ""} onChange={e => set("url", e.target.value)} placeholder="https://api.example.com/data" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Save response to variable</Label>
              <Input className="h-8 text-xs font-mono" value={local.save_to ?? "http_response"} onChange={e => set("save_to", e.target.value)} />
            </div>
          </>
        )}

        {nodeType === "action" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Action type</Label>
              <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.action ?? "set_field"} onChange={e => set("action", e.target.value)}>
                {[["set_field","Set Custom Field"],["add_tag","Add Tag"],["remove_tag","Remove Tag"],["close_conversation","Close Conversation"],["send_webhook","Send Webhook"],["assign_conversation","Assign Conversation"]].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            {(local.action === "set_field") && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Field key</Label>
                  <Input className="h-8 text-xs font-mono" value={local.field_key ?? ""} onChange={e => set("field_key", e.target.value)} placeholder="email" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Value</Label>
                  <Input className="h-8 text-xs" value={local.value ?? ""} onChange={e => set("value", e.target.value)} placeholder="{{user_email}}" />
                </div>
              </>
            )}
            {(local.action === "add_tag" || local.action === "remove_tag") && (
              <div className="space-y-1">
                <Label className="text-xs">Tag name</Label>
                <Input className="h-8 text-xs" value={local.tag ?? ""} onChange={e => set("tag", e.target.value)} placeholder="VIP" />
              </div>
            )}
            {local.action === "send_webhook" && (
              <div className="space-y-1">
                <Label className="text-xs">Webhook URL</Label>
                <Input className="h-8 text-xs" value={local.url ?? ""} onChange={e => set("url", e.target.value)} placeholder="https://hooks.zapier.com/..." />
              </div>
            )}
          </>
        )}

        {nodeType === "jump_to" && (
          <div className="space-y-1">
            <Label className="text-xs">Target node ID</Label>
            <Input className="h-8 text-xs font-mono" value={local.target_node_id ?? ""} onChange={e => set("target_node_id", e.target.value)} placeholder="node-id" />
          </div>
        )}

        {nodeType === "notes" && (
          <div className="space-y-1">
            <Label className="text-xs">Note content</Label>
            <textarea className="w-full rounded-md border text-xs px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary" value={local.note ?? ""} onChange={e => set("note", e.target.value)} placeholder="Add documentation or comments here..." />
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 border-t px-4 py-3">
        <Button size="sm" className="h-8 flex-1 text-xs" onClick={save}>
          <Check className="h-3.5 w-3.5" /> Apply
        </Button>
        {node.data.nodeType !== "start" && (
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => { onDelete(node.id); onClose(); }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

let nodeIdCounter = 100;
function newNodeId() {
  return `node-${++nodeIdCounter}`;
}

export default function FlowEditorPage() {
  const { id: flowId } = useParams<{ id: string }>();
  const router = useRouter();

  const [flowName, setFlowName] = useState("Loading…");
  const [isActive, setIsActive] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(true);

  // Convert stored nodes (with type/data) to ReactFlow format
  function toRFNodes(raw: any[]): Node[] {
    return raw.map(n => ({
      ...n,
      type: "flowNode",
      data: { ...(n.data || {}), nodeType: n.type === "flowNode" ? (n.data?.nodeType ?? "start") : n.type },
    }));
  }

  function fromRFNodes(rfNodes: Node[]): any[] {
    return rfNodes.map(n => ({
      id: n.id,
      type: (n.data as any).nodeType ?? "start",
      position: n.position,
      data: n.data,
    }));
  }

  useEffect(() => {
    apiClient.get(`/api/v1/flows/${flowId}`).then(({ data }) => {
      const f = data.data;
      setFlowName(f.name);
      setIsActive(f.is_active);
      setWebhookSecret(f.webhook_secret);
      setNodes(toRFNodes(f.nodes || []));
      setEdges(f.edges || []);
    }).finally(() => setLoading(false));
  }, [flowId]);

  const onConnect = useCallback(
    (params: Connection) =>
      setEdges(eds => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds)),
    [setEdges]
  );

  function addNode(def: NodeDef) {
    const id = newNodeId();
    const newNode: Node = {
      id,
      type: "flowNode",
      position: { x: 200 + Math.random() * 100, y: 200 + Math.random() * 100 },
      data: { nodeType: def.type, label: "" },
    };
    setNodes(nds => [...nds, newNode]);
  }

  function updateNodeData(id: string, data: any) {
    setNodes(nds => nds.map(n => n.id === id ? { ...n, data } : n));
    setSelectedNode(prev => prev?.id === id ? { ...prev, data } : prev);
  }

  function deleteNode(id: string) {
    setNodes(nds => nds.filter(n => n.id !== id));
    setEdges(eds => eds.filter(e => e.source !== id && e.target !== id));
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/flows/${flowId}`, {
        name: flowName,
        nodes: fromRFNodes(nodes),
        edges,
      });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    } finally {
      setSaving(false);
    }
  }

  async function toggle() {
    await apiClient.post(`/api/v1/flows/${flowId}/toggle`);
    setIsActive(a => !a);
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Group palette nodes by category
  const categories = Array.from(new Set(NODE_DEFS.map(d => d.category)));

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex h-12 items-center gap-3 border-b bg-background px-4 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/dashboard/flows")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <GitFork className="h-4 w-4 text-muted-foreground" />
        <input
          className="flex-1 max-w-xs bg-transparent text-sm font-medium outline-none placeholder:text-muted-foreground"
          value={flowName}
          onChange={e => setFlowName(e.target.value)}
          onBlur={save}
        />
        <div className="ml-auto flex items-center gap-2">
          {webhookSecret && (
            <span className="hidden md:flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] font-mono text-muted-foreground">
              <Webhook className="h-3 w-3" />
              {webhookSecret.slice(0, 8)}…
            </span>
          )}
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={toggle}>
            {isActive ? <Pause className="h-3.5 w-3.5 text-amber-600" /> : <Play className="h-3.5 w-3.5 text-green-600" />}
            {isActive ? "Active" : "Inactive"}
          </Button>
          <Button size="sm" className="h-8 gap-1 text-xs" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : savedOk ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {savedOk ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      {/* Main canvas area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Node palette */}
        <div className={`border-r bg-muted/30 flex flex-col transition-all ${paletteOpen ? "w-52" : "w-10"}`}>
          <button
            className="flex h-10 items-center justify-between px-3 text-xs font-medium hover:bg-muted border-b"
            onClick={() => setPaletteOpen(o => !o)}
          >
            {paletteOpen ? (
              <>
                <span>Nodes</span>
                <ChevronRight className="h-3.5 w-3.5 rotate-180" />
              </>
            ) : (
              <ChevronRight className="h-3.5 w-3.5 mx-auto" />
            )}
          </button>
          {paletteOpen && (
            <div className="flex-1 overflow-y-auto p-2 space-y-3">
              {categories.map(cat => (
                <div key={cat}>
                  <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
                  <div className="space-y-1">
                    {NODE_DEFS.filter(d => d.category === cat).map(def => (
                      <button
                        key={def.type}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-background hover:shadow-sm transition-colors text-left"
                        onClick={() => addNode(def)}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-sm"
                          style={{ backgroundColor: `${def.color}22` }}
                        >
                          {def.icon}
                        </span>
                        <span className="truncate font-medium">{def.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ReactFlow canvas */}
        <div className="flex-1 overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, node) => setSelectedNode(node)}
            onPaneClick={() => setSelectedNode(null)}
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed },
              style: { stroke: "#94a3b8" },
            }}
            fitView
          >
            <Background gap={16} color="#f1f5f9" />
            <Controls />
            <MiniMap nodeColor={n => NODE_MAP[(n.data as any)?.nodeType]?.color ?? "#94a3b8"} />
          </ReactFlow>
        </div>

        {/* Node config panel */}
        {selectedNode && (
          <div className="w-72 border-l bg-background overflow-hidden flex flex-col">
            <NodeConfigPanel
              node={selectedNode}
              onUpdate={updateNodeData}
              onDelete={deleteNode}
              onClose={() => setSelectedNode(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
