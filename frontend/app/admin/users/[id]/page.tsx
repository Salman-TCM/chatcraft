"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Shield, Trash2, Eye, CheckCircle, AlertTriangle, Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";

// Keep in sync with backend features.py
const ALL_FEATURES_LIST: { key: string; label: string }[] = [
  { key: "wallet",         label: "Wallet & Loyalty" },
  { key: "agent_builder",  label: "Agent Builder" },
  { key: "flows",          label: "Flows" },
  { key: "automations",    label: "Automations" },
  { key: "analytics",      label: "Analytics" },
  { key: "knowledge_base", label: "Knowledge Base" },
  { key: "inbox",          label: "Inbox" },
  { key: "forms",          label: "Forms" },
  { key: "campaigns",      label: "Campaigns" },
  { key: "white_label",    label: "White Label / Agency" },
];

interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  email_verified: boolean;
  is_suspended: boolean;
  suspended_reason: string | null;
  stripe_customer_id: string | null;
  allowed_features: string[] | null;
  subscription: {
    plan: string | null;
    status: string | null;
    current_period_end: string | null;
  } | null;
  stats: {
    chatbot_count: number;
    message_count: number;
    total_ai_spend_usd: string;
  };
  created_at: string;
  updated_at: string;
}

const ROLES = ["free", "trial", "premium", "creator", "admin"];
const PLANS = ["free", "trial", "starter", "pro", "enterprise"];
const SUB_STATUSES = ["active", "trialing", "past_due", "canceled", "unpaid"];

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editRole, setEditRole] = useState("");
  const [editPlan, setEditPlan] = useState("");
  const [editSubStatus, setEditSubStatus] = useState("");
  const [editVerified, setEditVerified] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [impersonating, setImpersonating] = useState(false);
  const [suspending, setSuspending] = useState(false);
  const [suspendReason, setSuspendReason] = useState("");

  // Feature access management
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const [featureUnrestricted, setFeatureUnrestricted] = useState(true);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [savingFeatures, setSavingFeatures] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get(`/api/admin/users/${id}`);
      const u: AdminUser = res.data.data;
      setUser(u);
      setEditRole(u.role);
      setEditPlan(u.subscription?.plan ?? "free");
      setEditSubStatus(u.subscription?.status ?? "active");
      setEditVerified(u.email_verified);
      setFeatureUnrestricted(u.allowed_features === null);
      setSelectedFeatures(u.allowed_features ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function handleSave() {
    setSaving(true);
    try {
      await apiClient.patch(`/api/admin/users/${id}`, {
        role: editRole,
        email_verified: editVerified,
        ...(user?.subscription ? { plan: editPlan, subscription_status: editSubStatus } : {}),
      });
      setEditOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFeatures() {
    setSavingFeatures(true);
    try {
      await apiClient.patch(`/api/admin/users/${id}/features`, {
        allowed_features: featureUnrestricted ? null : selectedFeatures,
      });
      setFeaturesOpen(false);
      await load();
    } finally {
      setSavingFeatures(false);
    }
  }

  function toggleFeature(key: string) {
    setSelectedFeatures((prev) =>
      prev.includes(key) ? prev.filter((f) => f !== key) : [...prev, key]
    );
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await apiClient.delete(`/api/admin/users/${id}`);
      router.push("/admin/users");
    } finally {
      setDeleting(false);
    }
  }

  async function handleSuspend() {
    if (!confirm(`Suspend ${user?.email}? They will be locked out immediately.`)) return;
    setSuspending(true);
    try {
      await apiClient.post(`/api/admin/users/${id}/suspend`, null, { params: { reason: suspendReason || undefined } });
      await load();
    } finally {
      setSuspending(false);
    }
  }

  async function handleUnsuspend() {
    setSuspending(true);
    try {
      await apiClient.post(`/api/admin/users/${id}/unsuspend`);
      await load();
    } finally {
      setSuspending(false);
    }
  }

  async function handleImpersonate() {
    setImpersonating(true);
    try {
      const res = await apiClient.post(`/api/admin/users/${id}/impersonate`);
      const token = res.data.data.access_token;
      localStorage.setItem("impersonation_session", JSON.stringify({
        token,
        userName: user?.name ?? user?.email ?? id,
        expiresAt: Date.now() + 5 * 60 * 1000,
      }));
      window.open("/dashboard", "_blank");
    } finally {
      setImpersonating(false);
    }
  }

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  if (!user) return <div className="p-6 text-sm text-muted-foreground">User not found.</div>;

  const roleColor: Record<string, string> = {
    admin: "text-red-600", creator: "text-violet-600", premium: "text-indigo-600",
    trial: "text-amber-600", free: "text-slate-500",
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/admin/users")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{user.name ?? user.email}</h1>
          <p className="text-xs text-muted-foreground capitalize">
            {user.role} · Joined {new Date(user.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
            <Shield className="h-4 w-4" /> Edit Role / Plan
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFeaturesOpen(true)}>
            <Lock className="h-4 w-4" /> Feature Access
          </Button>
          <Button size="sm" variant="outline" onClick={handleImpersonate} disabled={impersonating}>
            <Eye className="h-4 w-4" /> {impersonating ? "…" : "Impersonate"}
          </Button>
          {user.is_suspended ? (
            <Button size="sm" variant="outline" onClick={handleUnsuspend} disabled={suspending} className="border-green-300 text-green-700 hover:bg-green-50">
              {suspending ? "…" : "Unsuspend"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleSuspend} disabled={suspending} className="border-amber-300 text-amber-700 hover:bg-amber-50">
              {suspending ? "…" : "Suspend"}
            </Button>
          )}
          <Button
            size="sm"
            variant="destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> Delete
          </Button>
        </div>
      </div>


      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {/* Profile */}
          <Card className="p-5">
            <p className="mb-4 text-sm font-semibold">Profile</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Email</dt>
                <dd className="font-medium flex items-center gap-1.5">
                  {user.email}
                  {user.email_verified
                    ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Name</dt>
                <dd className="font-medium">{user.name ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Role</dt>
                <dd className={`font-semibold capitalize ${roleColor[user.role]}`}>{user.role}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Account Status</dt>
                <dd className={`font-semibold text-xs ${user.is_suspended ? "text-red-600" : "text-green-600"}`}>
                  {user.is_suspended ? `Suspended${user.suspended_reason ? ` — ${user.suspended_reason}` : ""}` : "Active"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Stripe Customer</dt>
                <dd className="font-mono text-xs">{user.stripe_customer_id ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last Updated</dt>
                <dd className="text-xs">{new Date(user.updated_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">User ID</dt>
                <dd className="font-mono text-xs truncate">{user.id}</dd>
              </div>
            </dl>
          </Card>

          {/* Subscription */}
          {user.subscription && (
            <Card className="p-5">
              <p className="mb-4 text-sm font-semibold">Subscription</p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Plan</dt>
                  <dd className="font-medium capitalize">{user.subscription.plan ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Status</dt>
                  <dd className="font-medium capitalize">{user.subscription.status?.replace("_", " ") ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Period End</dt>
                  <dd className="text-xs">
                    {user.subscription.current_period_end
                      ? new Date(user.subscription.current_period_end).toLocaleDateString()
                      : "—"}
                  </dd>
                </div>
              </dl>
            </Card>
          )}
        </div>

        {/* Stats sidebar */}
        <div className="space-y-4">
          {[
            { label: "Chatbots", value: user.stats.chatbot_count.toLocaleString() },
            { label: "Messages sent", value: user.stats.message_count.toLocaleString() },
            { label: "AI spend (total)", value: `$${parseFloat(user.stats.total_ai_spend_usd).toFixed(4)}` },
          ].map(({ label, value }) => (
            <Card key={label} className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold">{value}</p>
            </Card>
          ))}
        </div>
      </div>

      {/* Edit modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <select
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring capitalize"
              >
                {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
              </select>
            </div>
            {user.subscription && (
              <>
                <div className="space-y-1.5">
                  <Label>Subscription Plan</Label>
                  <select
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring capitalize"
                  >
                    {PLANS.map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label>Subscription Status</Label>
                  <select
                    value={editSubStatus}
                    onChange={(e) => setEditSubStatus(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {SUB_STATUSES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                  </select>
                </div>
              </>
            )}
            <div className="flex items-center gap-2">
              <input
                id="verified"
                type="checkbox"
                checked={editVerified}
                onChange={(e) => setEditVerified(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="verified">Email verified</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feature access */}
      <Dialog open={featuresOpen} onOpenChange={setFeaturesOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Feature Access — {user.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/40">
              <input
                id="unrestricted"
                type="checkbox"
                checked={featureUnrestricted}
                onChange={(e) => setFeatureUnrestricted(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <div>
                <Label htmlFor="unrestricted" className="font-medium">Unrestricted (all features)</Label>
                <p className="text-xs text-muted-foreground">User has access to every feature. Uncheck to restrict.</p>
              </div>
            </div>

            {!featureUnrestricted && (
              <div className="space-y-2">
                <Label className="text-sm text-muted-foreground">Allowed features</Label>
                <div className="grid grid-cols-1 gap-2">
                  {ALL_FEATURES_LIST.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedFeatures.includes(key)}
                        onChange={() => toggleFeature(key)}
                        className="h-4 w-4 rounded border-input"
                      />
                      <span className="text-sm">{label}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  {selectedFeatures.length === 0
                    ? "No features selected — user will see a restricted message on all feature pages."
                    : `${selectedFeatures.length} feature${selectedFeatures.length === 1 ? "" : "s"} enabled.`}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeaturesOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFeatures} disabled={savingFeatures}>
              {savingFeatures ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete user?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently deletes <strong>{user.email}</strong> and all their chatbots, conversations, and data. This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete Permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
