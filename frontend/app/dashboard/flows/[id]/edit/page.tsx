"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ReactFlow,
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
  Clock,
  Copy,
  ExternalLink,
  GitFork,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
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
  { type: "carousel",     label: "Carousel",       icon: "🎠", color: "#6366f1", category: "Messages" },
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
  const isEntryPoint = data.isStartingNode;

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
        <span className="text-xs font-semibold text-slate-700 truncate flex-1">{def.label}</span>
        {isEntryPoint && <span title="Entry point" style={{ fontSize: 12 }}>🚩</span>}
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

// ── Variable autocomplete textarea ────────────────────────────────────────────

const STATIC_VARS = [
  "contact.first_name", "contact.last_name", "contact.email", "contact.phone",
  "contact.id", "contact.tags", "contact.custom_fields",
  "conversation.id", "message.text", "trigger.data",
  "timestamp", "date", "time",
];

function VarTextarea({
  value,
  onChange,
  placeholder,
  flowVars = [],
  minHeight = "80px",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  flowVars?: string[];
  minHeight?: string;
}) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  const allVars = [...STATIC_VARS, ...flowVars.filter((v) => !STATIC_VARS.includes(v))];

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    checkForVar(e.target);
  }

  function checkForVar(el: HTMLTextAreaElement) {
    const pos = el.selectionStart ?? 0;
    const textBefore = el.value.slice(0, pos);
    const match = textBefore.match(/\{\{([^}]*)$/);
    if (match) {
      setQuery(match[1].toLowerCase());
      setShowDropdown(true);
    } else {
      setShowDropdown(false);
      setQuery("");
    }
  }

  function insertVar(varName: string) {
    const el = ref.current;
    if (!el) return;
    const pos = el.selectionStart ?? 0;
    const textBefore = value.slice(0, pos);
    const start = textBefore.lastIndexOf("{{");
    const newVal = value.slice(0, start) + `{{${varName}}}` + value.slice(pos);
    onChange(newVal);
    setShowDropdown(false);
    setQuery("");
    setTimeout(() => {
      el.focus();
      const newPos = start + varName.length + 4;
      el.setSelectionRange(newPos, newPos);
    }, 0);
  }

  const filtered = query
    ? allVars.filter((v) => v.includes(query))
    : allVars;

  return (
    <div className="relative">
      <textarea
        ref={ref}
        className="w-full rounded-md border text-xs px-3 py-2 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
        style={{ minHeight }}
        value={value}
        onChange={handleChange}
        onKeyUp={(e) => checkForVar(e.currentTarget)}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        placeholder={placeholder}
      />
      {showDropdown && filtered.length > 0 && (
        <div className="absolute z-50 w-full max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
          {filtered.slice(0, 12).map((v) => (
            <button
              key={v}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertVar(v); }}
              className="w-full px-3 py-1.5 text-left text-xs hover:bg-muted font-mono"
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Node config panel ─────────────────────────────────────────────────────────

function NodeConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
  onCopy,
  onSetStart,
  isStartingNode,
  flowVars,
}: {
  node: Node;
  onUpdate: (id: string, data: any) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
  onCopy: (node: Node) => void;
  onSetStart: (id: string) => void;
  isStartingNode: boolean;
  flowVars: string[];
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
        <div className="flex items-center gap-1">
          <button
            title={isStartingNode ? "Entry point (click to remove)" : "Set as entry point"}
            onClick={() => onSetStart(node.id)}
            className={`rounded p-1 hover:bg-muted ${isStartingNode ? "text-green-600" : "text-muted-foreground"}`}
          >
            🚩
          </button>
          <button
            title="Duplicate node"
            onClick={() => onCopy(node)}
            className="rounded p-1 hover:bg-muted text-muted-foreground"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
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
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <select
                className="w-full rounded-md border text-xs px-2 py-1.5 focus:outline-none"
                value={local.channel ?? "omni"}
                onChange={(e) => set("channel", e.target.value)}
              >
                {[
                  ["omni", "Omni (auto-select best)"],
                  ["web_widget", "Web Widget"],
                  ["messenger", "Facebook Messenger"],
                  ["instagram", "Instagram DM"],
                  ["whatsapp", "WhatsApp"],
                  ["telegram", "Telegram"],
                  ["sms", "SMS"],
                  ["email", "Email"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Message text</Label>
              <VarTextarea
                value={local.text ?? ""}
                onChange={(v) => set("text", v)}
                placeholder="Hello {{contact.first_name}}! How can I help?"
                flowVars={flowVars}
              />
              <p className="text-[10px] text-muted-foreground">Type {"{{"}  to insert a variable</p>
            </div>
          </div>
        )}

        {nodeType === "carousel" && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Channel</Label>
              <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.channel ?? "omni"} onChange={e => set("channel", e.target.value)}>
                {[["omni","Omni"],["web_widget","Web Widget"],["messenger","Messenger"],["instagram","Instagram"],["whatsapp","WhatsApp"],["telegram","Telegram"]].map(([v,l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Cards ({(local.cards ?? []).length}/10)</Label>
                <button
                  className="text-xs text-primary underline"
                  onClick={() => {
                    const cards = [...(local.cards ?? [])];
                    if (cards.length >= 10) return;
                    cards.push({ title: "", subtitle: "", image_url: "", buttons: [{ type: "url", label: "Learn more", value: "" }] });
                    set("cards", cards);
                  }}
                >
                  + Add card
                </button>
              </div>
              {(local.cards ?? []).map((card: any, ci: number) => (
                <div key={ci} className="rounded-md border p-2 space-y-2 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold text-muted-foreground">Card {ci + 1}</p>
                    <button className="text-[10px] text-destructive" onClick={() => set("cards", (local.cards ?? []).filter((_: any, i: number) => i !== ci))}>Remove</button>
                  </div>
                  <Input className="h-7 text-xs" placeholder="Title" value={card.title ?? ""} onChange={e => { const c = [...(local.cards ?? [])]; c[ci] = { ...c[ci], title: e.target.value }; set("cards", c); }} />
                  <Input className="h-7 text-xs" placeholder="Subtitle (optional)" value={card.subtitle ?? ""} onChange={e => { const c = [...(local.cards ?? [])]; c[ci] = { ...c[ci], subtitle: e.target.value }; set("cards", c); }} />
                  <Input className="h-7 text-xs" placeholder="Image URL (optional)" value={card.image_url ?? ""} onChange={e => { const c = [...(local.cards ?? [])]; c[ci] = { ...c[ci], image_url: e.target.value }; set("cards", c); }} />
                  {(card.buttons ?? []).map((btn: any, bi: number) => (
                    <div key={bi} className="flex gap-1 items-center">
                      <select className="h-7 rounded border text-[10px] px-1" value={btn.type ?? "url"} onChange={e => { const c = [...(local.cards ?? [])]; c[ci].buttons[bi] = { ...c[ci].buttons[bi], type: e.target.value }; set("cards", c); }}>
                        {[["url","URL"],["phone","Phone"],["postback","Postback"],["flow","Flow"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <Input className="h-7 text-[10px] flex-1" placeholder="Label" value={btn.label ?? ""} onChange={e => { const c = [...(local.cards ?? [])]; c[ci].buttons[bi] = { ...c[ci].buttons[bi], label: e.target.value }; set("cards", c); }} />
                      <Input className="h-7 text-[10px] flex-1" placeholder="Value/URL" value={btn.value ?? ""} onChange={e => { const c = [...(local.cards ?? [])]; c[ci].buttons[bi] = { ...c[ci].buttons[bi], value: e.target.value }; set("cards", c); }} />
                      <button className="text-[10px] text-destructive shrink-0" onClick={() => { const c = [...(local.cards ?? [])]; c[ci].buttons = c[ci].buttons.filter((_: any, i: number) => i !== bi); set("cards", c); }}>✕</button>
                    </div>
                  ))}
                  {(card.buttons ?? []).length < 3 && (
                    <button className="text-[10px] text-primary underline" onClick={() => { const c = [...(local.cards ?? [])]; c[ci].buttons = [...(c[ci].buttons ?? []), { type: "url", label: "", value: "" }]; set("cards", c); }}>+ Add button</button>
                  )}
                </div>
              ))}
              {(local.cards ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">No cards yet. Click "+ Add card" to start.</p>
              )}
            </div>
          </div>
        )}

        {nodeType === "user_input" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Prompt (optional)</Label>
              <VarTextarea
                value={local.prompt ?? ""}
                onChange={(v) => set("prompt", v)}
                placeholder="What is your name?"
                flowVars={flowVars}
                minHeight="60px"
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
              <VarTextarea
                value={local.prompt ?? ""}
                onChange={(v) => set("prompt", v)}
                placeholder="Summarize the conversation so far. User name: {{contact.first_name}}"
                flowVars={flowVars}
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
                {[
                  ["set_field","Set Custom Field"],
                  ["add_tag","Add Tag"],
                  ["remove_tag","Remove Tag"],
                  ["close_conversation","Close Conversation"],
                  ["assign_conversation","Assign Conversation"],
                  ["send_sms","Send SMS"],
                  ["send_email","Send Email"],
                  ["outbound_call","Outbound Call"],
                  ["transfer_call","Transfer Call"],
                  ["end_call","End Call"],
                  ["google_sheets","Google Sheets"],
                  ["google_docs","Google Docs"],
                  ["comment_on_post","Comment on Post (Instagram)"],
                  ["ai_web","AI Web (Browse / Research)"],
                  ["send_webhook","Send Webhook"],
                  ["wallet_action","Wallet: Card Action"],
                  ["wallet_push","Wallet: Send Push Notification"],
                ].map(([v,l]) => (
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
            {local.action === "send_sms" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">To (phone number)</Label>
                  <Input className="h-8 text-xs" value={local.to ?? ""} onChange={e => set("to", e.target.value)} placeholder="{{contact.phone}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Message</Label>
                  <textarea className="w-full rounded-md border text-xs px-3 py-2 min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-primary" value={local.body ?? ""} onChange={e => set("body", e.target.value)} placeholder="Your message text..." />
                </div>
              </>
            )}
            {local.action === "send_email" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">To (email)</Label>
                  <Input className="h-8 text-xs" value={local.to ?? ""} onChange={e => set("to", e.target.value)} placeholder="{{contact.email}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Input className="h-8 text-xs" value={local.subject ?? ""} onChange={e => set("subject", e.target.value)} placeholder="Hello {{contact.first_name}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Body</Label>
                  <textarea className="w-full rounded-md border text-xs px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary" value={local.body ?? ""} onChange={e => set("body", e.target.value)} placeholder="Email body..." />
                </div>
              </>
            )}
            {local.action === "outbound_call" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">To (phone number)</Label>
                  <Input className="h-8 text-xs" value={local.to ?? ""} onChange={e => set("to", e.target.value)} placeholder="{{contact.phone}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">TwiML URL (optional)</Label>
                  <Input className="h-8 text-xs" value={local.twiml_url ?? ""} onChange={e => set("twiml_url", e.target.value)} placeholder="Leave blank for default AI handler" />
                </div>
              </>
            )}
            {local.action === "transfer_call" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Transfer to (phone number)</Label>
                  <Input className="h-8 text-xs" value={local.to ?? ""} onChange={e => set("to", e.target.value)} placeholder="+15551234567" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hold message</Label>
                  <Input className="h-8 text-xs" value={local.message ?? ""} onChange={e => set("message", e.target.value)} placeholder="Transferring you now. Please hold." />
                </div>
              </>
            )}
            {local.action === "end_call" && (
              <div className="space-y-1">
                <Label className="text-xs">Goodbye message (optional)</Label>
                <Input className="h-8 text-xs" value={local.message ?? ""} onChange={e => set("message", e.target.value)} placeholder="Thank you for calling. Goodbye!" />
              </div>
            )}
            {local.action === "google_sheets" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Spreadsheet ID</Label>
                  <Input className="h-8 text-xs font-mono" value={local.sheet_id ?? ""} onChange={e => set("sheet_id", e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
                  <p className="text-[10px] text-muted-foreground">From the spreadsheet URL: /spreadsheets/d/<strong>ID</strong>/edit</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tab name</Label>
                  <Input className="h-8 text-xs" value={local.tab ?? "Sheet1"} onChange={e => set("tab", e.target.value)} placeholder="Sheet1" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Operation</Label>
                  <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.operation ?? "append_row"} onChange={e => set("operation", e.target.value)}>
                    <option value="append_row">Append row</option>
                    <option value="get_row">Get row by number</option>
                    <option value="get_multiple_rows">Get multiple rows</option>
                    <option value="get_random_row">Get random row</option>
                    <option value="search_rows">Search rows</option>
                    <option value="update_row">Update row</option>
                    <option value="clear_row">Clear row</option>
                  </select>
                </div>
                {(local.operation === "append_row" || local.operation === "update_row") && (
                  <div className="space-y-1">
                    <Label className="text-xs">Row data (comma-separated values)</Label>
                    <Input className="h-8 text-xs" value={local.row_text ?? ""} onChange={e => set("row_text", e.target.value)} placeholder="{{contact.name}}, {{contact.email}}, {{input}}" />
                    <p className="text-[10px] text-muted-foreground">Values will be split on commas and written to columns A, B, C…</p>
                  </div>
                )}
                {(local.operation === "get_row" || local.operation === "update_row" || local.operation === "clear_row") && (
                  <div className="space-y-1">
                    <Label className="text-xs">Row number</Label>
                    <Input className="h-8 text-xs" type="number" min={1} value={local.row_number ?? 1} onChange={e => set("row_number", parseInt(e.target.value) || 1)} />
                  </div>
                )}
                {local.operation === "get_multiple_rows" && (
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">Start row</Label>
                      <Input className="h-8 text-xs" type="number" min={1} value={local.start_row ?? 1} onChange={e => set("start_row", parseInt(e.target.value) || 1)} />
                    </div>
                    <div className="flex-1 space-y-1">
                      <Label className="text-xs">End row</Label>
                      <Input className="h-8 text-xs" type="number" min={1} value={local.end_row ?? 10} onChange={e => set("end_row", parseInt(e.target.value) || 10)} />
                    </div>
                  </div>
                )}
                {local.operation === "search_rows" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Search query</Label>
                    <Input className="h-8 text-xs" value={local.query ?? ""} onChange={e => set("query", e.target.value)} placeholder="{{input}}" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Save result to variable</Label>
                  <Input className="h-8 text-xs font-mono" value={local.save_to ?? "sheets_result"} onChange={e => set("save_to", e.target.value)} />
                </div>
              </>
            )}
            {local.action === "google_docs" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Operation</Label>
                  <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.operation ?? "create"} onChange={e => set("operation", e.target.value)}>
                    <option value="create">Create document</option>
                    <option value="update">Append to document</option>
                  </select>
                </div>
                {(local.operation ?? "create") === "create" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Document title</Label>
                    <Input className="h-8 text-xs" value={local.title ?? ""} onChange={e => set("title", e.target.value)} placeholder="My Document" />
                  </div>
                )}
                {(local.operation ?? "create") === "update" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Document ID</Label>
                    <Input className="h-8 text-xs font-mono" value={local.doc_id ?? ""} onChange={e => set("doc_id", e.target.value)} placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Content</Label>
                  <textarea className="w-full rounded-md border text-xs px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary" value={local.content ?? ""} onChange={e => set("content", e.target.value)} placeholder="Text to write into the document..." />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Save result to variable</Label>
                  <Input className="h-8 text-xs font-mono" value={local.save_to ?? "doc_result"} onChange={e => set("save_to", e.target.value)} />
                </div>
              </>
            )}
            {local.action === "comment_on_post" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Instagram Media ID</Label>
                  <Input className="h-8 text-xs font-mono" value={local.media_id ?? ""} onChange={e => set("media_id", e.target.value)} placeholder="{{trigger.media_id}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Comment text</Label>
                  <textarea className="w-full rounded-md border text-xs px-3 py-2 min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-primary" value={local.message ?? ""} onChange={e => set("message", e.target.value)} placeholder="Great post! Check out our offer..." />
                </div>
              </>
            )}
            {local.action === "ai_web" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Mode</Label>
                  <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.mode ?? "browse"} onChange={e => set("mode", e.target.value)}>
                    <option value="browse">Browse — visit a URL and extract content</option>
                    <option value="research">Research — autonomous multi-page search</option>
                    <option value="search">Search — quick web query (Perplexity/DDG)</option>
                    <option value="fetch">Fetch — raw HTTP GET and parse text</option>
                  </select>
                </div>
                {(local.mode === "browse" || local.mode === "fetch") && (
                  <div className="space-y-1">
                    <Label className="text-xs">URL</Label>
                    <Input className="h-8 text-xs" value={local.url ?? ""} onChange={e => set("url", e.target.value)} placeholder="https://example.com/page" />
                  </div>
                )}
                {(local.mode === "search" || local.mode === "research" || !local.mode) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Search query</Label>
                    <Input className="h-8 text-xs" value={local.query ?? ""} onChange={e => set("query", e.target.value)} placeholder="latest AI news {{contact.interest}}" />
                  </div>
                )}
                {local.mode === "research" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Max pages (1–10)</Label>
                    <Input className="h-8 text-xs" type="number" min={1} max={10} value={local.max_pages ?? 5} onChange={e => set("max_pages", parseInt(e.target.value) || 5)} />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Save result to variable</Label>
                  <Input className="h-8 text-xs font-mono" value={local.save_to ?? "web_result"} onChange={e => set("save_to", e.target.value)} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Send summary as reply</Label>
                  <input type="checkbox" checked={!!local.send_reply} onChange={e => set("send_reply", e.target.checked)} className="h-4 w-4" />
                </div>
              </>
            )}
            {local.action === "send_webhook" && (
              <div className="space-y-1">
                <Label className="text-xs">Webhook URL</Label>
                <Input className="h-8 text-xs" value={local.url ?? ""} onChange={e => set("url", e.target.value)} placeholder="https://hooks.zapier.com/..." />
              </div>
            )}
            {local.action === "wallet_action" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Card serial (variable)</Label>
                  <Input className="h-8 text-xs font-mono" value={local.serial ?? ""} onChange={e => set("serial", e.target.value)} placeholder="{{wallet_serial}} or {{contact.wallet_serial}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Wallet action</Label>
                  <select className="w-full rounded-md border text-xs px-2 py-1.5" value={local.wallet_action ?? "add_punch"} onChange={e => set("wallet_action", e.target.value)}>
                    <optgroup label="Punch Card">
                      <option value="add_punch">Add Punch</option>
                      <option value="remove_punch">Remove Punch</option>
                      <option value="redeem">Redeem Reward</option>
                    </optgroup>
                    <optgroup label="Points">
                      <option value="add_points">Add Points</option>
                      <option value="remove_points">Remove Points</option>
                      <option value="redeem_points_reward">Redeem Points Reward</option>
                    </optgroup>
                    <optgroup label="Membership">
                      <option value="set_tier">Set Tier</option>
                    </optgroup>
                    <optgroup label="Coupon">
                      <option value="redeem_coupon">Redeem Coupon</option>
                    </optgroup>
                    <optgroup label="Prepaid Balance">
                      <option value="load_balance">Load Balance</option>
                      <option value="deduct_balance">Deduct Balance</option>
                    </optgroup>
                    <optgroup label="Event Ticket">
                      <option value="check_in">Check In</option>
                      <option value="un_check_in">Un-Check In</option>
                    </optgroup>
                  </select>
                </div>
                {["add_punch","remove_punch","add_points","remove_points","redeem_points_reward","set_tier","load_balance","deduct_balance"].includes(local.wallet_action ?? "") && (
                  <div className="space-y-1">
                    <Label className="text-xs">Value (amount / tier name)</Label>
                    <Input className="h-8 text-xs" value={local.value ?? ""} onChange={e => set("value", e.target.value)} placeholder="e.g. 10 or Gold" />
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs">Custom push message <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input className="h-8 text-xs" value={local.message ?? ""} onChange={e => set("message", e.target.value)} placeholder="You just earned {{wallet_punches}} punches!" />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Silent (skip push notification)</Label>
                  <input type="checkbox" checked={!!local.silent} onChange={e => set("silent", e.target.checked)} className="h-4 w-4" />
                </div>
              </>
            )}
            {local.action === "wallet_push" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Card serial (variable)</Label>
                  <Input className="h-8 text-xs font-mono" value={local.serial ?? ""} onChange={e => set("serial", e.target.value)} placeholder="{{wallet_serial}}" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Message</Label>
                  <textarea className="w-full rounded-md border text-xs px-3 py-2 min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                    value={local.message ?? ""} onChange={e => set("message", e.target.value)}
                    placeholder="You have {{wallet_punches}} of {{wallet_max_punches}} punches!" />
                  <p className="text-[10px] text-muted-foreground">Variables: {'{{wallet_punches}}'}, {'{{wallet_points}}'}, {'{{customerName}}'}, {'{{wallet_program_name}}'}</p>
                </div>
              </>
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

// ── Webhook panel ─────────────────────────────────────────────────────────────

function WebhookPanel({
  flowId,
  webhookSecret,
  onSecretChange,
  onClose,
}: {
  flowId: string;
  webhookSecret: string | null;
  onSecretChange: (secret: string) => void;
  onClose: () => void;
}) {
  const [regenerating, setRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
  const webhookUrl = webhookSecret
    ? `${apiBase}/webhooks/flow/${flowId}/${webhookSecret}`
    : "";

  async function regenerate() {
    setRegenerating(true);
    try {
      const { data } = await apiClient.post(`/api/v1/flows/${flowId}/webhook`, { regenerate: true });
      onSecretChange(data.data.webhook_secret);
    } finally {
      setRegenerating(false);
    }
  }

  function copyUrl() {
    navigator.clipboard.writeText(webhookUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Webhook className="h-4 w-4" /> Webhook
        </span>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Send a POST request to this URL to trigger the flow externally. The flow must be active.
        </p>
        <div className="space-y-1">
          <Label className="text-xs">Webhook URL</Label>
          <div className="flex gap-2">
            <Input
              readOnly
              className="h-8 text-xs font-mono bg-muted"
              value={webhookUrl}
            />
            <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={copyUrl} title="Copy URL">
              {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Secret token</Label>
          <p className="rounded bg-muted px-3 py-2 font-mono text-xs break-all">{webhookSecret ?? "—"}</p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-8 w-full gap-1.5 text-xs"
          onClick={regenerate}
          disabled={regenerating}
        >
          {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Regenerate secret
        </Button>
        <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Example body</p>
          <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap">{`{\n  "contact_id": "...",\n  "event": "purchase",\n  "data": { "amount": 99 }\n}`}</pre>
        </div>
      </div>
    </div>
  );
}

// ── Run history panel ─────────────────────────────────────────────────────────

interface FlowRun {
  id: string;
  status: string;
  contact_id: string | null;
  current_node_id: string | null;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  running:   "bg-blue-500",
  waiting:   "bg-amber-500",
  completed: "bg-green-500",
  failed:    "bg-red-500",
  cancelled: "bg-slate-400",
};

function RunHistoryPanel({
  flowId,
  onClose,
}: {
  flowId: string;
  onClose: () => void;
}) {
  const [runs, setRuns] = useState<FlowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    setLoading(true);
    apiClient.get(`/api/v1/flows/${flowId}/runs?limit=50`)
      .then(({ data }) => {
        setRuns(data.data ?? []);
        setTotal(data.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [flowId]);

  function duration(run: FlowRun) {
    if (!run.completed_at) return "—";
    const ms = new Date(run.completed_at).getTime() - new Date(run.started_at).getTime();
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.round(ms / 60000)}m`;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <History className="h-4 w-4" /> Run History
          {total > 0 && (
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">{total}</span>
          )}
        </span>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Clock className="h-8 w-8 opacity-30" />
            <p className="text-xs">No runs yet</p>
          </div>
        ) : (
          <div className="divide-y">
            {runs.map(run => (
              <div key={run.id} className="px-4 py-3 hover:bg-muted/30">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_COLOR[run.status] ?? "bg-slate-400"}`} />
                  <span className="text-xs font-medium capitalize">{run.status}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{duration(run)}</span>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {new Date(run.started_at).toLocaleString()}
                </p>
                {run.contact_id && (
                  <p className="text-[10px] font-mono text-muted-foreground truncate mt-0.5">
                    Contact: {run.contact_id.slice(0, 8)}…
                  </p>
                )}
                {run.error && (
                  <p className="mt-1 text-[10px] text-red-500 line-clamp-2">{run.error}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Flow simulator panel ──────────────────────────────────────────────────────

function FlowSimulatorPanel({
  flowId,
  onClose,
}: {
  flowId: string;
  onClose: () => void;
}) {
  const [contactId, setContactId] = useState("");
  const [triggerData, setTriggerData] = useState("{}");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{
    run_id: string;
    status: string;
    context: Record<string, unknown>;
    current_node_id?: string;
    error?: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    setError(null);
    try {
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(triggerData); } catch { setError("Trigger data must be valid JSON"); setRunning(false); return; }
      const res = await apiClient.post(`/api/v1/flows/${flowId}/trigger`, {
        contact_id: contactId.trim() || undefined,
        data,
      });
      setResult(res.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to trigger flow");
    } finally {
      setRunning(false);
    }
  }

  const statusColor: Record<string, string> = {
    completed: "text-green-600",
    failed: "text-red-500",
    waiting: "text-amber-600",
    running: "text-blue-500",
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-primary" /> Simulator
        </span>
        <button onClick={onClose} className="rounded p-1 hover:bg-muted">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="space-y-1">
          <Label className="text-xs">Contact ID (optional)</Label>
          <Input
            className="h-8 text-xs font-mono"
            value={contactId}
            onChange={(e) => setContactId(e.target.value)}
            placeholder="Leave blank for anonymous test"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Trigger data (JSON)</Label>
          <textarea
            className="w-full rounded-md border text-xs px-3 py-2 font-mono min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-primary"
            value={triggerData}
            onChange={(e) => setTriggerData(e.target.value)}
            placeholder='{}'
          />
        </div>
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {result && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Result</p>
            <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status:</span>
                <span className={`text-xs font-semibold ${statusColor[result.status] ?? ""}`}>
                  {result.status}
                </span>
              </div>
              {result.current_node_id && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Stopped at:</span>
                  <span className="text-xs font-mono">{result.current_node_id}</span>
                </div>
              )}
              {result.error && (
                <div className="text-xs text-red-500 mt-1">{result.error}</div>
              )}
              {Object.keys(result.context || {}).length > 0 && (
                <div>
                  <p className="text-[10px] text-muted-foreground mt-2 mb-1">Context variables:</p>
                  <pre className="text-[10px] font-mono bg-muted rounded p-2 overflow-x-auto">
                    {JSON.stringify(result.context, null, 2)}
                  </pre>
                </div>
              )}
              <p className="text-[10px] text-muted-foreground font-mono mt-1">Run: {result.run_id.slice(0, 8)}…</p>
            </div>
          </div>
        )}
      </div>
      <div className="border-t px-4 py-3">
        <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={run} disabled={running}>
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
          {running ? "Running…" : "Run Simulation"}
        </Button>
      </div>
    </div>
  );
}

// ── Main editor ───────────────────────────────────────────────────────────────

let nodeIdCounter = 100;
function newNodeId() {
  return `node-${++nodeIdCounter}`;
}

type RightPanel = "node" | "webhook" | "history" | "simulator" | null;

export default function FlowEditorPage() {
  const { id: flowId } = useParams<{ id: string }>();
  const router = useRouter();

  const [flowName, setFlowName] = useState("Loading…");
  const [isActive, setIsActive] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [startingNodeId, setStartingNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Derived list of variable names defined by user_input nodes — used by VarTextarea autocomplete
  const flowVars = nodes
    .filter((n) => (n.data as any).nodeType === "user_input" && (n.data as any).variable)
    .map((n) => (n.data as any).variable as string);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

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
      setStartingNodeId(f.starting_node_id ?? null);
      const snId = f.starting_node_id ?? null;
      setStartingNodeId(snId);
      setNodes(toRFNodes(f.nodes || []).map((n: Node) => ({
        ...n,
        data: { ...n.data, isStartingNode: n.id === snId },
      })));
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

  function duplicateNode(node: Node) {
    const id = newNodeId();
    const copy: Node = {
      ...node,
      id,
      position: { x: node.position.x + 40, y: node.position.y + 40 },
      selected: false,
    };
    setNodes(nds => [...nds, copy]);
  }

  function setAsStartingNode(nodeId: string) {
    const newId = startingNodeId === nodeId ? null : nodeId;
    setStartingNodeId(newId);
    setNodes(nds => nds.map(n => ({
      ...n,
      data: { ...n.data, isStartingNode: n.id === newId },
    })));
  }

  async function save() {
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/flows/${flowId}`, {
        name: flowName,
        nodes: fromRFNodes(nodes),
        edges,
        starting_node_id: startingNodeId,
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

  function openNodePanel(node: Node) {
    setSelectedNode(node);
    setRightPanel("node");
  }

  function closeRightPanel() {
    setSelectedNode(null);
    setRightPanel(null);
  }

  function togglePanel(panel: Exclude<RightPanel, "node">) {
    setRightPanel(prev => {
      if (prev === panel) { setSelectedNode(null); return null; }
      setSelectedNode(null);
      return panel;
    });
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
          <Button
            size="sm"
            variant={rightPanel === "webhook" ? "secondary" : "ghost"}
            className="h-8 gap-1 text-xs"
            onClick={() => togglePanel("webhook")}
          >
            <Webhook className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Webhook</span>
          </Button>
          <Button
            size="sm"
            variant={rightPanel === "history" ? "secondary" : "ghost"}
            className="h-8 gap-1 text-xs"
            onClick={() => togglePanel("history")}
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden md:inline">History</span>
          </Button>
          <Button
            size="sm"
            variant={rightPanel === "simulator" ? "secondary" : "ghost"}
            className="h-8 gap-1 text-xs"
            onClick={() => togglePanel("simulator")}
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Simulate</span>
          </Button>
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
            onNodeClick={(_, node) => openNodePanel(node)}
            onPaneClick={() => { setSelectedNode(null); if (rightPanel === "node") setRightPanel(null); }}
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

        {/* Right panel */}
        {rightPanel && (
          <div className="w-72 border-l bg-background overflow-hidden flex flex-col">
            {rightPanel === "node" && selectedNode && (
              <NodeConfigPanel
                node={selectedNode}
                onUpdate={updateNodeData}
                onDelete={deleteNode}
                onClose={closeRightPanel}
                onCopy={duplicateNode}
                onSetStart={setAsStartingNode}
                isStartingNode={startingNodeId === selectedNode.id}
                flowVars={flowVars}
              />
            )}
            {rightPanel === "webhook" && (
              <WebhookPanel
                flowId={flowId}
                webhookSecret={webhookSecret}
                onSecretChange={setWebhookSecret}
                onClose={closeRightPanel}
              />
            )}
            {rightPanel === "history" && (
              <RunHistoryPanel
                flowId={flowId}
                onClose={closeRightPanel}
              />
            )}
            {rightPanel === "simulator" && (
              <FlowSimulatorPanel
                flowId={flowId}
                onClose={closeRightPanel}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
