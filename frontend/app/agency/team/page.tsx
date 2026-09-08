"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { UserPlus, Trash2, RefreshCcw, Mail, Shield } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

interface TeamMember {
  id: string;
  member_email: string;
  role: "agent" | "manager";
  status: "pending" | "active" | "disabled";
  created_at: string;
}

const inviteSchema = z.object({
  member_email: z.string().email("Enter a valid email address"),
  role: z.enum(["agent", "manager"]),
});

type InviteFormData = z.infer<typeof inviteSchema>;

export default function AgencyTeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { member_email: "", role: "agent" },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/v1/agency/team");
      if (data.success) setMembers(data.data);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load team",
        description: getErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onInvite(values: InviteFormData) {
    try {
      await apiClient.post("/api/v1/agency/team", values);
      reset({ member_email: "", role: "agent" });
      await load();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      (Object.keys(fieldErrors) as (keyof InviteFormData)[]).forEach((field) => {
        setError(field, { message: fieldErrors[field] });
      });
      toast({
        variant: "destructive",
        title: "Failed to send invite",
        description: getErrorMessage(err),
      });
    }
  }

  async function updateRole(id: string, role: "agent" | "manager") {
    setUpdatingId(id);
    try {
      await apiClient.patch(`/api/v1/agency/team/${id}`, { role });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update role",
        description: getErrorMessage(err),
      });
    } finally {
      setUpdatingId(null);
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this team member?")) return;
    setRemovingId(id);
    try {
      await apiClient.delete(`/api/v1/agency/team/${id}`);
      setMembers((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to remove member",
        description: getErrorMessage(err),
      });
    } finally {
      setRemovingId(null);
    }
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
      <form onSubmit={handleSubmit(onInvite)} className="rounded-xl border bg-card p-5 space-y-4">
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
                placeholder="colleague@example.com"
                {...register("member_email")}
                className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {errors.member_email && (
              <p className="text-xs text-red-500 mt-1">{errors.member_email.message}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-muted-foreground">Role</label>
            <select
              {...register("role")}
              className="h-9 px-3 py-1 text-sm rounded-lg border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="agent">Agent</option>
              <option value="manager">Manager</option>
            </select>
            {errors.role && (
              <p className="text-xs text-red-500 mt-1">{errors.role.message}</p>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {isSubmitting ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
          {isSubmitting ? "Sending…" : "Send Invite"}
        </button>
      </form>

      {/* Member list */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/30">
          <span className="text-sm font-medium">Members ({members.length})</span>
          <button
            onClick={load}
            className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
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
                    disabled={updatingId === m.id}
                    onChange={(e) => updateRole(m.id, e.target.value as "agent" | "manager")}
                    className="h-7 px-2 text-xs rounded border bg-background focus:outline-none focus:ring-1 focus:ring-primary/30 disabled:opacity-60"
                  >
                    <option value="agent">Agent</option>
                    <option value="manager">Manager</option>
                  </select>
                  <button
                    onClick={() => remove(m.id)}
                    disabled={removingId === m.id}
                    className="inline-flex items-center justify-center rounded p-1 text-muted-foreground hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-60"
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
