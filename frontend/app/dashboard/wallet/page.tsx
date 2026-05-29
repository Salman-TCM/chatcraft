"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Wallet, Plus, Loader2, Pencil, Trash2, Users, Send, X,
  ChevronDown, ChevronRight, Download, Smartphone, RefreshCw,
  Check, AlertCircle, Upload, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

// ── Interfaces ─────────────────────────────────────────────────────────────────
interface ProgramType {
  value: string; label: string; icon: string; description: string;
}
interface WalletProgram {
  id: string; name: string; type: string; description: string | null;
  status: string; config: Record<string, unknown>;
  brand_overrides: Record<string, string>; google_class_id: string | null;
  created_at: string;
}
interface WalletCard {
  id: string; serial: string; customer_name: string | null;
  customer_email: string | null; customer_phone: string | null;
  status: string; state: Record<string, unknown>;
  google_pass_object_id: string | null; created_at: string;
}
interface Agent {
  id: string; name: string; description: string | null;
  tools: Record<string, boolean>;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, { label: string; hasValue: boolean; valueLabel?: string }> = {
  add_punch:      { label: "Add Punch",      hasValue: false },
  remove_punch:   { label: "Remove Punch",   hasValue: false },
  set_punches:    { label: "Set Punches",    hasValue: true,  valueLabel: "Count"     },
  redeem:         { label: "Redeem",         hasValue: false },
  add_points:     { label: "Add Points",     hasValue: true,  valueLabel: "Points"    },
  remove_points:  { label: "Remove Points",  hasValue: true,  valueLabel: "Points"    },
  set_tier:       { label: "Set Tier",       hasValue: true,  valueLabel: "Tier name" },
  load_balance:   { label: "Load Balance",   hasValue: true,  valueLabel: "Amount"    },
  deduct_balance: { label: "Deduct Balance", hasValue: true,  valueLabel: "Amount"    },
  refund_balance: { label: "Refund Balance", hasValue: true,  valueLabel: "Amount"    },
  set_balance:    { label: "Set Balance",    hasValue: true,  valueLabel: "Amount"    },
  check_in:       { label: "Check In",       hasValue: false },
  un_check_in:    { label: "Un-Check In",    hasValue: false },
};
const TYPE_ACTIONS: Record<string, string[]> = {
  punch_card:      ["add_punch", "remove_punch", "set_punches", "redeem"],
  points:          ["add_points", "remove_points", "set_tier", "redeem"],
  membership:      ["set_tier", "add_points", "remove_points"],
  prepaid_balance: ["load_balance", "deduct_balance", "refund_balance", "set_balance"],
  event_ticket:    ["check_in", "un_check_in"],
  coupon:          ["redeem"],
  business_card:   [],
};
const TOOL_LABELS: Record<string, string> = {
  web_search: "web search", send_email: "email", send_sms: "SMS",
  create_contact: "contacts", update_contact: "contact updates",
  create_task: "tasks", send_notification: "push notifications",
};
// Deterministic 7×7 QR pattern — no Math.random() in render
const QR7 = [
  1,1,1,1,1,1,1,
  1,0,0,0,0,0,1,
  1,0,1,0,1,0,1,
  1,0,0,1,0,0,1,
  1,0,1,0,1,0,1,
  1,0,0,0,0,0,1,
  1,1,1,1,1,1,1,
];
const JOIN_FIELDS = [
  { key: "name",        label: "Full name"   },
  { key: "email",       label: "Email"       },
  { key: "phone",       label: "Phone"       },
  { key: "birthday",    label: "Birthday"    },
  { key: "postal_code", label: "Postal code" },
];

// ── Wallet pass preview ────────────────────────────────────────────────────────
// Proportions mirror a real Apple Wallet loyalty pass (375×150 at 1x)
function WalletCardPreview({ type, name, config, brand, programTypes }: {
  type: string; name: string; config: Record<string, string>;
  brand: Record<string, string>; programTypes: ProgramType[];
}) {
  const bg  = brand.background_color || "#4f46e5";
  const fg  = brand.foreground_color || "#ffffff";
  const dim = brand.label_color      || `${fg}99`;
  const typeInfo   = programTypes.find((t) => t.value === type);
  const maxPunches = Math.min(Math.max(parseInt(config.max_punches || "10") || 10, 1), 14);

  return (
    <div
      className="relative flex-shrink-0 overflow-hidden"
      style={{ backgroundColor: bg, width: 288, height: 172, borderRadius: 16 }}
    >
      {/* Subtle glass sheen */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)" }} />

      {/* Top row: logo + type label */}
      <div className="flex items-center justify-between px-4 pt-3.5">
        <div className="h-6 flex items-center">
          {brand.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.logo_url} alt="" className="h-6 max-w-[72px] object-contain" />
          ) : (
            <div className="h-6 rounded-md flex items-center px-2"
              style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
              <span className="text-[10px] font-semibold tracking-wide" style={{ color: fg }}>LOGO</span>
            </div>
          )}
        </div>
        <span className="text-[10px] font-semibold tracking-wide" style={{ color: dim }}>
          {typeInfo?.label?.toUpperCase() ?? type.toUpperCase()}
        </span>
      </div>

