"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Wallet, Plus, Loader2, Pencil, Trash2, Users, Send, X,
  ChevronDown, ChevronUp, Download, Smartphone, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface ProgramType {
  value: string;
  label: string;
  icon: string;
  description: string;
}

interface WalletProgram {
  id: string;
  name: string;
  type: string;
  description: string | null;
  status: string;
  config: Record<string, unknown>;
  brand_overrides: Record<string, string>;
  google_class_id: string | null;
  created_at: string;
}

interface WalletCard {
  id: string;
  serial: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  status: string;
  state: Record<string, unknown>;
  google_pass_object_id: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; hasValue: boolean; valueLabel?: string }> = {
  add_punch:       { label: "Add Punch",        hasValue: false },
  remove_punch:    { label: "Remove Punch",      hasValue: false },
  set_punches:     { label: "Set Punches",       hasValue: true, valueLabel: "Count" },
  redeem:          { label: "Redeem",            hasValue: false },
  add_points:      { label: "Add Points",        hasValue: true, valueLabel: "Points" },
  remove_points:   { label: "Remove Points",     hasValue: true, valueLabel: "Points" },
  set_tier:        { label: "Set Tier",          hasValue: true, valueLabel: "Tier Name" },
  load_balance:    { label: "Load Balance",      hasValue: true, valueLabel: "Amount" },
  deduct_balance:  { label: "Deduct Balance",    hasValue: true, valueLabel: "Amount" },
  refund_balance:  { label: "Refund Balance",    hasValue: true, valueLabel: "Amount" },
  set_balance:     { label: "Set Balance",       hasValue: true, valueLabel: "Amount" },
  check_in:        { label: "Check In",          hasValue: false },
  un_check_in:     { label: "Un-Check In",       hasValue: false },
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

type View = "list" | "cards";

export default function WalletPage() {
  const [programTypes, setProgramTypes] = useState<ProgramType[]>([]);
  const [programs, setPrograms] = useState<WalletProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("list");
  const [activeProgram, setActiveProgram] = useState<WalletProgram | null>(null);
  const [cards, setCards] = useState<WalletCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);

  // Program modal
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [editingProgram, setEditingProgram] = useState<WalletProgram | null>(null);
  const [wizardStep, setWizardStep] = useState<"type" | "config">("type");
  const [progName, setProgName] = useState("");
  const [progDesc, setProgDesc] = useState("");
  const [progType, setProgType] = useState("");
  const [progConfig, setProgConfig] = useState<Record<string, string>>({});
  const [progBrand, setProgBrand] = useState<Record<string, string>>({});
  const [savingProg, setSavingProg] = useState(false);

  // Issue card modal
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueName, setIssueName] = useState("");
  const [issueEmail, setIssueEmail] = useState("");
  const [issuePhone, setIssuePhone] = useState("");
  const [issuingCard, setIssuingCard] = useState(false);

  // Action panel
  const [actionCard, setActionCard] = useState<WalletCard | null>(null);
  const [selectedAction, setSelectedAction] = useState("");
  const [actionValue, setActionValue] = useState("");
  const [runningAction, setRunningAction] = useState(false);

  // Push modal
  const [pushTarget, setPushTarget] = useState<{ type: "card"; serial: string } | { type: "program"; id: string } | null>(null);
  const [pushMessage, setPushMessage] = useState("");
  const [sendingPush, setSendingPush] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [typesRes, progsRes] = await Promise.all([
        apiClient.get("/api/wallet/program-types"),
        apiClient.get("/api/wallet/programs?limit=100"),
      ]);
      setProgramTypes(typesRes.data.data ?? []);
      setPrograms(progsRes.data.data ?? []);
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

  function openCreateProgram() {
    setEditingProgram(null);
    setProgName(""); setProgDesc(""); setProgType(""); setProgConfig({}); setProgBrand({});
    setWizardStep("type");
    setShowProgramModal(true);
  }

  function openEditProgram(p: WalletProgram) {
    setEditingProgram(p);
    setProgName(p.name); setProgDesc(p.description ?? "");
    setProgType(p.type);
    setProgConfig(Object.fromEntries(Object.entries(p.config).map(([k, v]) => [k, String(v)])));
    setProgBrand({ ...p.brand_overrides });
    setWizardStep("config");
    setShowProgramModal(true);
  }

  async function saveProgram() {
    if (!progName.trim() || !progType) return;
    setSavingProg(true);
    const payload = {
      name: progName.trim(),
      description: progDesc || null,
      type: progType,
      config: progConfig,
      brand_overrides: progBrand,
    };
    try {
      if (editingProgram) {
        await apiClient.patch(`/api/wallet/programs/${editingProgram.id}`, payload);
      } else {
        await apiClient.post("/api/wallet/programs", payload);
      }
      setShowProgramModal(false);
      await load();
    } catch {}
    setSavingProg(false);
  }

  async function deleteProgram(id: string) {
    if (!confirm("Delete this program and all its cards?")) return;
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
        customer_name: issueName || null,
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
    if (!confirm("Revoke this card?")) return;
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
      setPushTarget(null);
      setPushMessage("");
    } catch {}
    setSendingPush(false);
  }

  function configFields(type: string): { key: string; label: string; placeholder: string }[] {
    if (type === "punch_card") return [
      { key: "max_punches", label: "Max Punches", placeholder: "10" },
      { key: "reward_description", label: "Reward Description", placeholder: "Free coffee" },
    ];
    if (type === "points") return [
      { key: "points_per_dollar", label: "Points per Dollar", placeholder: "1" },
      { key: "default_tier", label: "Default Tier", placeholder: "Bronze" },
    ];
    if (type === "membership") return [
      { key: "default_tier", label: "Default Tier", placeholder: "Standard" },
    ];
    if (type === "prepaid_balance") return [
      { key: "initial_balance", label: "Initial Balance", placeholder: "0" },
      { key: "currency", label: "Currency", placeholder: "USD" },
    ];
    if (type === "event_ticket") return [
      { key: "event_name", label: "Event Name", placeholder: "Conference 2026" },
      { key: "event_date", label: "Event Date", placeholder: "Jan 15, 2026" },
      { key: "default_seat", label: "Default Seat", placeholder: "General Admission" },
    ];
    if (type === "coupon") return [
      { key: "offer_label", label: "Offer Label", placeholder: "Discount" },
      { key: "offer_value", label: "Offer Value", placeholder: "20% Off" },
    ];
    return [];
  }

  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";

  // ── Cards view ─────────────────────────────────────────────────────────────
  if (view === "cards" && activeProgram) {
    const typeInfo = programTypes.find((t) => t.value === activeProgram.type);
    const availableActions = TYPE_ACTIONS[activeProgram.type] ?? [];

    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setView("list")}>← Back</Button>
            <div>
              <h1 className="text-xl font-semibold">{activeProgram.name}</h1>
              <p className="text-xs text-muted-foreground">{typeInfo?.icon} {typeInfo?.label} · {cards.length} card{cards.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setPushTarget({ type: "program", id: activeProgram.id }); setPushMessage(""); }}>
              <Send className="h-4 w-4 mr-1" /> Broadcast
            </Button>
            <Button size="sm" onClick={() => { setIssueName(""); setIssueEmail(""); setIssuePhone(""); setShowIssueModal(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Issue Card
            </Button>
          </div>
        </div>

        {cardsLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : cards.length === 0 ? (
          <Card className="p-12 text-center">
            <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No cards issued yet</p>
            <p className="text-sm text-muted-foreground mb-4">Issue your first card to a customer.</p>
            <Button onClick={() => setShowIssueModal(true)}><Plus className="h-4 w-4 mr-1" /> Issue Card</Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {cards.map((card) => (
              <Card key={card.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-medium">{card.customer_name ?? "Guest"}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        card.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                      }`}>{card.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{card.customer_email ?? "—"} · {card.customer_phone ?? "—"}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries(card.state).map(([k, v]) => (
                        <span key={k} className="text-xs bg-muted px-2 py-0.5 rounded-md">
                          {k}: <strong>{String(v)}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {availableActions.length > 0 && card.status === "active" && (
                      <Button variant="ghost" size="sm" onClick={() => { setActionCard(card); setSelectedAction(""); setActionValue(""); }}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" title="Push notification"
                      onClick={() => { setPushTarget({ type: "card", serial: card.serial }); setPushMessage(""); }}>
                      <Send className="h-4 w-4" />
                    </Button>
                    <a href={`${apiBase}/api/wallet/cards/${card.serial}/pkpass`} target="_blank" rel="noreferrer">
                      <Button variant="ghost" size="sm" title="Download .pkpass">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                    <Button variant="ghost" size="sm" onClick={() => revokeCard(card.serial)}
                      className="text-destructive hover:text-destructive" disabled={card.status !== "active"}>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Issue New Card</h2>
                <button onClick={() => setShowIssueModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1"><Label>Customer Name</Label>
                  <Input value={issueName} onChange={(e) => setIssueName(e.target.value)} placeholder="Jane Smith" /></div>
                <div className="space-y-1"><Label>Email</Label>
                  <Input type="email" value={issueEmail} onChange={(e) => setIssueEmail(e.target.value)} placeholder="jane@example.com" /></div>
                <div className="space-y-1"><Label>Phone</Label>
                  <Input value={issuePhone} onChange={(e) => setIssuePhone(e.target.value)} placeholder="+1 555 000 0000" /></div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setShowIssueModal(false)}>Cancel</Button>
                <Button onClick={issueCard} disabled={issuingCard}>
                  {issuingCard ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Issue Card
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Action panel */}
        {actionCard && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold">Card Action — {actionCard.customer_name ?? actionCard.serial}</h2>
                <button onClick={() => setActionCard(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="p-4 space-y-3">
                <div className="space-y-1">
                  <Label>Action</Label>
                  <select value={selectedAction} onChange={(e) => { setSelectedAction(e.target.value); setActionValue(""); }}
                    className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                    <option value="">Select action…</option>
                    {availableActions.map((a) => (
                      <option key={a} value={a}>{ACTION_LABELS[a]?.label}</option>
                    ))}
                  </select>
                </div>
                {selectedAction && ACTION_LABELS[selectedAction]?.hasValue && (
                  <div className="space-y-1">
                    <Label>{ACTION_LABELS[selectedAction].valueLabel}</Label>
                    <Input value={actionValue} onChange={(e) => setActionValue(e.target.value)} placeholder="e.g. 100" />
                  </div>
                )}
                <div className="text-xs text-muted-foreground bg-muted rounded-lg p-2">
                  {Object.entries(actionCard.state).map(([k, v]) => (
                    <span key={k} className="mr-3">{k}: <strong>{String(v)}</strong></span>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setActionCard(null)}>Cancel</Button>
                <Button onClick={runAction} disabled={runningAction || !selectedAction}>
                  {runningAction ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Apply
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Push modal */}
        {pushTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
              <div className="flex items-center justify-between p-4 border-b">
                <h2 className="font-semibold flex items-center gap-2">
                  <Smartphone className="h-4 w-4" />
                  {pushTarget.type === "program" ? "Broadcast Push" : "Push Notification"}
                </h2>
                <button onClick={() => setPushTarget(null)}><X className="h-5 w-5 text-muted-foreground" /></button>
              </div>
              <div className="p-4 space-y-2">
                <Label>Message</Label>
                <textarea
                  className="w-full h-24 p-2 text-sm rounded-md border bg-background resize-none"
                  value={pushMessage}
                  onChange={(e) => setPushMessage(e.target.value)}
                  placeholder="Your pass has been updated!"
                />
              </div>
              <div className="flex justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setPushTarget(null)}>Cancel</Button>
                <Button onClick={sendPush} disabled={sendingPush || !pushMessage.trim()}>
                  {sendingPush ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                  Send
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Programs list ──────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Wallet className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Wallet Programs</h1>
        </div>
        <Button onClick={openCreateProgram}>
          <Plus className="h-4 w-4 mr-1" /> New Program
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : programs.length === 0 ? (
        <Card className="p-12 text-center">
          <Wallet className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No wallet programs yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create a loyalty program to issue Apple & Google Wallet passes.</p>
          <Button onClick={openCreateProgram}><Plus className="h-4 w-4 mr-1" /> New Program</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {programs.map((p) => {
            const typeInfo = programTypes.find((t) => t.value === p.type);
            return (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl leading-none w-10 h-10 flex items-center justify-center rounded-xl bg-muted">
                      {typeInfo?.icon ?? "🪪"}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{p.name}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.status === "active" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                        }`}>{p.status}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{typeInfo?.label}</p>
                      {p.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => loadCards(p)} title="View cards">
                      <Users className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openEditProgram(p)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => deleteProgram(p.id)} className="text-destructive hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create / Edit Program Modal */}
      {showProgramModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">{editingProgram ? "Edit Program" : wizardStep === "type" ? "Choose Program Type" : "Configure Program"}</h2>
              <button onClick={() => setShowProgramModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {wizardStep === "type" && !editingProgram ? (
                <div className="grid grid-cols-2 gap-3">
                  {programTypes.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => { setProgType(t.value); setWizardStep("config"); }}
                      className={`text-left p-3 rounded-xl border-2 transition-colors hover:border-primary ${
                        progType === t.value ? "border-primary bg-primary/5" : "border-muted"
                      }`}
                    >
                      <div className="text-xl mb-1">{t.icon}</div>
                      <p className="font-medium text-sm">{t.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-1"><Label>Program Name *</Label>
                    <Input value={progName} onChange={(e) => setProgName(e.target.value)} placeholder="e.g. Gold Loyalty Card" /></div>
                  <div className="space-y-1"><Label>Description</Label>
                    <Input value={progDesc} onChange={(e) => setProgDesc(e.target.value)} placeholder="Optional description" /></div>

                  {configFields(progType).length > 0 && (
                    <div className="border rounded-lg p-3 space-y-3">
                      <p className="text-sm font-medium text-muted-foreground">Program Settings</p>
                      {configFields(progType).map((f) => (
                        <div key={f.key} className="space-y-1">
                          <Label className="text-xs">{f.label}</Label>
                          <Input
                            value={progConfig[f.key] ?? ""}
                            onChange={(e) => setProgConfig((p) => ({ ...p, [f.key]: e.target.value }))}
                            placeholder={f.placeholder}
                            className="h-8 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border rounded-lg p-3 space-y-3">
                    <p className="text-sm font-medium text-muted-foreground">Branding</p>
                    {[
                      { key: "background_color", label: "Background Color", placeholder: "#6366f1" },
                      { key: "foreground_color", label: "Text Color", placeholder: "#ffffff" },
                      { key: "label_color", label: "Label Color", placeholder: "#c0c0ff" },
                      { key: "logo_url", label: "Logo URL", placeholder: "https://..." },
                    ].map((f) => (
                      <div key={f.key} className="space-y-1">
                        <Label className="text-xs">{f.label}</Label>
                        <Input
                          value={progBrand[f.key] ?? ""}
                          onChange={(e) => setProgBrand((b) => ({ ...b, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between gap-2 p-4 border-t">
              {wizardStep === "config" && !editingProgram ? (
                <Button variant="outline" onClick={() => setWizardStep("type")}>← Back</Button>
              ) : <div />}
              {wizardStep === "config" || editingProgram ? (
                <Button onClick={saveProgram} disabled={savingProg || !progName.trim()}>
                  {savingProg ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  {editingProgram ? "Save Changes" : "Create Program"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
