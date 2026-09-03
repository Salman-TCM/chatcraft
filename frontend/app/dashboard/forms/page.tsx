"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FileText, Plus, Loader2, Pencil, Trash2, Eye, Copy, GripVertical,
  X, ChevronDown, ChevronUp, ExternalLink,
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

interface FieldDef {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
  help_text?: string;
}

interface Form {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  success_message: string;
  submit_button_text: string;
  public_id: string;
  chatbot_id: string | null;
  fields: FieldDef[];
  created_at: string;
}

interface Submission {
  id: string;
  contact_id: string | null;
  data: Record<string, unknown>;
  submitted_at: string;
  ip_address: string | null;
}

const FIELD_TYPES = [
  { value: "text",     label: "Short Text" },
  { value: "textarea", label: "Long Text" },
  { value: "email",    label: "Email" },
  { value: "phone",    label: "Phone" },
  { value: "number",   label: "Number" },
  { value: "select",   label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" },
  { value: "radio",    label: "Radio" },
  { value: "date",     label: "Date" },
];

function newField(): FieldDef {
  return { id: crypto.randomUUID(), type: "text", label: "", placeholder: "", required: false };
}

const DEFAULT_SUCCESS_MESSAGE = "Thank you! We'll be in touch.";

const formMetadataSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Form name is required")
    .max(255, "Form name must be 255 characters or less"),
  description: z
    .string()
    .max(2000, "Description must be 2000 characters or less")
    .optional(),
  success_message: z
    .string()
    .max(500, "Success message must be 500 characters or less")
    .optional(),
  submit_button_text: z
    .string()
    .max(100, "Button text must be 100 characters or less")
    .optional(),
});

