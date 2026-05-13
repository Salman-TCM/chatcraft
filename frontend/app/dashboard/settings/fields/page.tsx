"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";

interface CustomField {
  id: string;
  name: string;
  field_key: string;
  field_type: string;
  options: string[] | null;
  is_required: boolean;
  default_value: string | null;
  scope: string;
  created_at: string;
}

const FIELD_TYPES = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Long Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "url", label: "URL" },
  { value: "select", label: "Dropdown (Select)" },
  { value: "checkbox", label: "Checkbox" },
];

const TYPE_COLORS: Record<string, string> = {
  text: "bg-slate-100 text-slate-700",
  textarea: "bg-slate-100 text-slate-700",
  number: "bg-blue-100 text-blue-700",
  date: "bg-amber-100 text-amber-700",
  email: "bg-indigo-100 text-indigo-700",
  phone: "bg-green-100 text-green-700",
  url: "bg-cyan-100 text-cyan-700",
  select: "bg-purple-100 text-purple-700",
  checkbox: "bg-rose-100 text-rose-700",
};

export default function CustomFieldsPage() {
  const [fields, setFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CustomField | null>(null);

  const [form, setForm] = useState({
    name: "",
    field_key: "",
    field_type: "text",
    is_required: false,
    default_value: "",
    options_raw: "",
  });

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/custom-fields");
      setFields(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setForm({ name: "", field_key: "", field_type: "text", is_required: false, default_value: "", options_raw: "" });
    setModalOpen(true);
  }

  function slugify(s: string) {
    return s.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  }

  async function handleSave() {
    if (!form.name.trim() || !form.field_key.trim()) return;
    setSaving(true);
    try {
      const options = form.field_type === "select"
        ? form.options_raw.split(",").map((s) => s.trim()).filter(Boolean)
        : null;
      await apiClient.post("/api/v1/custom-fields", {
        name: form.name.trim(),
        field_key: form.field_key.trim(),
        field_type: form.field_type,
        is_required: form.is_required,
        default_value: form.default_value || null,
        options,
        scope: "contact",
      });
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await apiClient.delete(`/api/v1/custom-fields/${deleteTarget.id}`);
    setDeleteTarget(null);
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Custom Fields</h1>
          <p className="text-sm text-muted-foreground">Add extra data fields to contacts</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Field
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : fields.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <SlidersHorizontal className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No custom fields yet.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Key</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Required</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Options</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f) => (
                <tr key={f.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-medium">{f.name}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{f.field_key}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${TYPE_COLORS[f.field_type] ?? "bg-gray-100 text-gray-700"}`}>
                      {FIELD_TYPES.find((t) => t.value === f.field_type)?.label ?? f.field_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{f.is_required ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {f.options ? f.options.join(", ") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(f)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {/* Create Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Custom Field</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Field Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({
                  ...p,
                  name: e.target.value,
                  field_key: p.field_key || slugify(e.target.value),
                }))}
                placeholder="e.g. Lead Score"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Field Key <span className="text-muted-foreground">(snake_case, permanent)</span></Label>
              <Input
                value={form.field_key}
                onChange={(e) => setForm((p) => ({ ...p, field_key: slugify(e.target.value) }))}
                placeholder="e.g. lead_score"
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Type</Label>
              <select
                value={form.field_type}
                onChange={(e) => setForm((p) => ({ ...p, field_type: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {FIELD_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {form.field_type === "select" && (
              <div className="space-y-1.5">
                <Label>Options <span className="text-muted-foreground">(comma-separated)</span></Label>
                <Input
                  value={form.options_raw}
                  onChange={(e) => setForm((p) => ({ ...p, options_raw: e.target.value }))}
                  placeholder="Option A, Option B, Option C"
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                id="required"
                type="checkbox"
                checked={form.is_required}
                onChange={(e) => setForm((p) => ({ ...p, is_required: e.target.checked }))}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="required">Required field</Label>
            </div>
            <div className="space-y-1.5">
              <Label>Default Value <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                value={form.default_value}
                onChange={(e) => setForm((p) => ({ ...p, default_value: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim() || !form.field_key.trim()}>
              {saving ? "Saving…" : "Create Field"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete field?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deleting <strong>{deleteTarget?.name}</strong> will permanently remove all stored values for this field.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
