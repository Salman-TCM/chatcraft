"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Search, Download, Upload, Pencil, Trash2, X, User,
} from "lucide-react";
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

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  tags: Tag[];
  created_at: string;
}

interface ContactForm {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  company: string;
  source: string;
}

const EMPTY_FORM: ContactForm = {
  first_name: "", last_name: "", email: "", phone: "", company: "", source: "",
};

// ── Page ───────────────────────────────────────────────────────────────────────

export default function ContactsPage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Contact | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const LIMIT = 50;

  async function load(q: string, p: number) {
    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `/api/v1/contacts/search?q=${encodeURIComponent(q)}&page=${p}&limit=${LIMIT}`
        : `/api/v1/contacts?page=${p}&limit=${LIMIT}`;
      const res = await apiClient.get(endpoint);
      const data: Contact[] = res.data.data;
      setContacts(p === 1 ? data : (prev) => [...prev, ...data]);
      setHasMore(data.length === LIMIT);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setPage(1); load(query, 1); }, [query]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(c: Contact) {
    setEditing(c);
    setForm({
      first_name: c.first_name ?? "",
      last_name: c.last_name ?? "",
      email: c.email ?? "",
      phone: c.phone ?? "",
      company: c.company ?? "",
      source: c.source ?? "",
    });
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name || null,
        last_name: form.last_name || null,
        email: form.email || null,
        phone: form.phone || null,
        company: form.company || null,
        source: form.source || null,
      };
      if (editing) {
        await apiClient.patch(`/api/v1/contacts/${editing.id}`, payload);
      } else {
        await apiClient.post("/api/v1/contacts", payload);
      }
      setModalOpen(false);
      load(query, 1);
      setPage(1);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await apiClient.delete(`/api/v1/contacts/${deleteTarget.id}`);
    setDeleteTarget(null);
    load(query, 1);
    setPage(1);
  }

  // ── CSV export ─────────────────────────────────────────────────────────────
  function exportCsv() {
    const header = ["ID", "First Name", "Last Name", "Email", "Phone", "Company", "Source", "Tags", "Created"];
    const rows = contacts.map((c) => [
      c.id,
      c.first_name ?? "",
      c.last_name ?? "",
      c.email ?? "",
      c.phone ?? "",
      c.company ?? "",
      c.source ?? "",
      c.tags.map((t) => t.name).join("|"),
      c.created_at,
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contacts.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV import ─────────────────────────────────────────────────────────────
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split("\n").filter(Boolean);
    // Skip header row; columns: first_name, last_name, email, phone, company, source
    const dataLines = lines.slice(1);
    for (const line of dataLines) {
      const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").replace(/""/g, '"'));
      await apiClient.post("/api/v1/contacts", {
        first_name: cols[0] || null,
        last_name: cols[1] || null,
        email: cols[2] || null,
        phone: cols[3] || null,
        company: cols[4] || null,
        source: cols[5] || null,
      }).catch(() => {});
    }
    e.target.value = "";
    load(query, 1);
    setPage(1);
  }

  const displayName = (c: Contact) =>
    [c.first_name, c.last_name].filter(Boolean).join(" ") || c.email || c.phone || "Unknown";

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contacts</h1>
          <p className="text-sm text-muted-foreground">{contacts.length} loaded</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={importRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Button variant="outline" size="sm" onClick={() => importRef.current?.click()}>
            <Upload className="h-4 w-4" /> Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={contacts.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, email, or phone…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="inline-flex items-center justify-center absolute right-3 top-1/2 -translate-y-1/2" onClick={() => setQuery("")}>
            <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
          </button>
        )}
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Phone</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Company</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tags</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  className="border-b hover:bg-muted/30 cursor-pointer transition-colors"
                  onClick={() => router.push(`/dashboard/contacts/${c.id}`)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                        <User className="h-3.5 w-3.5" />
                      </div>
                      <span className="font-medium">{displayName(c)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.company ?? "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 3).map((t) => (
                        <span
                          key={t.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: t.color }}
                        >
                          {t.name}
                        </span>
                      ))}
                      {c.tags.length > 3 && (
                        <span className="text-xs text-muted-foreground">+{c.tags.length - 3}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(c)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          )}
          {!loading && contacts.length === 0 && (
            <div className="py-12 text-center">
              <User className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No contacts yet. Add your first contact.</p>
            </div>
          )}
        </div>
        {hasMore && !loading && (
          <div className="border-t p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => { setPage((p) => p + 1); load(query, page + 1); }}>
              Load more
            </Button>
          </div>
        )}
      </Card>

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Contact" : "New Contact"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>First Name</Label>
              <Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Last Name</Label>
              <Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Company</Label>
              <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Source</Label>
              <Input placeholder="e.g. web, referral, import…" value={form.source} onChange={(e) => setForm((f) => ({ ...f, source: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete contact?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete <strong>{deleteTarget ? displayName(deleteTarget) : ""}</strong> and all associated data.
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