type FormMetadata = z.infer<typeof formMetadataSchema>;

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Form | null>(null);
  const [submissionsForm, setSubmissionsForm] = useState<Form | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form builder state — dynamic field definitions stay plain state; the
  // top-level metadata (name, description, etc.) is validated via react-hook-form.
  const [fields, setFields] = useState<FieldDef[]>([newField()]);
  const [expandedField, setExpandedField] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormMetadata>({
    resolver: zodResolver(formMetadataSchema),
    defaultValues: {
      name: "",
      description: "",
      success_message: DEFAULT_SUCCESS_MESSAGE,
      submit_button_text: "Submit",
    },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/forms?limit=100");
      setForms(res.data.data ?? []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load forms",
        description: getErrorMessage(err),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    reset({
      name: "",
      description: "",
      success_message: DEFAULT_SUCCESS_MESSAGE,
      submit_button_text: "Submit",
    });
    setFields([newField()]);
    setExpandedField(null);
    setShowModal(true);
  }

  function openEdit(f: Form) {
    setEditing(f);
    reset({
      name: f.name,
      description: f.description ?? "",
      success_message: f.success_message,
      submit_button_text: f.submit_button_text,
    });
    setFields(f.fields.length ? f.fields : [newField()]);
    setExpandedField(null);
    setShowModal(true);
  }

  async function onSubmit(data: FormMetadata) {
    setSaving(true);
    const payload = {
      name: data.name.trim(),
      description: data.description?.trim() || null,
      success_message: data.success_message?.trim() || DEFAULT_SUCCESS_MESSAGE,
      submit_button_text: data.submit_button_text?.trim() || "Submit",
      fields,
    };
    try {
      if (editing) {
        await apiClient.patch(`/api/v1/forms/${editing.id}`, payload);
      } else {
        await apiClient.post("/api/v1/forms", payload);
      }
      setShowModal(false);
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: editing ? "Failed to save changes" : "Failed to create form",
        description: getErrorMessage(err),
      });
      const fieldErrors = getFieldErrors(err);
      for (const [field, message] of Object.entries(fieldErrors)) {
        setError(field as keyof FormMetadata, { message });
      }
    }
    setSaving(false);
  }

  async function deleteForm(id: string) {
    if (!confirm("Delete this form?")) return;
    try {
      await apiClient.delete(`/api/v1/forms/${id}`);
      setForms((p) => p.filter((f) => f.id !== id));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to delete form",
        description: getErrorMessage(err),
      });
    }
  }

  async function loadSubmissions(f: Form) {
    setSubmissionsForm(f);
    setSubLoading(true);
    setSubmissions([]);
    try {
      const res = await apiClient.get(`/api/v1/forms/${f.id}/submissions?limit=100`);
      setSubmissions(res.data.data ?? []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load submissions",
        description: getErrorMessage(err),
      });
    }
    setSubLoading(false);
  }

  function copyEmbedCode(f: Form) {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    const code = `<form action="${apiBase}/api/public/forms/${f.public_id}/submit" method="POST">
${f.fields.map((fd) => `  <!-- ${fd.label} -->\n  <input name="${fd.id}" type="${fd.type}" placeholder="${fd.placeholder ?? fd.label}" ${fd.required ? "required" : ""} />`).join("\n")}
  <button type="submit">${f.submit_button_text}</button>
</form>`;
    navigator.clipboard.writeText(code).catch((err) => {
      toast({
        variant: "destructive",
        title: "Failed to copy embed code",
        description: getErrorMessage(err),
      });
    });
  }

  // Field builder helpers
  function updateField(id: string, patch: Partial<FieldDef>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }
  function removeField(id: string) {
    setFields((prev) => prev.filter((f) => f.id !== id));
  }
  function moveField(idx: number, dir: -1 | 1) {
    setFields((prev) => {
      const arr = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  }

  if (submissionsForm) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="sm" onClick={() => setSubmissionsForm(null)}>← Back</Button>
          <h1 className="text-xl font-semibold">{submissionsForm.name} — Submissions</h1>
        </div>
        {subLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : submissions.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">No submissions yet.</Card>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Date</th>
                    {submissionsForm.fields.map((fd) => (
                      <th key={fd.id} className="px-4 py-3 text-left font-medium">{fd.label}</th>
                    ))}
                    <th className="px-4 py-3 text-left font-medium">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((s) => (
                    <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">
                        {new Date(s.submitted_at).toLocaleString()}
                      </td>
                      {submissionsForm.fields.map((fd) => (
                        <td key={fd.id} className="px-4 py-2">{String(s.data[fd.id] ?? "")}</td>
                      ))}
                      <td className="px-4 py-2 text-muted-foreground">{s.ip_address ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Forms</h1>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> New Form
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : forms.length === 0 ? (
        <Card className="p-12 text-center">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No forms yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create your first form to collect leads and data.</p>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> New Form</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {forms.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{f.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.is_active ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                      {f.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>
                  {f.description && <p className="text-sm text-muted-foreground truncate">{f.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{f.fields.length} field{f.fields.length !== 1 ? "s" : ""}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="sm" onClick={() => loadSubmissions(f)} title="View submissions">
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => copyEmbedCode(f)} title="Copy embed code">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(f)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => deleteForm(f.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Build / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold text-lg">{editing ? "Edit Form" : "New Form"}</h2>
              <button className="inline-flex items-center justify-center" onClick={() => setShowModal(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              {/* Basic info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label>Form Name *</Label>
                  <Input {...register("name")} placeholder="e.g. Lead Capture" />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name.message}</p>
                  )}
                </div>
                <div className="col-span-2 space-y-1">
                  <Label>Description</Label>
                  <Input {...register("description")} placeholder="Optional description" />
                  {errors.description && (
                    <p className="text-sm text-destructive">{errors.description.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Success Message</Label>
                  <Input {...register("success_message")} />
                  {errors.success_message && (
                    <p className="text-sm text-destructive">{errors.success_message.message}</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>Button Text</Label>
                  <Input {...register("submit_button_text")} />
                  {errors.submit_button_text && (
                    <p className="text-sm text-destructive">{errors.submit_button_text.message}</p>
                  )}
                </div>
              </div>

              {/* Fields */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-semibold">Fields</Label>
                  <Button size="sm" variant="outline" onClick={() => { const f = newField(); setFields((p) => [...p, f]); setExpandedField(f.id); }}>
                    <Plus className="h-3 w-3 mr-1" /> Add Field
                  </Button>
                </div>
                <div className="space-y-2">
                  {fields.map((fd, idx) => (
                    <div key={fd.id} className="border rounded-lg overflow-hidden">
                      <div
                        className="flex items-center gap-2 px-3 py-2 bg-muted/40 cursor-pointer hover:bg-muted/60"
                        onClick={() => setExpandedField(expandedField === fd.id ? null : fd.id)}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="flex-1 text-sm font-medium truncate">{fd.label || `Field ${idx + 1}`}</span>
                        <span className="text-xs text-muted-foreground">{FIELD_TYPES.find((t) => t.value === fd.type)?.label}</span>
                        {fd.required && <span className="text-xs text-rose-500">*</span>}
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => moveField(idx, -1)} disabled={idx === 0} className="inline-flex items-center justify-center p-0.5 rounded hover:bg-muted disabled:opacity-30">
                            <ChevronUp className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => moveField(idx, 1)} disabled={idx === fields.length - 1} className="inline-flex items-center justify-center p-0.5 rounded hover:bg-muted disabled:opacity-30">
                            <ChevronDown className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => removeField(fd.id)} className="inline-flex items-center justify-center p-0.5 rounded hover:bg-red-100 text-destructive">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {expandedField === fd.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </div>
                      {expandedField === fd.id && (
                        <div className="p-3 grid grid-cols-2 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">Label *</Label>
                            <Input size={1} value={fd.label} onChange={(e) => updateField(fd.id, { label: e.target.value })} placeholder="Field label" className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Type</Label>
                            <select
                              value={fd.type}
                              onChange={(e) => updateField(fd.id, { type: e.target.value })}
                              className="w-full h-8 rounded-md border bg-background px-2 text-sm"
                            >
                              {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Placeholder</Label>
                            <Input size={1} value={fd.placeholder ?? ""} onChange={(e) => updateField(fd.id, { placeholder: e.target.value })} className="h-8 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Help Text</Label>
                            <Input size={1} value={fd.help_text ?? ""} onChange={(e) => updateField(fd.id, { help_text: e.target.value })} className="h-8 text-sm" />
                          </div>
                          {["select", "radio", "checkbox"].includes(fd.type) && (
                            <div className="col-span-2 space-y-1">
                              <Label className="text-xs">Options (comma-separated)</Label>
                              <Input
                                size={1}
                                value={(fd.options ?? []).join(", ")}
                                onChange={(e) => updateField(fd.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                                placeholder="Option 1, Option 2, Option 3"
                                className="h-8 text-sm"
                              />
                            </div>
                          )}
                          <div className="col-span-2 flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`req-${fd.id}`}
                              checked={fd.required}
                              onChange={(e) => updateField(fd.id, { required: e.target.checked })}
                              className="h-4 w-4"
                            />
                            <Label htmlFor={`req-${fd.id}`} className="text-xs cursor-pointer">Required field</Label>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button onClick={handleSubmit(onSubmit)} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editing ? "Save Changes" : "Create Form"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