      {/* Program name */}
      <div className="px-4 mt-2">
        <p className="text-[17px] font-bold leading-tight truncate" style={{ color: fg }}>
          {name || "Program name"}
        </p>
      </div>

      {/* Type-specific content */}
      <div className="px-4 mt-2.5">
        {type === "punch_card" && (
          <div className="flex flex-wrap gap-[5px]">
            {Array.from({ length: maxPunches }).map((_, i) => (
              <div key={i} style={{
                width: 14, height: 14, borderRadius: "50%",
                border: `1.5px solid ${fg}`,
                backgroundColor: i < Math.ceil(maxPunches / 4) ? fg : "transparent",
              }} />
            ))}
          </div>
        )}
        {type === "points" && (
          <div>
            <span style={{ color: fg, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>1,250</span>
            <span style={{ color: dim, fontSize: 12, marginLeft: 4 }}>points</span>
          </div>
        )}
        {type === "membership" && (
          <div className="inline-flex items-center rounded-full px-2.5 py-0.5"
            style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
            <span className="text-xs font-semibold" style={{ color: fg }}>
              {config.default_tier || "Standard"}
            </span>
          </div>
        )}
        {type === "prepaid_balance" && (
          <div>
            <span style={{ color: dim, fontSize: 11 }}>{config.currency || "USD"}</span>
            <span style={{ color: fg, fontSize: 26, fontWeight: 700, lineHeight: 1, marginLeft: 3 }}>50.00</span>
          </div>
        )}
        {type === "event_ticket" && (
          <div>
            <p className="text-sm font-semibold leading-tight truncate" style={{ color: fg }}>
              {config.event_name || "Event name"}
            </p>
            <p className="text-xs mt-0.5" style={{ color: dim }}>
              {config.event_date || "Date TBD"} · {config.default_seat || "General Admission"}
            </p>
          </div>
        )}
        {type === "coupon" && (
          <span style={{ color: fg, fontSize: 22, fontWeight: 700 }}>
            {config.offer_value || "20% Off"}
          </span>
        )}
        {type === "business_card" && (
          <p className="text-xs" style={{ color: dim }}>Digital business card</p>
        )}
      </div>

      {/* Bottom-right QR placeholder */}
      <div className="absolute bottom-3 right-3 bg-white rounded-md p-1" style={{ width: 38, height: 38 }}>
        <div className="grid w-full h-full" style={{ gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
          {QR7.map((cell, i) => (
            <div key={i} style={{ backgroundColor: cell ? "#1a1a1a" : "#ffffff" }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Field with inline validation icon ─────────────────────────────────────────
function ValidatedInput({
  label, value, onChange, onBlur, placeholder, touched, error, className = "",
  type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  placeholder: string; touched: boolean; error?: string; className?: string; type?: string;
}) {
  const invalid = touched && !!error;
  const valid   = touched && !error && value.trim().length > 0;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-sm">{label}</Label>
      <div className="relative">
        <Input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className={`pr-8 ${invalid ? "border-destructive focus-visible:ring-destructive" : ""}`}
        />
        {valid   && <Check       className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />}
        {invalid && <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />}
      </div>
      {invalid && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Color field with swatch + native picker ────────────────────────────────────
function ColorField({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <div className="flex items-center gap-2">
        <div className="relative w-8 h-8 rounded-md border border-border shrink-0 overflow-hidden cursor-pointer shadow-sm">
          <div className="absolute inset-0" style={{ backgroundColor: value || placeholder }} />
          <input type="color" value={value || placeholder} onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
        </div>
        <Input value={value} onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder} className="h-8 text-sm font-mono" />
      </div>
    </div>
  );
}

// ── Logo upload zone ───────────────────────────────────────────────────────────
function LogoUploadZone({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function readFile(f: File | undefined) {
    if (!f?.type.startsWith("image/")) return;
    const r = new FileReader();
    r.onload = (e) => onChange((e.target?.result as string) ?? "");
    r.readAsDataURL(f);
  }

  const hasUpload = value?.startsWith("data:");

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">Logo</Label>
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); readFile(e.dataTransfer.files[0]); }}
        onClick={() => !hasUpload && fileRef.current?.click()}
        className={`relative rounded-lg border-2 border-dashed transition-colors duration-150 ${
          drag ? "border-primary bg-primary/5" : "border-border hover:border-border/80"
        } ${!hasUpload ? "cursor-pointer" : ""}`}
      >
        {hasUpload ? (
          <div className="flex items-center gap-3 p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="" className="h-9 max-w-[90px] object-contain rounded" />
            <span className="text-sm text-muted-foreground flex-1">Logo ready</span>
            <button
              onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="shrink-0 rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Remove logo"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-4">
            <Upload className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">
              Drop an image, or <span className="text-primary font-medium">browse</span>
            </p>
            <p className="text-xs text-muted-foreground/60">PNG · SVG · JPG</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => readFile(e.target.files?.[0])} />
      {!hasUpload && (
        <Input
          value={value.startsWith("data:") ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste a logo URL instead"
          className="h-8 text-sm"
        />
      )}
    </div>
  );
}

// ── Collapsible (used only for join form — one level, no nesting) ──────────────
function Collapsible({ title, complete, children, defaultOpen = false }: {
  title: string; complete: boolean; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors">
        <span>{title}</span>
        <div className="flex items-center gap-2">
          {complete && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100">
              <Check className="h-2.5 w-2.5 text-green-600" />
            </span>
          )}
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-3 border-t space-y-4">{children}</div>}
    </div>
  );
}

// ── 2-step stepper ─────────────────────────────────────────────────────────────
type ModalStep = "setup" | "appearance";

function StepIndicator({ current, onGoBack }: { current: ModalStep; onGoBack: () => void }) {
  const steps = [{ label: "Setup" }, { label: "Appearance" }];
  const ci    = current === "setup" ? 0 : 1;
  return (
    <div className="flex items-center justify-center gap-0 px-6 py-3 border-b">
      {steps.map((step, i) => {
        const done   = i < ci;
        const active = i === ci;
        return (
          <div key={step.label} className="flex items-center">
            <button
              onClick={done ? onGoBack : undefined}
              disabled={!done}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                active ? "text-foreground"
                : done  ? "text-muted-foreground hover:text-foreground cursor-pointer"
                :         "text-muted-foreground/50 cursor-default"}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all ${
                done   ? "bg-primary text-primary-foreground"
                : active ? "bg-foreground text-background"
                :          "bg-muted text-muted-foreground"}`}
              >
                {done ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              {step.label}
            </button>
            {i < steps.length - 1 && (
              <div className={`w-10 h-px mx-3 transition-colors ${done ? "bg-primary" : "bg-border"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function agentCapabilities(tools: Record<string, boolean>): string {
  const active = Object.entries(tools)
    .filter(([, v]) => v)
    .map(([k]) => TOOL_LABELS[k] ?? k.replace(/_/g, " "));
  if (!active.length) return "No tools enabled";
  return active.slice(0, 4).join(", ") + (active.length > 4 ? ` +${active.length - 4}` : "");
}

// ── Main page ──────────────────────────────────────────────────────────────────
type View = "list" | "cards";

export default function WalletPage() {
  const [programTypes,  setProgramTypes]  = useState<ProgramType[]>([]);
  const [programs,      setPrograms]      = useState<WalletProgram[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [view,          setView]          = useState<View>("list");
  const [activeProgram, setActiveProgram] = useState<WalletProgram | null>(null);
  const [cards,         setCards]         = useState<WalletCard[]>([]);
  const [cardsLoading,  setCardsLoading]  = useState(false);
  const [agents,        setAgents]        = useState<Agent[]>([]);

  // Modal
  const [showModal,      setShowModal]      = useState(false);
  const [editingProgram, setEditingProgram] = useState<WalletProgram | null>(null);
  const [modalStep,      setModalStep]      = useState<ModalStep>("setup");
  const [progName,       setProgName]       = useState("");
  const [progDesc,       setProgDesc]       = useState("");
  const [progType,       setProgType]       = useState("");
  const [progConfig,     setProgConfig]     = useState<Record<string, string>>({});
  const [progBrand,      setProgBrand]      = useState<Record<string, string>>({});
  const [progAgentId,    setProgAgentId]    = useState("");
  const [joinFields,     setJoinFields]     = useState<string[]>(["name", "email"]);
  // Track which fields have been interacted with (for validation)
  const [nameTouched,    setNameTouched]    = useState(false);
  const [configTouched,  setConfigTouched]  = useState<Set<string>>(new Set());
  const [saving,         setSaving]         = useState(false);

  // Issue card
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueName,      setIssueName]      = useState("");
  const [issueEmail,     setIssueEmail]     = useState("");
  const [issuePhone,     setIssuePhone]     = useState("");
  const [issuingCard,    setIssuingCard]    = useState(false);

  // Card action
  const [actionCard,     setActionCard]     = useState<WalletCard | null>(null);
  const [selectedAction, setSelectedAction] = useState("");
  const [actionValue,    setActionValue]    = useState("");
  const [runningAction,  setRunningAction]  = useState(false);

  // Push
  const [pushTarget,  setPushTarget]  = useState<{ type: "card"; serial: string } | { type: "program"; id: string } | null>(null);
  const [pushMessage, setPushMessage] = useState("");
  const [sendingPush, setSendingPush] = useState(false);

  // ── Data loading ─────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, progsRes, agentsRes] = await Promise.all([
        apiClient.get("/api/wallet/program-types"),
        apiClient.get("/api/wallet/programs?limit=100"),
        apiClient.get("/api/v1/agents").catch(() => ({ data: { data: [] } })),
      ]);
      setProgramTypes(typesRes.data.data ?? []);
      setPrograms(progsRes.data.data ?? []);
      setAgents(agentsRes.data.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadCards(program: WalletProgram) {
    setActiveProgram(program);
    setCardsLoading(true);
    setView("cards");
    try {
      const res = await apiClient.get(`/api/wallet/programs/${program.id}/cards?limit=100`);
      setCards(res.data.data ?? []);
    } catch {}
    setCardsLoading(false);
  }

  // ── Modal helpers ─────────────────────────────────────────────────────────────
  function resetModal() {
    setProgName(""); setProgDesc(""); setProgType(""); setProgConfig({}); setProgBrand({});
    setProgAgentId(""); setJoinFields(["name", "email"]);
    setNameTouched(false); setConfigTouched(new Set());
    setModalStep("setup");
  }

  function openCreate() {
    setEditingProgram(null);
    resetModal();
    setShowModal(true);
  }

  function openEdit(p: WalletProgram) {
    setEditingProgram(p);
    setProgName(p.name); setProgDesc(p.description ?? "");
    setProgType(p.type);
    setProgConfig(Object.fromEntries(Object.entries(p.config).map(([k, v]) => [k, String(v)])));
    setProgBrand({ ...p.brand_overrides });
    setProgAgentId(""); setJoinFields(["name", "email"]);
    setNameTouched(false); setConfigTouched(new Set());
    setModalStep("setup");
    setShowModal(true);
  }

  async function saveProgram() {
    if (!progName.trim() || !progType) return;
    setSaving(true);
    try {
      const payload = {
        name: progName.trim(),
        description: progDesc.trim() || null,
        type: progType,
        config: progConfig,
        brand_overrides: progBrand,
      };
      if (editingProgram) {
        await apiClient.patch(`/api/wallet/programs/${editingProgram.id}`, payload);
      } else {
        await apiClient.post("/api/wallet/programs", payload);
      }
      setShowModal(false);
      await load();
    } catch {}
    setSaving(false);
  }

  async function deleteProgram(id: string) {
    if (!confirm("Delete this program and all its issued cards?")) return;
    try {
      await apiClient.delete(`/api/wallet/programs/${id}`);
      setPrograms((p) => p.filter((pg) => pg.id !== id));
    } catch {}
  }

  async function issueCard() {
    if (!activeProgram) return;
    setIssuingCard(true);
    try {
      await apiClient.post(`/api/wallet/programs/${activeProgram.id}/cards`, {
        customer_name:  issueName  || null,
        customer_email: issueEmail || null,
        customer_phone: issuePhone || null,
      });
      setShowIssueModal(false);
      setIssueName(""); setIssueEmail(""); setIssuePhone("");
      await loadCards(activeProgram);
    } catch {}
    setIssuingCard(false);
  }

  async function revokeCard(serial: string) {
    if (!confirm("Revoke this card? The customer will lose access.")) return;
    try {
      await apiClient.delete(`/api/wallet/cards/${serial}`);
      setCards((p) => p.map((c) => c.serial === serial ? { ...c, status: "revoked" } : c));
    } catch {}
  }

  async function runAction() {
    if (!actionCard || !selectedAction) return;
    setRunningAction(true);
    try {
      const res = await apiClient.post(`/api/wallet/cards/${actionCard.serial}/action`, {
        action: selectedAction,
        value: actionValue || undefined,
      });
      setCards((p) => p.map((c) => c.serial === actionCard.serial ? res.data.data : c));
      setActionCard(res.data.data);
      setSelectedAction(""); setActionValue("");
    } catch {}
    setRunningAction(false);
  }

  async function sendPush() {
    if (!pushTarget || !pushMessage.trim()) return;
    setSendingPush(true);
    try {
      const url = pushTarget.type === "card"
        ? `/api/wallet/cards/${pushTarget.serial}/push`
        : `/api/wallet/programs/${pushTarget.id}/push`;
      const res = await apiClient.post(url, { message: pushMessage });
      alert(`Push sent to ${res.data.data.sent} device(s).`);
      setPushTarget(null); setPushMessage("");
    } catch {}
    setSendingPush(false);
  }

  function configFields(type: string): { key: string; label: string; placeholder: string; numeric?: boolean }[] {
    if (type === "punch_card")      return [
      { key: "max_punches",        label: "Max punches",       placeholder: "10",                     numeric: true },
      { key: "reward_description", label: "Reward",            placeholder: "e.g. Free coffee"                     },
    ];
    if (type === "points")          return [
      { key: "points_per_dollar",  label: "Points per dollar", placeholder: "1",                      numeric: true },
      { key: "default_tier",       label: "Starting tier",     placeholder: "e.g. Bronze"                          },
    ];
    if (type === "membership")      return [
      { key: "default_tier",       label: "Default tier",      placeholder: "e.g. Standard"                        },
    ];
    if (type === "prepaid_balance") return [
      { key: "initial_balance",    label: "Starting balance",  placeholder: "0",                      numeric: true },
      { key: "currency",           label: "Currency",          placeholder: "USD"                                  },
    ];
    if (type === "event_ticket")    return [
      { key: "event_name",         label: "Event name",        placeholder: "e.g. Annual Summit 2026"              },
      { key: "event_date",         label: "Date",              placeholder: "e.g. Jan 15, 2026"                    },
      { key: "default_seat",       label: "Default seat",      placeholder: "General Admission"                    },
    ];
    if (type === "coupon")          return [
      { key: "offer_label",        label: "Offer label",       placeholder: "e.g. Welcome offer"                   },
      { key: "offer_value",        label: "Discount",          placeholder: "e.g. 20% off"                         },
    ];
    return [];
  }

  function touchConfig(key: string) {
    setConfigTouched((prev) => { const n = new Set(prev); n.add(key); return n; });
  }

  // Derived
  const selectedAgent   = agents.find((a) => a.id === progAgentId) ?? null;
  const typeInfo        = programTypes.find((t) => t.value === progType);
  const nameError       = nameTouched && !progName.trim() ? "Program name is required" : undefined;
  const descOverLimit   = progDesc.length > 200;
  const setupCanAdvance = !!progType && !!progName.trim() && !descOverLimit;
  const apiBase         = process.env.NEXT_PUBLIC_API_URL ?? "";

  // ── Modal step content ────────────────────────────────────────────────────────
  function renderSetup() {
    const fields = configFields(progType);

    return (
      <div className="space-y-6">

        {/* Type selector — locked in edit mode */}
        {editingProgram ? (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 border px-4 py-3">
            <span className="text-2xl shrink-0">{typeInfo?.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{typeInfo?.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Program type cannot be changed after creation
              </p>
            </div>
            <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-sm">Program type</Label>
            <div className="grid grid-cols-2 gap-2">
              {programTypes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => { setProgType(t.value); setProgConfig({}); }}
                  className={`text-left rounded-xl border-2 px-3 py-3 transition-all duration-150 ${
                    progType === t.value
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-border/60 hover:bg-muted/30"}`}
                >
                  <div className="text-xl mb-1">{t.icon}</div>
                  <p className="text-sm font-medium leading-tight">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                    {t.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Details — animate in once a type is picked */}
        {progType && (
          <div className="space-y-4">

            {/* Name */}
            <ValidatedInput
              label="Program name"
              value={progName}
              onChange={setProgName}
              onBlur={() => setNameTouched(true)}
              placeholder={
                progType === "punch_card"      ? "e.g. Coffee Club"
                : progType === "points"        ? "e.g. Rewards Program"
                : progType === "membership"    ? "e.g. Gold Membership"
                : progType === "event_ticket"  ? "e.g. Annual Conference"
                : progType === "coupon"        ? "e.g. Welcome Offer"
                : progType === "business_card" ? "e.g. My Business Card"
                : "e.g. Store Credit"
              }
              touched={nameTouched}
              error={nameError}
            />

            {/* Description */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Description <span className="text-muted-foreground font-normal text-xs">optional</span></Label>
                <span className={`text-xs tabular-nums ${descOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
                  {progDesc.length} / 200
                </span>
              </div>
              <textarea
                value={progDesc}
                onChange={(e) => setProgDesc(e.target.value)}
                placeholder="e.g. Earn rewards on every purchase — redeemable in store."
                rows={2}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ${
                  descOverLimit ? "border-destructive" : ""}`}
              />
            </div>

            {/* Type-specific config — shown inline, no collapsible */}
            {fields.length > 0 && (
              <div className={`grid gap-3 ${fields.length >= 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {fields.map((f) => {
                  const touched = configTouched.has(f.key);
                  const val     = progConfig[f.key] ?? "";
                  const err     = touched && val && f.numeric && isNaN(Number(val)) ? "Must be a number" : undefined;
                  return (
                    <ValidatedInput
                      key={f.key}
                      label={f.label}
                      value={val}
                      onChange={(v) => setProgConfig((p) => ({ ...p, [f.key]: v }))}
                      onBlur={() => touchConfig(f.key)}
                      placeholder={f.placeholder}
                      touched={configTouched.has(f.key)}
                      error={err}
                    />
                  );
                })}
              </div>
            )}

            {/* AI agent — simple select, no decorator */}
            <div className="space-y-1.5">
              <Label className="text-sm">
                AI Agent <span className="text-muted-foreground font-normal text-xs">optional</span>
              </Label>
              <select
                value={progAgentId}
                onChange={(e) => setProgAgentId(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">None</option>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {selectedAgent && (
                <p className="text-xs text-muted-foreground">
                  {selectedAgent.name} handles: {agentCapabilities(selectedAgent.tools)}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderAppearance() {
    return (
      <div className="space-y-5">

        <LogoUploadZone
          value={progBrand.logo_url ?? ""}
          onChange={(v) => setProgBrand((b) => ({ ...b, logo_url: v }))}
        />

        {/* 3-column color row */}
        <div className="grid grid-cols-3 gap-3">
          <ColorField
            label="Background"
            value={progBrand.background_color ?? ""}
            placeholder="#4f46e5"
            onChange={(v) => setProgBrand((b) => ({ ...b, background_color: v }))}
          />
          <ColorField
            label="Text"
            value={progBrand.foreground_color ?? ""}
            placeholder="#ffffff"
            onChange={(v) => setProgBrand((b) => ({ ...b, foreground_color: v }))}
          />
          <ColorField
            label="Labels"
            value={progBrand.label_color ?? ""}
            placeholder="#c0c0ff"
            onChange={(v) => setProgBrand((b) => ({ ...b, label_color: v }))}
          />
        </div>

        {/* Join form — optional, collapsed by default */}
        <Collapsible title="Customize join form" complete={joinFields.length >= 2}>
          <p className="text-sm text-muted-foreground -mt-1">
            Select which fields customers fill when signing up for this program.
          </p>
          <div className="flex flex-wrap gap-2">
            {JOIN_FIELDS.map((f) => {
              const enabled  = joinFields.includes(f.key);
              const required = f.key === "name";
              return (
                <button
                  key={f.key}
                  disabled={required}
                  title={required ? "Name is always required" : undefined}
                  onClick={() => setJoinFields((prev) =>
                    enabled && !required ? prev.filter((k) => k !== f.key) : [...prev, f.key]
                  )}
                  className={`rounded-full px-3 py-1 text-sm border transition-colors ${
                    enabled ? "bg-primary/10 text-primary border-primary/30 font-medium"
                            : "border-border text-muted-foreground hover:border-primary/40"
                  } ${required ? "cursor-not-allowed" : ""}`}
                >
                  {f.label}{required ? " *" : ""}
                </button>
              );
            })}
          </div>
          {/* Minimal form preview */}
          <div className="rounded-lg border bg-muted/20 p-4 space-y-2.5">
            <p className="text-xs font-medium text-muted-foreground">Form preview</p>
            {joinFields.map((fk) => {
              const field = JOIN_FIELDS.find((f) => f.key === fk);
              return field ? (
                <div key={fk} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{field.label}</p>
                  <div className="h-8 rounded-md border border-border/60 bg-background px-3 flex items-center">
                    <span className="text-xs text-muted-foreground/40">Enter {field.label.toLowerCase()}</span>
                  </div>
                </div>
              ) : null;
            })}
            <button
              className="w-full h-8 rounded-md text-sm font-medium mt-1 transition-opacity hover:opacity-90"
              style={{
                backgroundColor: progBrand.background_color || "#4f46e5",
                color: progBrand.foreground_color || "#ffffff",
              }}
            >
              Join program
            </button>
          </div>
        </Collapsible>
      </div>
    );
  }

  // ── Cards view ──────────────────────────────────────────────────────────────
  if (view === "cards" && activeProgram) {
    const activeProgramType = programTypes.find((t) => t.value === activeProgram.type);
    const availableActions  = TYPE_ACTIONS[activeProgram.type] ?? [];

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setView("list")}>← Back</Button>
            <div>
              <h1 className="text-xl font-semibold">{activeProgram.name}</h1>
              <p className="text-sm text-muted-foreground">
                {activeProgramType?.icon} {activeProgramType?.label} · {cards.length} card{cards.length !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm"
              onClick={() => { setPushTarget({ type: "program", id: activeProgram.id }); setPushMessage(""); }}>
              <Send className="h-4 w-4 mr-1.5" /> Broadcast
            </Button>
            <Button size="sm"
              onClick={() => { setIssueName(""); setIssueEmail(""); setIssuePhone(""); setShowIssueModal(true); }}>
              <Plus className="h-4 w-4 mr-1.5" /> Issue card
            </Button>
          </div>
        </div>

        {cardsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : cards.length === 0 ? (
          <Card className="p-12 text-center">
            <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No cards issued yet</p>
            <p className="text-sm text-muted-foreground mb-5">Issue your first card to a customer.</p>
            <Button onClick={() => setShowIssueModal(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Issue card
            </Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {cards.map((card) => (
              <Card key={card.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-medium truncate">{card.customer_name ?? "Guest"}</p>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        card.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}>
                        {card.status}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {[card.customer_email, card.customer_phone].filter(Boolean).join(" · ") || "No contact info"}
                    </p>
                    {Object.keys(card.state).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {Object.entries(card.state).map(([k, v]) => (
                          <span key={k} className="text-xs bg-muted px-2 py-0.5 rounded-md">
                            {k}: <strong>{String(v)}</strong>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {availableActions.length > 0 && card.status === "active" && (
                      <Button variant="ghost" size="sm" title="Manage card"
                        onClick={() => { setActionCard(card); setSelectedAction(""); setActionValue(""); }}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" title="Send push notification"
                      onClick={() => { setPushTarget({ type: "card", serial: card.serial }); setPushMessage(""); }}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <a href={`${apiBase}/api/wallet/cards/${card.serial}/pkpass`} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" title="Download Apple Wallet pass">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                    <Button variant="ghost" size="sm"
                      onClick={() => revokeCard(card.serial)}
                      disabled={card.status !== "active"}
                      title={card.status !== "active" ? "Card already revoked" : "Revoke card"}
                      className="text-destructive hover:text-destructive disabled:opacity-30">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Issue card modal */}
        {showIssueModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Issue new card</h2>
                <button onClick={() => setShowIssueModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Customer name</Label>
                  <Input value={issueName} onChange={(e) => setIssueName(e.target.value)} placeholder="Jane Smith" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Email</Label>
                  <Input type="email" value={issueEmail} onChange={(e) => setIssueEmail(e.target.value)} placeholder="jane@example.com" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Phone</Label>
                  <Input value={issuePhone} onChange={(e) => setIssuePhone(e.target.value)} placeholder="+1 555 000 0000" />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setShowIssueModal(false)}>Cancel</Button>
                <Button onClick={issueCard} disabled={issuingCard}>
                  {issuingCard && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  Issue card
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Card action modal */}
        {actionCard && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <div>
                  <h2 className="font-semibold">{actionCard.customer_name ?? "Guest"}</h2>
                  <p className="text-xs text-muted-foreground">{actionCard.serial}</p>
                </div>
                <button onClick={() => setActionCard(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">Action</Label>
                  <select value={selectedAction}
                    onChange={(e) => { setSelectedAction(e.target.value); setActionValue(""); }}
                    className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <option value="">Select action</option>
                    {availableActions.map((a) => (
                      <option key={a} value={a}>{ACTION_LABELS[a]?.label}</option>
                    ))}
                  </select>
                </div>
                {selectedAction && ACTION_LABELS[selectedAction]?.hasValue && (
                  <div className="space-y-1.5">
                    <Label className="text-sm">{ACTION_LABELS[selectedAction].valueLabel}</Label>
                    <Input value={actionValue} onChange={(e) => setActionValue(e.target.value)} placeholder="e.g. 100" />
                  </div>
                )}
                {Object.keys(actionCard.state).length > 0 && (
                  <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {Object.entries(actionCard.state).map(([k, v]) => (
                      <span key={k} className="mr-3">{k}: <strong className="text-foreground">{String(v)}</strong></span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setActionCard(null)}>Cancel</Button>
                <Button onClick={runAction} disabled={runningAction || !selectedAction}>
                  {runningAction && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                  Apply
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Push notification modal */}
        {pushTarget && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  {pushTarget.type === "program" ? "Broadcast to all cards" : "Push notification"}
                </h2>
                <button onClick={() => setPushTarget(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-1.5">
                <Label className="text-sm">Message</Label>
                <textarea
                  className="w-full h-24 rounded-md border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={pushMessage}
                  onChange={(e) => setPushMessage(e.target.value)}
                  placeholder="Your pass has been updated."
                />
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setPushTarget(null)}>Cancel</Button>
                <Button onClick={sendPush} disabled={sendingPush || !pushMessage.trim()}>
                  {sendingPush ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Programs list ───────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Wallet Programs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Loyalty cards, passes, and tickets issued through Apple &amp; Google Wallet.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1.5" /> New program
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : programs.length === 0 ? (
        <div className="rounded-xl border border-dashed p-16 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground/40 mb-4" />
          <p className="font-medium mb-1">No programs yet</p>
          <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
            Create a loyalty program to issue Apple &amp; Google Wallet passes to your customers.
          </p>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1.5" /> Create your first program</Button>
        </div>
      ) : (
        <div className="space-y-2">
          {programs.map((p) => {
            const pt = programTypes.find((t) => t.value === p.type);
            const brandColor = p.brand_overrides?.background_color;
            return (
              <Card key={p.id} className="p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-center gap-4">
                  {/* Icon with optional brand color tint */}
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl text-xl shrink-0"
                    style={brandColor
                      ? { backgroundColor: brandColor + "22", border: `1px solid ${brandColor}44` }
                      : { backgroundColor: "hsl(var(--muted))" }}
                  >
                    {pt?.icon ?? "🪪"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{p.name}</p>
                      <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                        {p.status}
                      </span>
                      {brandColor && (
                        <div className="shrink-0 w-3 h-3 rounded-full border border-border/50"
                          style={{ backgroundColor: brandColor }} title={`Brand color: ${brandColor}`} />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {pt?.label}{p.description ? ` · ${p.description}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => loadCards(p)} title="View issued cards">
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Edit program">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteProgram(p.id)}
                      title="Delete program"
                      className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Create / Edit modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] sm:max-h-[88vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
              <h2 className="font-semibold text-base">
                {editingProgram ? `Edit "${editingProgram.name}"` : "Create wallet program"}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>

            <StepIndicator current={modalStep} onGoBack={() => setModalStep("setup")} />

            {/* Split: form + live preview */}
            <div className="flex flex-1 overflow-hidden">
              {/* Form */}
              <div className="flex-1 overflow-y-auto px-5 py-5">
                {modalStep === "setup" ? renderSetup() : renderAppearance()}
              </div>

              {/* Live preview — desktop only */}
              {progType && (
                <div className="hidden lg:flex w-72 shrink-0 border-l flex-col items-center justify-center gap-4 p-6 bg-muted/10">
                  <WalletCardPreview
                    type={progType}
                    name={progName}
                    config={progConfig}
                    brand={progBrand}
                    programTypes={programTypes}
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground">
                      {typeInfo?.icon} {typeInfo?.label}
                    </p>
                    {progBrand.background_color && (
                      <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">
                        {progBrand.background_color}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 px-5 py-4 border-t shrink-0">
              {/* Inline summary on step 2 */}
              {modalStep === "appearance" && progName ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{typeInfo?.icon}</span>
                  <span className="text-sm font-medium truncate">{progName}</span>
                  {progBrand.background_color && (
                    <div className="w-3.5 h-3.5 rounded-full border shrink-0"
                      style={{ backgroundColor: progBrand.background_color }} />
                  )}
                </div>
              ) : <div />}

              <div className="flex gap-2 shrink-0">
                {modalStep === "appearance" && (
                  <Button variant="outline" onClick={() => setModalStep("setup")}>← Back</Button>
                )}
                {modalStep === "setup" ? (
                  <Button
                    onClick={() => { setNameTouched(true); if (setupCanAdvance) setModalStep("appearance"); }}
                    disabled={!progType}
                    title={!progType ? "Select a program type first" : !progName.trim() ? "Enter a program name" : undefined}
                  >
                    Next: Appearance →
                  </Button>
                ) : (
                  <Button onClick={saveProgram} disabled={saving || !progName.trim()}>
                    {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                    {editingProgram ? "Save changes" : "Create program"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
