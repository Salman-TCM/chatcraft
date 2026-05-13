"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Tag as TagIcon, X, Plus, Pencil, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Tag { id: string; name: string; color: string }
interface CustomField { id: string; name: string; field_key: string; field_type: string }
interface FieldValue { field_id: string; value: string | null }

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  public_id: string | null;
  contact_id: string | null;
  tags: Tag[];
  created_at: string;
  updated_at: string;
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [contact, setContact] = useState<Contact | null>(null);
  const [fieldValues, setFieldValues] = useState<FieldValue[]>([]);
  const [allFields, setAllFields] = useState<CustomField[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);

  // Edit contact modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", email: "", phone: "", company: "", source: "" });
  const [saving, setSaving] = useState(false);

  // Tag picker
  const [tagPickerOpen, setTagPickerOpen] = useState(false);

  // Fields editor
  const [fieldEdits, setFieldEdits] = useState<Record<string, string>>({});
  const [savingFields, setSavingFields] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [cRes, fvRes, cfRes, tagsRes] = await Promise.all([
        apiClient.get(`/api/v1/contacts/${id}`),
        apiClient.get(`/api/v1/contacts/${id}/fields`),
        apiClient.get("/api/v1/custom-fields"),
        apiClient.get("/api/v1/tags"),
      ]);
      const c: Contact = cRes.data.data;
      setContact(c);
      setFieldValues(fvRes.data.data);
      setAllFields(cfRes.data.data);
      setAllTags(tagsRes.data.data);
      setEditForm({
        first_name: c.first_name ?? "",
        last_name: c.last_name ?? "",
        email: c.email ?? "",
        phone: c.phone ?? "",
        company: c.company ?? "",
        source: c.source ?? "",
      });
      // Init field edits map from current values
      const valueMap: Record<string, string> = {};
      for (const fv of fvRes.data.data as FieldValue[]) {
        const field = (cfRes.data.data as CustomField[]).find((f) => f.id === fv.field_id);
        if (field) valueMap[field.field_key] = fv.value ?? "";
      }
      setFieldEdits(valueMap);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function saveContact() {
    if (!contact) return;
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/contacts/${contact.id}`, {
        first_name: editForm.first_name || null,
        last_name: editForm.last_name || null,
        email: editForm.email || null,
        phone: editForm.phone || null,
        company: editForm.company || null,
        source: editForm.source || null,
      });
      setEditOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function addTag(tagId: string) {
    if (!contact) return;
    await apiClient.post(`/api/v1/contacts/${contact.id}/tags`, { tag_ids: [tagId] });
    await load();
    setTagPickerOpen(false);
  }

  async function removeTag(tagId: string) {
    if (!contact) return;
    await apiClient.delete(`/api/v1/contacts/${contact.id}/tags/${tagId}`);
    await load();
  }

  async function saveFields() {
    if (!contact) return;
    setSavingFields(true);
    try {
      await apiClient.put(`/api/v1/contacts/${contact.id}/fields`, { fields: fieldEdits });
      await load();
    } finally {
      setSavingFields(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!contact) {
    return <div className="p-6 text-sm text-muted-foreground">Contact not found.</div>;
  }

  const displayName = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || contact.email || contact.phone || "Unknown";
  const contactTags = new Set(contact.tags.map((t) => t.id));
  const unaddedTags = allTags.filter((t) => !contactTags.has(t.id));

  return (
    <div className="space-y-6 p-6">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/dashboard/contacts")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">{displayName}</h1>
          <p className="text-xs text-muted-foreground">Contact · Created {new Date(contact.created_at).toLocaleDateString()}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
          <Pencil className="h-4 w-4" /> Edit
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left — Profile */}
        <div className="space-y-5 lg:col-span-2">
          {/* Core fields */}
          <Card className="p-5">
            <p className="mb-4 text-sm font-semibold">Profile</p>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              {[
                ["First Name", contact.first_name],
                ["Last Name", contact.last_name],
                ["Email", contact.email],
                ["Phone", contact.phone],
                ["Company", contact.company],
                ["Source", contact.source],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground text-xs">{label}</dt>
                  <dd className="font-medium">{value ?? <span className="text-muted-foreground">—</span>}</dd>
                </div>
              ))}
            </dl>
          </Card>

          {/* Custom Fields */}
          {allFields.length > 0 && (
            <Card className="p-5">
              <p className="mb-4 text-sm font-semibold">Custom Fields</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {allFields.map((f) => (
                  <div key={f.id} className="space-y-1">
                    <Label className="text-xs">{f.name}</Label>
                    <Input
                      type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                      value={fieldEdits[f.field_key] ?? ""}
                      onChange={(e) => setFieldEdits((prev) => ({ ...prev, [f.field_key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              <Button size="sm" className="mt-4" onClick={saveFields} disabled={savingFields}>
                {savingFields ? "Saving…" : "Save Fields"}
              </Button>
            </Card>
          )}
        </div>

        {/* Right — Tags + meta */}
        <div className="space-y-5">
          {/* Tags */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">Tags</p>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setTagPickerOpen(true)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {contact.tags.length === 0 && (
                <p className="text-xs text-muted-foreground">No tags yet.</p>
              )}
              {contact.tags.map((t) => (
                <span
                  key={t.id}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: t.color }}
                >
                  {t.name}
                  <button onClick={() => removeTag(t.id)} className="opacity-80 hover:opacity-100">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </Card>

          {/* Meta */}
          <Card className="p-5 space-y-2.5 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Contact ID</p>
              <p className="font-mono text-xs truncate">{contact.id}</p>
            </div>
            {contact.public_id && (
              <div>
                <p className="text-xs text-muted-foreground">Public ID</p>
                <p className="text-xs">{contact.public_id}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="text-xs">{new Date(contact.updated_at).toLocaleString()}</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            {(["first_name", "last_name"] as const).map((f) => (
              <div key={f} className="space-y-1.5">
                <Label>{f.replace("_", " ").replace(/\b\w/g, (c) => c.toUpperCase())}</Label>
                <Input value={editForm[f]} onChange={(e) => setEditForm((p) => ({ ...p, [f]: e.target.value }))} />
              </div>
            ))}
            {(["email", "phone", "company", "source"] as const).map((f) => (
              <div key={f} className="space-y-1.5 col-span-2">
                <Label>{f.replace(/\b\w/g, (c) => c.toUpperCase())}</Label>
                <Input
                  type={f === "email" ? "email" : "text"}
                  value={editForm[f]}
                  onChange={(e) => setEditForm((p) => ({ ...p, [f]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveContact} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Tag picker */}
      <Dialog open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Tag</DialogTitle></DialogHeader>
          {unaddedTags.length === 0 ? (
            <p className="text-sm text-muted-foreground">All tags already applied, or no tags created yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2 py-2">
              {unaddedTags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => addTag(t.id)}
                  className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80"
                  style={{ backgroundColor: t.color }}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTagPickerOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
