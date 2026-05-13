"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";

interface Tag { id: string; name: string; color: string; created_at: string }

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f59e0b", "#10b981", "#06b6d4", "#3b82f6",
  "#64748b", "#1e293b",
];

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/tags");
      setTags(res.data.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setName("");
    setColor("#6366f1");
    setModalOpen(true);
  }

  function openEdit(t: Tag) {
    setEditing(t);
    setName(t.name);
    setColor(t.color);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await apiClient.patch(`/api/v1/tags/${editing.id}`, { name: name.trim(), color });
      } else {
        await apiClient.post("/api/v1/tags", { name: name.trim(), color });
      }
      setModalOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await apiClient.delete(`/api/v1/tags/${deleteTarget.id}`);
    setDeleteTarget(null);
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Tags</h1>
          <p className="text-sm text-muted-foreground">Organise contacts with coloured labels</p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" /> New Tag
        </Button>
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">Loading…</div>
      ) : tags.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-16">
          <TagIcon className="mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No tags yet. Create your first tag.</p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tags.map((t) => (
            <Card key={t.id} className="flex items-center gap-3 p-4">
              <div
                className="h-8 w-8 shrink-0 rounded-full"
                style={{ backgroundColor: t.color }}
              />
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{t.name}</span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(t)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tag" : "New Tag"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. VIP, Hot Lead, Follow Up"
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className="h-7 w-7 rounded-full transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    style={{
                      backgroundColor: c,
                      outline: color === c ? `3px solid ${c}` : undefined,
                      outlineOffset: "2px",
                    }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <div className="h-7 w-7 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <Input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-8 w-24 cursor-pointer p-0.5"
                />
                <span className="text-xs text-muted-foreground font-mono">{color}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !name.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Delete tag?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Deleting <strong>{deleteTarget?.name}</strong> will remove it from all contacts.
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
