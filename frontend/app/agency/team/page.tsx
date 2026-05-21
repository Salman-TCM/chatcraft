"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { UserPlus, Trash2, RefreshCcw, Mail, Shield } from "lucide-react";

interface TeamMember {
  id: string;
  member_email: string;
  role: "agent" | "manager";
  status: "pending" | "active" | "disabled";
  created_at: string;
}

export default function AgencyTeamPage() {
  const user = useAppStore((s) => s.user);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"agent" | "manager">("agent");
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!user?.accessToken) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/agency/team`, {
        headers: { Authorization: `Bearer ${user.accessToken}` },
      });
      const data = await res.json();
      if (data.success) setMembers(data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [user?.accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.accessToken || !inviteEmail.trim()) return;
    setInviting(true);
    setError("");
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/agency/team`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${user.accessToken}`,
        },
        body: JSON.stringify({ member_email: inviteEmail.trim(), role: inviteRole }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.detail ?? "Failed to invite");
      } else {
        setInviteEmail("");
        await load();
      }
    } catch {
      setError("Network error");
    } finally {
      setInviting(false);
    }
  }

  async function updateRole(id: string, role: "agent" | "manager") {
    if (!user?.accessToken) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/agency/team/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user.accessToken}`,
      },
      body: JSON.stringify({ role }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!user?.accessToken || !confirm("Remove this team member?")) return;
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/agency/team/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user.accessToken}` },
    });
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  const statusBadge = (s: string) => {
    const cls =
      s === "active"
        ? "bg-emerald-100 text-emerald-700"
        : s === "pending"
        ? "bg-amber-100 text-amber-700"
        : "bg-gray-100 text-gray-500";
    return (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`}>
        {s}
      </span>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Team Members</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Invite agents and managers to help run your agency portal.
        </p>
      </div>

      {/* Invite form */}
      <form onSubmit={invite} className="rounded-xl border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          Invite a team member
        </h2>
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Email address</label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                required
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Role</label>
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as "agent" | "manager")}
              className="h-9 px-3 py-1 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
            </select>
          </div>
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="submit"
          disabled={inviting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {inviting ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          {inviting ? "Sending…" : "Send Invite"}
        </button>
      </form>

      {/* Member list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <span className="text-sm font-medium">Members ({members.length})</span>
          <button
            onClick={load}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center space-y-2">
            <Shield className="h-8 w-8 mx-auto text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No team members yet. Invite someone above.</p>
          </div>
        ) : (
          <div className="divide-y">
            {members.map((m) => (
              <div key={m.id} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.member_email}</p>
                  <p className="text-xs text-muted-foreground">
                    Invited {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {statusBadge(m.status)}
                  <select
                    value={m.role}
                    onChange={(e) => updateRole(m.id, e.target.value as "agent" | "manager")}
                    className="h-7 px-2 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                  >
                    <option value="agent">Agent</option>
                    <option value="manager">Manager</option>
                  </select>
                  <button
                    onClick={() => remove(m.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
