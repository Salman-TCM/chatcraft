"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Wallet, Plus, Loader2, Pencil, Trash2, Users, Send, X,
  ChevronDown, ChevronRight, Download, Smartphone, RefreshCw,
  Check, AlertCircle, Upload, Lock, Link2, QrCode, RotateCcw,
  Clock, Camera, ScanLine, ExternalLink, Search,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";
import { QRCodeCanvas } from "qrcode.react";

// ── Interfaces ─────────────────────────────────────────────────────────────────
interface ProgramType {
  value: string; label: string; icon: string; description: string;
}
interface WalletProgram {
  id: string; name: string; type: string; description: string | null;
  status: string; config: Record<string, unknown>;
  brand_overrides: Record<string, string>; google_class_id: string | null;
  join_token: string | null; scanner_token: string | null;
  join_url: string | null; scanner_url: string | null;
  join_form_fields: string[]; receipt_scanning_config: Record<string, unknown>;
  device_count: number; created_at: string;
}
interface WalletCard {
  id: string; serial: string; customer_name: string | null;
  customer_email: string | null; customer_phone: string | null;
  status: string; state: Record<string, unknown>;
  google_pass_object_id: string | null; created_at: string;
}
interface WalletEvent {
  id: string; action: string; delta: Record<string, unknown>;
  message: string | null; source: string; receipt_scan_id: string | null;
  created_at: string;
}
interface Agent {
  id: string; name: string; description: string | null;
  tools: Record<string, boolean>;
}

// ── Constants ──────────────────────────────────────────────────────────────────
const ACTION_LABELS: Record<string, { label: string; hasValue: boolean; valueLabel?: string }> = {
  add_punch:          { label: "Add Punch",         hasValue: false },
  remove_punch:       { label: "Remove Punch",      hasValue: false },
  set_punches:        { label: "Set Punches",        hasValue: true,  valueLabel: "Count"     },
  redeem:             { label: "Redeem",             hasValue: false },
  redeem_coupon:      { label: "Redeem Coupon",      hasValue: false },
  add_points:         { label: "Add Points",         hasValue: true,  valueLabel: "Points"    },
  remove_points:      { label: "Remove Points",      hasValue: true,  valueLabel: "Points"    },
  redeem_points_reward:{ label: "Redeem Reward",     hasValue: true,  valueLabel: "Point cost" },
  set_tier:           { label: "Set Tier",           hasValue: true,  valueLabel: "Tier name" },
  load_balance:       { label: "Load Balance",       hasValue: true,  valueLabel: "Amount"    },
  deduct_balance:     { label: "Deduct Balance",     hasValue: true,  valueLabel: "Amount"    },
  refund_balance:     { label: "Refund Balance",     hasValue: true,  valueLabel: "Amount"    },
  set_balance:        { label: "Set Balance",        hasValue: true,  valueLabel: "Amount"    },
  check_in:           { label: "Check In",           hasValue: false },
  un_check_in:        { label: "Un-Check In",        hasValue: false },
};
const TYPE_ACTIONS: Record<string, string[]> = {
  punch_card:      ["add_punch", "remove_punch", "set_punches", "redeem"],
  points:          ["add_points", "remove_points", "redeem_points_reward", "set_tier", "redeem"],
  membership:      ["set_tier", "add_points", "remove_points"],
  prepaid_balance: ["load_balance", "deduct_balance", "refund_balance", "set_balance"],
  event_ticket:    ["check_in", "un_check_in"],
  coupon:          ["redeem_coupon"],
  business_card:   [],
};
const JOIN_FIELDS = [
  { key: "name",        label: "Full name"   },
  { key: "email",       label: "Email"       },
  { key: "phone",       label: "Phone"       },
  { key: "birthday",    label: "Birthday"    },
  { key: "postal_code", label: "Postal code" },
] as const;

// ── Program create/edit form validation ────────────────────────────────────────
const PROGRAM_TYPE_VALUES = [
  "membership", "punch_card", "points", "coupon",
  "event_ticket", "prepaid_balance", "business_card",
] as const;
const JOIN_FIELD_VALUES = ["name", "email", "phone", "birthday", "postal_code"] as const;

const programFormSchema = z.object({
  name: z.string().min(1, "Program name is required"),
  type: z.enum(PROGRAM_TYPE_VALUES),
  join_form_fields: z.array(z.enum(JOIN_FIELD_VALUES)),
});
type ProgramFormData = z.infer<typeof programFormSchema>;
const TOOL_LABELS: Record<string, string> = {
  web_search: "web search", send_email: "email", send_sms: "SMS",
  create_contact: "contacts", update_contact: "contact updates",
  create_task: "tasks", send_notification: "push notifications",
};
// Deterministic 7×7 QR placeholder
const QR7 = [1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,0,1,0,1,0,1,1,0,0,1,0,0,1,1,0,1,0,1,0,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1];

// ── Wallet pass preview ────────────────────────────────────────────────────────
function WalletCardPreview({ type, name, config, brand, programTypes }: {
  type: string; name: string; config: Record<string, string>;
  brand: Record<string, string>; programTypes: ProgramType[];
}) {
  const bg  = brand.background_color || "#4f46e5";
  const fg  = brand.foreground_color || "#ffffff";
  const dim = brand.label_color      || `${fg}99`;
  const typeInfo   = programTypes.find((t) => t.value === type);
  const maxPunches = Math.min(Math.max(parseInt(config.max_punches || "10") || 10, 1), 14);
  const stripUrl   = brand.strip_image_url;

  return (
    <div className="relative flex-shrink-0 overflow-hidden"
      style={{ backgroundColor: bg, width: 288, height: 172, borderRadius: 16 }}>
      {/* Strip image */}
      {stripUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={stripUrl} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
      )}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 60%)" }} />
      <div className="flex items-center justify-between px-4 pt-3.5 relative">
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
      <div className="px-4 mt-2 relative">
        <p className="text-[17px] font-bold leading-tight truncate" style={{ color: fg }}>
          {name || "Program name"}
        </p>
      </div>
      <div className="px-4 mt-2.5 relative">
        {type === "punch_card" && (
          <div className="flex flex-wrap gap-[5px]">
            {Array.from({ length: maxPunches }).map((_, i) => (
              <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${fg}`,
                backgroundColor: i < Math.ceil(maxPunches / 4) ? fg : "transparent" }} />
            ))}
          </div>
        )}
        {type === "points" && (
          <div>
            <span style={{ color: fg, fontSize: 26, fontWeight: 700, lineHeight: 1 }}>1,250</span>
            <span style={{ color: dim, fontSize: 12, marginLeft: 4 }}>
              {config.points_label || "points"}
            </span>
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

// ── Field components ───────────────────────────────────────────────────────────
function ValidatedInput({ label, value, onChange, onBlur, placeholder, touched, error, className = "", type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void;
  placeholder: string; touched: boolean; error?: string; className?: string; type?: string;
}) {
  const invalid = touched && !!error;
  const valid   = touched && !error && value.trim().length > 0;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-sm">{label}</Label>
      <div className="relative">
        <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
          placeholder={placeholder}
          className={`pr-8 ${invalid ? "border-destructive focus-visible:ring-destructive" : ""}`} />
        {valid   && <Check       className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500 pointer-events-none" />}
        {invalid && <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive pointer-events-none" />}
      </div>
      {invalid && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

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
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-8 text-sm font-mono" />
      </div>
    </div>
  );
}

function ImageUploadZone({ label, value, onChange, hint }: {
  label: string; value: string; onChange: (v: string) => void; hint?: string;
}) {
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
      <Label className="text-sm">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground -mt-1">{hint}</p>}
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
            <img src={value} alt="" className="h-9 max-w-[120px] object-contain rounded" />
            <span className="text-sm text-muted-foreground flex-1">Image ready</span>
            <button onClick={(e) => { e.stopPropagation(); onChange(""); }}
              className="shrink-0 rounded-md p-1 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 py-4">
            <Upload className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">Drop an image, or <span className="text-primary font-medium">browse</span></p>
            <p className="text-xs text-muted-foreground/60">PNG · JPG · WebP</p>
          </div>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => readFile(e.target.files?.[0])} />
      {!hasUpload && (
        <Input value={value.startsWith("data:") ? "" : value} onChange={(e) => onChange(e.target.value)}
          placeholder="Or paste a URL" className="h-8 text-sm" />
      )}
    </div>
  );
}

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
          {complete && <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100">
            <Check className="h-2.5 w-2.5 text-green-600" /></span>}
          {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>
      {open && <div className="px-4 pb-4 pt-3 border-t space-y-4">{children}</div>}
    </div>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button onClick={copy}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Link2 className="h-3 w-3" />}
      {copied ? "Copied!" : label}
    </button>
  );
}

// ── QR Code modal ─────────────────────────────────────────────────────────────
function QrModal({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const canvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "qr-code.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 animate-in fade-in duration-150">
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-xs">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-sm">{title}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-6 flex flex-col items-center gap-4">
          <div ref={containerRef} className="bg-white p-3 rounded-xl shadow-sm border">
            <QRCodeCanvas value={url} size={200} level="M" />
          </div>
          <p className="text-xs text-muted-foreground text-center break-all max-w-full">{url}</p>
          <div className="flex gap-2 w-full">
            <Button variant="outline" size="sm" className="flex-1" onClick={copy}>
              {copied
                ? <Check className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
              {copied ? "Copied!" : "Copy URL"}
            </Button>
            <Button variant="outline" size="sm" className="flex-1" onClick={download}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Download
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

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
            <button onClick={done ? onGoBack : undefined} disabled={!done}
              className={`flex items-center gap-2 text-sm font-medium transition-colors ${
                active ? "text-foreground" : done ? "text-muted-foreground hover:text-foreground cursor-pointer" : "text-muted-foreground/50 cursor-default"}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 transition-all ${
                done ? "bg-primary text-primary-foreground" : active ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}>
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
  const active = Object.entries(tools).filter(([, v]) => v).map(([k]) => TOOL_LABELS[k] ?? k.replace(/_/g, " "));
  if (!active.length) return "No tools enabled";
  return active.slice(0, 4).join(", ") + (active.length > 4 ? ` +${active.length - 4}` : "");
}

function formatEventAction(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

// ── Main page ──────────────────────────────────────────────────────────────────
type View = "list" | "cards";

export default function WalletPage() {
  const [programTypes,  setProgramTypes]  = useState<ProgramType[]>([]);
  const [typesError,    setTypesError]    = useState(false);
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
  const programForm = useForm<ProgramFormData>({
    resolver: zodResolver(programFormSchema),
    defaultValues: { name: "", type: "" as ProgramFormData["type"], join_form_fields: ["name", "email"] },
  });
  const { watch: watchProgram, setValue: setProgramValue, trigger: triggerProgram,
          setError: setProgramError, formState: { errors: programErrors } } = programForm;
  const progName   = watchProgram("name");
  const progType   = watchProgram("type");
  const joinFields = watchProgram("join_form_fields");
  const [progDesc,       setProgDesc]       = useState("");
  const [progConfig,     setProgConfig]     = useState<Record<string, string>>({});
  const [progBrand,      setProgBrand]      = useState<Record<string, string>>({});
  const [progAgentId,    setProgAgentId]    = useState("");
  const [receiptScanConfig, setReceiptScanConfig] = useState<Record<string, string>>({});
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

  // Events (per card)
  const [cardEvents,      setCardEvents]      = useState<Record<string, WalletEvent[]>>({});
  const [loadingEvents,   setLoadingEvents]   = useState<Record<string, boolean>>({});
  const [expandedEvents,  setExpandedEvents]  = useState<Set<string>>(new Set());

  // Rotating tokens
  const [rotatingToken, setRotatingToken] = useState(false);
  const [rotatingScannerToken, setRotatingScannerToken] = useState(false);

  // QR code modal
  const [qrModal, setQrModal] = useState<{ url: string; title: string } | null>(null);

  // Card search
  const [cardSearch, setCardSearch] = useState("");

  // Push result (replaces alert)
  const [pushResult, setPushResult] = useState<{ sent: number; message: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setTypesError(false);
    const [typesRes, progsRes, agentsRes] = await Promise.allSettled([
      apiClient.get("/api/wallet/program-types"),
      apiClient.get("/api/wallet/programs?limit=100"),
      apiClient.get("/api/v1/agents"),
    ]);
    if (typesRes.status === "fulfilled") {
      setProgramTypes(typesRes.value.data.data ?? []);
    } else {
      setTypesError(true);
    }
    if (progsRes.status === "fulfilled") {
      setPrograms(progsRes.value.data.data ?? []);
    } else {
      toast({ variant: "destructive", title: "Failed to load programs", description: getErrorMessage(progsRes.reason) });
    }
    if (agentsRes.status === "fulfilled") {
      setAgents(agentsRes.value.data.data ?? []);
    } else {
      toast({ variant: "destructive", title: "Failed to load AI agents", description: getErrorMessage(agentsRes.reason) });
    }
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
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load cards", description: getErrorMessage(err) });
    }
    setCardsLoading(false);
  }

  function resetModal() {
    programForm.reset({ name: "", type: "" as ProgramFormData["type"], join_form_fields: ["name", "email"] });
    setProgDesc(""); setProgConfig({}); setProgBrand({});
    setProgAgentId(""); setReceiptScanConfig({});
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
    programForm.reset({
      name: p.name,
      type: p.type as ProgramFormData["type"],
      join_form_fields: (p.join_form_fields || ["name", "email"]) as ProgramFormData["join_form_fields"],
    });
    setProgDesc(p.description ?? "");
    setProgConfig(Object.fromEntries(Object.entries(p.config).map(([k, v]) => [k, String(v)])));
    setProgBrand({ ...p.brand_overrides });
    setProgAgentId("");
    setReceiptScanConfig(
      Object.fromEntries(Object.entries(p.receipt_scanning_config || {}).map(([k, v]) => [k, String(v)]))
    );
    setNameTouched(false); setConfigTouched(new Set());
    setModalStep("setup");
    setShowModal(true);
  }

  async function saveProgram(data: ProgramFormData) {
    setSaving(true);
    try {
      const rsConfig: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(receiptScanConfig)) {
        if (v === "") continue;
        if (k === "enabled") rsConfig[k] = v === "true";
        else if (k === "merchant_keywords_str") {
          rsConfig["merchant_keywords"] = v.split(",").map((s: string) => s.trim()).filter(Boolean);
        } else if (!isNaN(Number(v))) rsConfig[k] = Number(v);
        else rsConfig[k] = v;
      }
      const payload = {
        name: data.name.trim(),
        description: progDesc.trim() || null,
        type: data.type,
        config: progConfig,
        brand_overrides: progBrand,
        join_form_fields: data.join_form_fields,
        receipt_scanning_config: rsConfig,
        ...(progAgentId ? { chatbot_id: progAgentId } : {}),
      };
      if (editingProgram) {
        await apiClient.patch(`/api/wallet/programs/${editingProgram.id}`, payload);
      } else {
        await apiClient.post("/api/wallet/programs", payload);
      }
      setShowModal(false);
      await load();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      for (const [field, message] of Object.entries(fieldErrors)) {
        if (field === "name" || field === "type" || field === "join_form_fields") {
          setProgramError(field as keyof ProgramFormData, { message });
        }
      }
      toast({
        variant: "destructive",
        title: editingProgram ? "Failed to update program" : "Failed to create program",
        description: getErrorMessage(err),
      });
    }
    setSaving(false);
  }

  async function deleteProgram(id: string) {
    if (!confirm("Delete this program and all its issued cards?")) return;
    try {
      await apiClient.delete(`/api/wallet/programs/${id}`);
      setPrograms((p) => p.filter((pg) => pg.id !== id));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to delete program", description: getErrorMessage(err) });
    }
  }

  async function issueCard() {
    if (!activeProgram) return;
    if (issueEmailError) return;
    setIssuingCard(true);
    try {
      await apiClient.post(`/api/wallet/programs/${activeProgram.id}/cards`, {
        customer_name: issueName || null, customer_email: issueEmail || null, customer_phone: issuePhone || null,
      });
      setShowIssueModal(false);
      setIssueName(""); setIssueEmail(""); setIssuePhone("");
      await loadCards(activeProgram);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to issue card", description: getErrorMessage(err) });
    }
    setIssuingCard(false);
  }

  async function revokeCard(serial: string) {
    if (!confirm("Revoke this card? The customer will lose access.")) return;
    try {
      await apiClient.delete(`/api/wallet/cards/${serial}`);
      setCards((p) => p.map((c) => c.serial === serial ? { ...c, status: "revoked" } : c));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to revoke card", description: getErrorMessage(err) });
    }
  }

  async function runAction() {
    if (!actionCard || !selectedAction) return;
    if (actionValueError) return;
    setRunningAction(true);
    try {
      const meta = ACTION_LABELS[selectedAction];
      const isNumericValue = !!meta?.hasValue && selectedAction !== "set_tier";
      const value = !meta?.hasValue
        ? undefined
        : isNumericValue
          ? Number(actionValue)
          : actionValue.trim();
      const res = await apiClient.post(`/api/wallet/cards/${actionCard.serial}/action`, {
        action: selectedAction, value,
      });
      setCards((p) => p.map((c) => c.serial === actionCard.serial ? res.data.data : c));
      setActionCard(res.data.data);
      setSelectedAction(""); setActionValue("");
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to apply action", description: getErrorMessage(err) });
    }
    setRunningAction(false);
  }

  async function sendPush() {
    if (!pushTarget || !pushMessage.trim()) return;
    setSendingPush(true);
    setPushResult(null);
    try {
      const url = pushTarget.type === "card"
        ? `/api/wallet/cards/${pushTarget.serial}/push`
        : `/api/wallet/programs/${pushTarget.id}/push`;
      const res = await apiClient.post(url, { message: pushMessage });
      const sent = res.data.data?.sent ?? 0;
      setPushResult({ sent, message: `Sent to ${sent} device${sent !== 1 ? "s" : ""}` });
      setPushMessage("");
      setTimeout(() => { setPushTarget(null); setPushResult(null); }, 2500);
    } catch (err) {
      setPushResult({ sent: 0, message: getErrorMessage(err) });
      toast({ variant: "destructive", title: "Failed to send push notification", description: getErrorMessage(err) });
    }
    setSendingPush(false);
  }

  async function loadCardEvents(serial: string) {
    if (loadingEvents[serial]) return;
    setLoadingEvents((p) => ({ ...p, [serial]: true }));
    try {
      const res = await apiClient.get(`/api/wallet/cards/${serial}/events?limit=20`);
      setCardEvents((p) => ({ ...p, [serial]: res.data.data ?? [] }));
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to load card events", description: getErrorMessage(err) });
    }
    setLoadingEvents((p) => ({ ...p, [serial]: false }));
  }

  function toggleEvents(serial: string) {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(serial)) {
        next.delete(serial);
      } else {
        next.add(serial);
        if (!cardEvents[serial]) loadCardEvents(serial);
      }
      return next;
    });
  }

  async function rotateJoinToken() {
    if (!activeProgram) return;
    if (!confirm("Rotate the join link? The old URL will stop working immediately.")) return;
    setRotatingToken(true);
    try {
      const res = await apiClient.post(`/api/wallet/programs/${activeProgram.id}/rotate-join-token`);
      setActiveProgram((p) => p ? { ...p, join_token: res.data.data.join_token, join_url: res.data.data.join_url } : p);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to rotate join link", description: getErrorMessage(err) });
    }
    setRotatingToken(false);
  }

  async function rotateScannerToken() {
    if (!activeProgram) return;
    if (!confirm("Rotate the scanner link? Staff using the old URL will lose access.")) return;
    setRotatingScannerToken(true);
    try {
      const res = await apiClient.post(`/api/wallet/programs/${activeProgram.id}/rotate-scanner-token`);
      setActiveProgram((p) => p ? { ...p, scanner_token: res.data.data.scanner_token, scanner_url: res.data.data.scanner_url } : p);
    } catch (err) {
      toast({ variant: "destructive", title: "Failed to rotate scanner link", description: getErrorMessage(err) });
    }
    setRotatingScannerToken(false);
  }

  function configFields(type: string): { key: string; label: string; placeholder: string; numeric?: boolean }[] {
    if (type === "punch_card")      return [
      { key: "max_punches",        label: "Max punches",       placeholder: "10",          numeric: true },
      { key: "reward_description", label: "Reward",            placeholder: "Free coffee"               },
    ];
    if (type === "points")          return [
      { key: "points_per_dollar",  label: "Points per dollar", placeholder: "1",           numeric: true },
      { key: "points_label",       label: "Points unit",       placeholder: "Points"                    },
      { key: "points_threshold",   label: "Reward threshold",  placeholder: "100",         numeric: true },
      { key: "reward_description", label: "Reward name",       placeholder: "Free item"                 },
    ];
    if (type === "membership")      return [
      { key: "default_tier",       label: "Default tier",      placeholder: "Standard"                  },
    ];
    if (type === "prepaid_balance") return [
      { key: "initial_balance",    label: "Starting balance",  placeholder: "0",           numeric: true },
      { key: "currency",           label: "Currency",          placeholder: "USD"                       },
    ];
    if (type === "event_ticket")    return [
      { key: "event_name",         label: "Event name",        placeholder: "Annual Summit 2026"        },
      { key: "event_date",         label: "Date",              placeholder: "Jan 15, 2026"              },
      { key: "default_seat",       label: "Default seat",      placeholder: "General Admission"         },
    ];
    if (type === "coupon")          return [
      { key: "offer_label",        label: "Offer label",       placeholder: "Welcome offer"             },
      { key: "offer_value",        label: "Discount",          placeholder: "20% off"                   },
    ];
    return [];
  }

  function touchConfig(key: string) {
    setConfigTouched((prev) => { const n = new Set(prev); n.add(key); return n; });
  }

  const selectedAgent   = agents.find((a) => a.id === progAgentId) ?? null;
  const typeInfo        = programTypes.find((t) => t.value === progType);
  const nameError       = nameTouched ? (programErrors.name?.message ?? (!progName.trim() ? "Program name is required" : undefined)) : undefined;
  const descOverLimit   = progDesc.length > 200;
  const apiBase         = process.env.NEXT_PUBLIC_API_URL ?? "";

  // Card action value validation — numeric for punch/points/balance actions, non-empty string for e.g. set_tier
  const actionMeta       = selectedAction ? ACTION_LABELS[selectedAction] : undefined;
  const actionIsNumeric  = !!actionMeta?.hasValue && selectedAction !== "set_tier";
  const actionValueError = !actionMeta?.hasValue
    ? undefined
    : actionIsNumeric
      ? (actionValue.trim() === "" || isNaN(Number(actionValue)) || Number(actionValue) < 0
          ? "Enter a valid non-negative number" : undefined)
      : (actionValue.trim() === "" ? `${actionMeta.valueLabel ?? "Value"} is required` : undefined);

  // Issue-card form — all fields optional, just check well-formedness of what's entered
  const issueEmailError = issueEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(issueEmail.trim())
    ? "Enter a valid email address" : undefined;

  // ── Setup step ─────────────────────────────────────────────────────────────
  function renderSetup() {
    const fields = configFields(progType);
    const showReceipt = ["punch_card", "points"].includes(progType);

    return (
      <div className="space-y-6">
        {editingProgram ? (
          <div className="flex items-center gap-3 rounded-lg bg-muted/50 border px-4 py-3">
            <span className="text-2xl shrink-0">{typeInfo?.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{typeInfo?.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Program type cannot be changed after creation</p>
            </div>
            <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-sm">Program type</Label>
            {typesError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Could not load program types. Check your API connection and <button onClick={load} className="underline font-medium">retry</button>.</span>
              </div>
            ) : programTypes.length === 0 ? (
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-2">
              {programTypes.map((t) => (
                <button key={t.value} onClick={() => {
                  setProgramValue("type", t.value as ProgramFormData["type"], { shouldValidate: true });
                  setProgConfig({});
                }}
                  className={`text-left rounded-xl border-2 px-3 py-3 transition-all duration-150 ${
                    progType === t.value ? "border-primary bg-primary/5 shadow-sm" : "border-border hover:border-border/60 hover:bg-muted/30"}`}>
                  <div className="text-xl mb-1">{t.icon}</div>
                  <p className="text-sm font-medium leading-tight">{t.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-snug line-clamp-2">{t.description}</p>
                </button>
              ))}
            </div>
            )}
          </div>
        )}

        {progType && (
          <div className="space-y-4">
            <ValidatedInput label="Program name" value={progName}
              onChange={(v) => setProgramValue("name", v, { shouldValidate: nameTouched })}
              onBlur={() => { setNameTouched(true); triggerProgram("name"); }}
              placeholder={progType === "punch_card" ? "e.g. Coffee Club" : progType === "points" ? "e.g. Rewards Program" : "e.g. Program name"}
              touched={nameTouched} error={nameError} />

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Description <span className="text-muted-foreground font-normal text-xs">optional</span></Label>
                <span className={`text-xs tabular-nums ${descOverLimit ? "text-destructive" : "text-muted-foreground"}`}>
                  {progDesc.length} / 200
                </span>
              </div>
              <textarea value={progDesc} onChange={(e) => setProgDesc(e.target.value)}
                placeholder="e.g. Earn rewards on every purchase." rows={2}
                className={`w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors ${descOverLimit ? "border-destructive" : ""}`} />
            </div>

            {fields.length > 0 && (
              <div className={`grid gap-3 ${fields.length >= 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                {fields.map((f) => {
                  const touched = configTouched.has(f.key);
                  const val     = progConfig[f.key] ?? "";
                  const err     = touched && val && f.numeric && isNaN(Number(val)) ? "Must be a number" : undefined;
                  return (
                    <ValidatedInput key={f.key} label={f.label} value={val}
                      onChange={(v) => setProgConfig((p) => ({ ...p, [f.key]: v }))}
                      onBlur={() => touchConfig(f.key)} placeholder={f.placeholder}
                      touched={configTouched.has(f.key)} error={err} />
                  );
                })}
              </div>
            )}

            {/* Receipt scanning config */}
            {showReceipt && (
              <Collapsible title="Receipt scanning" complete={receiptScanConfig.enabled === "true"}>
                <p className="text-sm text-muted-foreground -mt-1">
                  Let customers scan receipts to earn {progType === "points" ? "points" : "punches"} automatically.
                </p>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="rs-enabled" checked={receiptScanConfig.enabled === "true"}
                    onChange={(e) => setReceiptScanConfig((p) => ({ ...p, enabled: e.target.checked ? "true" : "false" }))}
                    className="rounded" />
                  <label htmlFor="rs-enabled" className="text-sm font-medium">Enable receipt scanning</label>
                </div>
                {receiptScanConfig.enabled === "true" && (
                  <div className="grid grid-cols-2 gap-3">
                    {progType === "points" ? (
                      <ValidatedInput label="Points per $1" value={receiptScanConfig.points_per_dollar ?? "1"}
                        onChange={(v) => setReceiptScanConfig((p) => ({ ...p, points_per_dollar: v }))}
                        placeholder="1" touched={false} />
                    ) : (
                      <ValidatedInput label="Punches per receipt" value={receiptScanConfig.punches_per_receipt ?? "1"}
                        onChange={(v) => setReceiptScanConfig((p) => ({ ...p, punches_per_receipt: v }))}
                        placeholder="1" touched={false} />
                    )}
                    <ValidatedInput label="Min receipt ($)" value={receiptScanConfig.min_amount ?? "0"}
                      onChange={(v) => setReceiptScanConfig((p) => ({ ...p, min_amount: v }))}
                      placeholder="0" touched={false} />
                    <ValidatedInput label="Max award/scan" value={receiptScanConfig.max_award_per_scan ?? "100"}
                      onChange={(v) => setReceiptScanConfig((p) => ({ ...p, max_award_per_scan: v }))}
                      placeholder="100" touched={false} />
                    <ValidatedInput label="Max scans/day" value={receiptScanConfig.max_scans_per_day ?? "5"}
                      onChange={(v) => setReceiptScanConfig((p) => ({ ...p, max_scans_per_day: v }))}
                      placeholder="5" touched={false} />
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-sm">Merchant keywords <span className="text-muted-foreground font-normal text-xs">optional, comma-separated</span></Label>
                      <Input value={receiptScanConfig.merchant_keywords_str ?? ""}
                        onChange={(e) => setReceiptScanConfig((p) => ({ ...p, merchant_keywords_str: e.target.value }))}
                        placeholder="e.g. MyCafé, My Cafe" className="h-8 text-sm" />
                    </div>
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-sm">Custom AI prompt <span className="text-muted-foreground font-normal text-xs">optional</span></Label>
                      <textarea value={receiptScanConfig.custom_prompt ?? ""}
                        onChange={(e) => setReceiptScanConfig((p) => ({ ...p, custom_prompt: e.target.value }))}
                        placeholder='e.g. "only count items in the breakfast menu"'
                        rows={2}
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
                    </div>
                  </div>
                )}
              </Collapsible>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">AI Agent <span className="text-muted-foreground font-normal text-xs">optional</span></Label>
              <select value={progAgentId} onChange={(e) => setProgAgentId(e.target.value)}
                className="w-full h-9 rounded-md border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
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

  // ── Appearance step ────────────────────────────────────────────────────────
  function renderAppearance() {
    return (
      <div className="space-y-5">
        <ImageUploadZone label="Icon / Logo" hint="Recommended: 512×512 px, square. Shown in the pass corner."
          value={progBrand.logo_url ?? ""}
          onChange={(v) => setProgBrand((b) => ({ ...b, logo_url: v }))} />

        <ImageUploadZone label="Strip / Banner image" hint="Recommended: 1125×369 px (3:1). Shown behind pass fields."
          value={progBrand.strip_image_url ?? ""}
          onChange={(v) => setProgBrand((b) => ({ ...b, strip_image_url: v }))} />

        <div className="grid grid-cols-3 gap-3">
          <ColorField label="Background" value={progBrand.background_color ?? ""} placeholder="#4f46e5"
            onChange={(v) => setProgBrand((b) => ({ ...b, background_color: v }))} />
          <ColorField label="Text" value={progBrand.foreground_color ?? ""} placeholder="#ffffff"
            onChange={(v) => setProgBrand((b) => ({ ...b, foreground_color: v }))} />
          <ColorField label="Labels" value={progBrand.label_color ?? ""} placeholder="#c0c0ff"
            onChange={(v) => setProgBrand((b) => ({ ...b, label_color: v }))} />
        </div>

        <Collapsible title="Customize join form" complete={joinFields.length >= 2}>
          <p className="text-sm text-muted-foreground -mt-1">Select which fields customers fill when signing up.</p>
          <div className="flex flex-wrap gap-2">
            {JOIN_FIELDS.map((f) => {
              const enabled  = joinFields.includes(f.key);
              const required = f.key === "name";
              return (
                <button key={f.key} disabled={required} title={required ? "Name is always required" : undefined}
                  onClick={() => {
                    const next = enabled && !required
                      ? joinFields.filter((k) => k !== f.key)
                      : [...joinFields, f.key as ProgramFormData["join_form_fields"][number]];
                    setProgramValue("join_form_fields", next, { shouldValidate: true });
                  }}
                  className={`rounded-full px-3 py-1 text-sm border transition-colors ${
                    enabled ? "bg-primary/10 text-primary border-primary/30 font-medium" : "border-border text-muted-foreground hover:border-primary/40"
                  } ${required ? "cursor-not-allowed" : ""}`}>
                  {f.label}{required ? " *" : ""}
                </button>
              );
            })}
          </div>
        </Collapsible>
      </div>
    );
  }

  // ── Cards view ──────────────────────────────────────────────────────────────
  if (view === "cards" && activeProgram) {
    const activeProgramType = programTypes.find((t) => t.value === activeProgram.type);
    const availableActions  = TYPE_ACTIONS[activeProgram.type] ?? [];
    const joinUrl           = activeProgram.join_url || "";
    const scannerUrl        = activeProgram.scanner_url || "";
    const hasReceiptScan    = Boolean(activeProgram.receipt_scanning_config?.enabled) &&
                              ["points", "punch_card"].includes(activeProgram.type);

    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="outline" size="sm" onClick={() => { setView("list"); setCardSearch(""); }} className="shrink-0">← Back</Button>
            <div className="min-w-0">
              <h1 className="text-xl font-semibold truncate">{activeProgram.name}</h1>
              <p className="text-sm text-muted-foreground flex flex-wrap items-center gap-1.5">
                <span>{activeProgramType?.icon} {activeProgramType?.label} · {cards.length} card{cards.length !== 1 ? "s" : ""}</span>
                {activeProgram.device_count > 0 && (
                  <span className="text-xs bg-blue-100 text-blue-700 rounded-full px-2 py-0.5">
                    {activeProgram.device_count} device{activeProgram.device_count !== 1 ? "s" : ""}
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
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

        {/* Join link + Scanner link info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          {/* Join link */}
          <Card className="p-4">
            <p className="text-sm font-medium flex items-center gap-1.5 mb-1">
              <QrCode className="h-4 w-4 text-muted-foreground" /> Customer Join Link
            </p>
            <p className="text-xs text-muted-foreground truncate mb-2">{joinUrl || "No join link"}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {joinUrl && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={() => setQrModal({ url: joinUrl, title: "Customer Join QR" })}>
                  <QrCode className="h-3 w-3" /> Show QR
                </Button>
              )}
              {joinUrl && <CopyButton value={joinUrl} label="Copy URL" />}
              <button
                onClick={rotateJoinToken}
                disabled={rotatingToken}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                title="Invalidate the old link and generate a new one"
              >
                {rotatingToken ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Rotate
              </button>
            </div>
          </Card>

          {/* Scanner link */}
          <Card className="p-4">
            <p className="text-sm font-medium flex items-center gap-1.5 mb-1">
              <ScanLine className="h-4 w-4 text-muted-foreground" /> Staff Scanner Link
            </p>
            <p className="text-xs text-muted-foreground truncate mb-2">{scannerUrl || "No scanner link"}</p>
            <div className="flex items-center gap-2 flex-wrap">
              {scannerUrl && (
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5"
                  onClick={() => setQrModal({ url: scannerUrl, title: "Staff Scanner QR" })}>
                  <QrCode className="h-3 w-3" /> Show QR
                </Button>
              )}
              {scannerUrl && <CopyButton value={scannerUrl} label="Copy" />}
              {scannerUrl && (
                <a href={scannerUrl} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button
                onClick={rotateScannerToken}
                disabled={rotatingScannerToken}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                title="Invalidate the old scanner link"
              >
                {rotatingScannerToken ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                Rotate
              </button>
            </div>
          </Card>
        </div>

        {/* Receipt scanning badge */}
        {hasReceiptScan && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800">
            <Camera className="h-4 w-4" />
            Receipt scanning is enabled — customers can earn from receipts on their pass.
          </div>
        )}

        {cardsLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : cards.length === 0 ? (
          <Card className="p-12 text-center">
            <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No cards issued yet</p>
            <p className="text-sm text-muted-foreground mb-5">Issue your first card to a customer or share the join link.</p>
            <Button onClick={() => setShowIssueModal(true)}>
              <Plus className="h-4 w-4 mr-1.5" /> Issue card
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={cardSearch}
                onChange={(e) => setCardSearch(e.target.value)}
                placeholder="Search by name, email, or phone…"
                className="pl-9 h-9"
              />
            </div>
            {(() => {
              const q = cardSearch.toLowerCase().trim();
              const filtered = q
                ? cards.filter((c) =>
                    (c.customer_name ?? "").toLowerCase().includes(q) ||
                    (c.customer_email ?? "").toLowerCase().includes(q) ||
                    (c.customer_phone ?? "").toLowerCase().includes(q) ||
                    c.serial.toLowerCase().includes(q)
                  )
                : cards;
              if (filtered.length === 0 && q) {
                return (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No cards match &quot;{cardSearch}&quot;
                  </p>
                );
              }
              return filtered.map((card) => (
              <Card key={card.id} className="overflow-hidden">
                <div className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
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
                    <div className="flex items-center gap-0.5 shrink-0 flex-wrap">
                      {availableActions.length > 0 && card.status === "active" && (
                        <Button variant="outline" size="sm" className="text-xs h-7 px-2"
                          onClick={() => { setActionCard(card); setSelectedAction(""); setActionValue(""); }}>
                          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Action
                        </Button>
                      )}
                      <a href={`/pass/${card.serial}`} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" title="View customer pass page">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button variant="ghost" size="sm" title="Send push notification"
                        onClick={() => { setPushTarget({ type: "card", serial: card.serial }); setPushMessage(""); setPushResult(null); }}>
                        <Send className="h-4 w-4" />
                      </Button>
                      <a href={`${apiBase}/api/wallet/cards/${card.serial}/pkpass`} target="_blank" rel="noreferrer">
                        <Button variant="ghost" size="sm" title="Download Apple Wallet pass (.pkpass)">
                          <Download className="h-4 w-4" />
                        </Button>
                      </a>
                      <Button variant="ghost" size="sm" title="Event history"
                        onClick={() => toggleEvents(card.serial)}>
                        <Clock className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => revokeCard(card.serial)}
                        disabled={card.status !== "active"}
                        title={card.status !== "active" ? "Card already revoked" : "Revoke card"}
                        className="text-destructive hover:text-destructive disabled:opacity-30">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Event history (collapsible) */}
                {expandedEvents.has(card.serial) && (
                  <div className="border-t bg-muted/20 px-4 py-3">
                    {loadingEvents[card.serial] ? (
                      <div className="flex justify-center py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    ) : (cardEvents[card.serial] || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">No events yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Recent activity</p>
                        {(cardEvents[card.serial] || []).map((ev) => (
                          <div key={ev.id} className="flex items-start gap-2 text-xs">
                            <span className="text-muted-foreground shrink-0 mt-0.5">
                              {formatRelativeTime(ev.created_at)}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{formatEventAction(ev.action)}</span>
                              {ev.message && <span className="text-muted-foreground ml-1">— {ev.message}</span>}
                              <span className="ml-1 text-muted-foreground/60">({ev.source})</span>
                            </div>
                            {ev.receipt_scan_id && (
                              <button
                                onClick={async () => {
                                  try {
                                    const res = await apiClient.get(`/api/wallet/receipt-scans/${ev.receipt_scan_id}/image`);
                                    const img = res.data.data?.image_data;
                                    if (img) {
                                      const win = window.open();
                                      if (win) win.document.write(`<img src="data:image/jpeg;base64,${img}" style="max-width:100%">`);
                                    }
                                  } catch (err) {
                                    toast({ variant: "destructive", title: "Failed to load receipt image", description: getErrorMessage(err) });
                                  }
                                }}
                                className="text-primary hover:underline shrink-0"
                              >
                                View receipt
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            ));
            })()}
          </div>
        )}

        {/* QR modal */}
        {qrModal && (
          <QrModal url={qrModal.url} title={qrModal.title} onClose={() => setQrModal(null)} />
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
                  <Input type="email" value={issueEmail} onChange={(e) => setIssueEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className={issueEmailError ? "border-destructive focus-visible:ring-destructive" : ""} />
                  {issueEmailError && <p className="text-xs text-destructive">{issueEmailError}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">Phone</Label>
                  <Input value={issuePhone} onChange={(e) => setIssuePhone(e.target.value)} placeholder="+1 555 000 0000" />
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setShowIssueModal(false)}>Cancel</Button>
                <Button onClick={issueCard} disabled={issuingCard || !!issueEmailError}>
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
                  <select value={selectedAction} onChange={(e) => { setSelectedAction(e.target.value); setActionValue(""); }}
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
                    <Input value={actionValue} onChange={(e) => setActionValue(e.target.value)}
                      type={actionIsNumeric ? "number" : "text"} min={actionIsNumeric ? 0 : undefined}
                      placeholder={actionIsNumeric ? "e.g. 100" : "e.g. Gold"}
                      className={actionValueError ? "border-destructive focus-visible:ring-destructive" : ""} />
                    {actionValueError && <p className="text-xs text-destructive">{actionValueError}</p>}
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
                <Button onClick={runAction} disabled={runningAction || !selectedAction || !!actionValueError}>
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
              <div className="p-4 space-y-2">
                <Label className="text-sm">Message</Label>
                <textarea className="w-full h-24 rounded-md border bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={pushMessage} onChange={(e) => setPushMessage(e.target.value)}
                  placeholder="Your pass has been updated." />
                <p className="text-xs text-muted-foreground">
                  Variables: {'{{wallet_punches}}'}, {'{{wallet_points}}'}, {'{{customerName}}'}, {'{{wallet_program_name}}'}
                </p>
                {pushResult && (
                  <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs border ${
                    pushResult.sent > 0
                      ? "bg-green-50 border-green-200 text-green-800"
                      : "bg-amber-50 border-amber-200 text-amber-800"}`}>
                    {pushResult.sent > 0
                      ? <Check className="h-3.5 w-3.5 shrink-0" />
                      : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
                    {pushResult.message}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => { setPushTarget(null); setPushResult(null); }}>Cancel</Button>
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
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Wallet Programs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Loyalty cards, passes, and tickets for Apple &amp; Google Wallet.
          </p>
        </div>
        <Button onClick={openCreate} className="sm:shrink-0">
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
                <div className="flex gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl text-xl shrink-0"
                    style={brandColor
                      ? { backgroundColor: brandColor + "22", border: `1px solid ${brandColor}44` }
                      : { backgroundColor: "hsl(var(--muted))" }}>
                    {pt?.icon ?? "🪪"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                          <p className="font-medium truncate">{p.name}</p>
                          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                            p.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                            {p.status}
                          </span>
                          {p.device_count > 0 && (
                            <span className="shrink-0 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                              {p.device_count} device{p.device_count !== 1 ? "s" : ""}
                            </span>
                          )}
                          {Boolean(p.receipt_scanning_config?.enabled) && (
                            <span className="shrink-0 text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                              <Camera className="h-2.5 w-2.5" /> Receipt scan
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {pt?.label}{p.description ? ` · ${p.description}` : ""}
                        </p>
                        {p.join_url && (
                          <div className="flex items-center gap-2 mt-1.5">
                            <button
                              onClick={(e) => { e.stopPropagation(); setQrModal({ url: p.join_url!, title: `${p.name} — Join QR` }); }}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                              title="Show QR code for join link"
                            >
                              <QrCode className="h-3 w-3" /> QR
                            </button>
                            <CopyButton value={p.join_url} label="Copy join link" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <Button variant="ghost" size="sm" onClick={() => loadCards(p)} title="View cards">
                          <Users className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteProgram(p.id)}
                          title="Delete" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* QR modal */}
      {qrModal && (
        <QrModal url={qrModal.url} title={qrModal.title} onClose={() => setQrModal(null)} />
      )}

      {/* ── Create / Edit modal ─────────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-2 sm:p-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-3xl max-h-[95vh] sm:max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b shrink-0">
              <h2 className="font-semibold text-base truncate pr-2">
                {editingProgram ? `Edit "${editingProgram.name}"` : "Create wallet program"}
              </h2>
              <button onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0">
                <X className="h-5 w-5" />
              </button>
            </div>
            <StepIndicator current={modalStep} onGoBack={() => setModalStep("setup")} />
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 sm:py-5">
                {modalStep === "setup" ? renderSetup() : renderAppearance()}
              </div>
              {progType && (
                <div className="hidden lg:flex w-72 shrink-0 border-l flex-col items-center justify-center gap-4 p-6 bg-muted/10">
                  <WalletCardPreview type={progType} name={progName} config={progConfig}
                    brand={progBrand} programTypes={programTypes} />
                  <div className="text-center">
                    <p className="text-sm font-medium text-muted-foreground">{typeInfo?.icon} {typeInfo?.label}</p>
                    {progBrand.background_color && (
                      <p className="text-xs font-mono text-muted-foreground/70 mt-0.5">{progBrand.background_color}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t shrink-0">
              {modalStep === "appearance" && progName ? (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-lg shrink-0">{typeInfo?.icon}</span>
                  <span className="text-sm font-medium truncate">{progName}</span>
                  {progBrand.background_color && (
                    <div className="w-3.5 h-3.5 rounded-full border shrink-0" style={{ backgroundColor: progBrand.background_color }} />
                  )}
                </div>
              ) : <div />}
              <div className="flex gap-2 shrink-0">
                {modalStep === "appearance" && (
                  <Button variant="outline" size="sm" onClick={() => setModalStep("setup")}>← Back</Button>
                )}
                {modalStep === "setup" ? (
                  <Button size="sm" onClick={async () => {
                    setNameTouched(true);
                    const valid = await triggerProgram(["name", "type"]);
                    if (valid) setModalStep("appearance");
                  }}
                    disabled={!progType} title={!progType ? "Select a program type first" : !progName.trim() ? "Enter a program name" : undefined}>
                    Next: Appearance →
                  </Button>
                ) : (
                  <Button size="sm" onClick={programForm.handleSubmit(saveProgram)} disabled={saving || !progName.trim()}>
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
