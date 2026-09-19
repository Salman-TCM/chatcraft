"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import {
  FileText, Globe, Link2, Loader2, Search, Trash2, Upload, X,
  CheckCircle2, AlertCircle, Clock, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/errors";

type DocStatus = "pending" | "processing" | "ready" | "error";
type DocType = "pdf" | "docx" | "txt" | "url" | "text";

interface KBDocument {
  id: string;
  name: string;
  type: DocType;
  status: DocStatus;
  chunk_count: number | null;
  source_url?: string | null;
  error_message?: string | null;
}

interface SearchResult {
  chunk_id: string;
  document_id: string;
  document_name: string;
  content: string;
  similarity: number;
}

type AddMode = "file" | "url" | "text" | null;

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;

/**
 * Direct file/URL/text knowledge base management for a single agent.
 * Talks to /api/agent-kb/{agentId} — scoped entirely to the agent, with no
 * dependency on any chatbot. Shared between the agent builder page and the
 * quick-edit config modal so both surfaces offer the same capability.
 */
export function AgentKnowledgeManager({
  agentId,
  showTestSearch = true,
}: {
  agentId: string;
  showTestSearch?: boolean;
}) {
  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [editingDoc, setEditingDoc] = useState<KBDocument | null>(null);
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [loadingEditContent, setLoadingEditContent] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const [urlValue, setUrlValue] = useState("");
  const [urlName, setUrlName] = useState("");
  const [ingestingUrl, setIngestingUrl] = useState(false);

  const [textName, setTextName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [ingestingText, setIngestingText] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);

  const loadDocs = useCallback(async () => {
    try {
      const { data } = await apiClient.get(`/api/agent-kb/${agentId}/documents`);
      setDocs(data.data);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load documents",
        description: getErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    const hasInFlight = docs.some((d) => d.status === "pending" || d.status === "processing");
    if (!hasInFlight) return;
    const timer = setInterval(loadDocs, 3000);
    return () => clearInterval(timer);
  }, [docs, loadDocs]);

  async function handleFileUpload(files: FileList | null) {
    if (!files?.length) return;
    const file = files[0];
    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `${file.name} is ${(file.size / 1024 / 1024).toFixed(1)} MB — max 25 MB.`,
      });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      const { data } = await apiClient.post(`/api/agent-kb/${agentId}/upload`, form);
      setDocs((prev) => [data.data, ...prev]);
      setAddMode(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to upload file",
        description: getErrorMessage(err),
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleIngestUrl() {
    if (!urlValue.trim()) return;
    setIngestingUrl(true);
    try {
      const { data } = await apiClient.post(`/api/agent-kb/${agentId}/ingest-url`, {
        url: urlValue.trim(),
        name: urlName.trim() || undefined,
      });
      setDocs((prev) => [data.data, ...prev]);
      setUrlValue("");
      setUrlName("");
      setAddMode(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add URL",
        description: getErrorMessage(err),
      });
    } finally {
      setIngestingUrl(false);
    }
  }

  async function handleIngestText() {
    if (!textName.trim() || !textContent.trim()) return;
    setIngestingText(true);
    try {
      const { data } = await apiClient.post(`/api/agent-kb/${agentId}/ingest-text`, {
        name: textName.trim(),
        content: textContent.trim(),
      });
      setDocs((prev) => [data.data, ...prev]);
      setTextName("");
      setTextContent("");
      setAddMode(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to add text",
        description: getErrorMessage(err),
      });
    } finally {
      setIngestingText(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Delete this document? Its embeddings will be removed.")) return;
    setDeleting(docId);
    try {
      await apiClient.delete(`/api/agent-kb/${agentId}/documents/${docId}`);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to delete document",
        description: getErrorMessage(err),
      });
    } finally {
      setDeleting(null);
    }
  }

  async function openEdit(doc: KBDocument) {
    setEditingDoc(doc);
    setEditName(doc.name);
    setEditContent("");
    setLoadingEditContent(true);
    try {
      const { data } = await apiClient.get(
        `/api/agent-kb/${agentId}/documents/${doc.id}/content`
      );
      setEditContent(data.data.content);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load document content",
        description: getErrorMessage(err),
      });
      setEditingDoc(null);
    } finally {
      setLoadingEditContent(false);
    }
  }

  async function handleSaveEdit() {
    if (!editingDoc || !editContent.trim()) return;
    setSavingEdit(true);
    try {
      const { data } = await apiClient.patch(
        `/api/agent-kb/${agentId}/documents/${editingDoc.id}`,
        { content: editContent.trim(), name: editName.trim() || undefined }
      );
      setDocs((prev) => prev.map((d) => (d.id === editingDoc.id ? data.data : d)));
      setEditingDoc(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update document",
        description: getErrorMessage(err),
      });
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const { data } = await apiClient.post(`/api/agent-kb/${agentId}/search`, {
        query: searchQuery.trim(),
        top_k: 5,
        threshold: 0.3,
      });
      setSearchResults(data.data);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Search failed",
        description: getErrorMessage(err),
      });
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Documents</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Upload a file, add a URL, or paste text — this agent searches only its own
          documents, independent of any chatbot.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={addMode === "file" ? "default" : "outline"}
          className="h-7 gap-1.5 text-xs"
          onClick={() => setAddMode(addMode === "file" ? null : "file")}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload File
        </Button>
        <Button
          size="sm"
          variant={addMode === "url" ? "default" : "outline"}
          className="h-7 gap-1.5 text-xs"
          onClick={() => setAddMode(addMode === "url" ? null : "url")}
        >
          <Globe className="h-3.5 w-3.5" />
          Add URL
        </Button>
        <Button
          size="sm"
          variant={addMode === "text" ? "default" : "outline"}
          className="h-7 gap-1.5 text-xs"
          onClick={() => setAddMode(addMode === "text" ? null : "text")}
        >
          <FileText className="h-3.5 w-3.5" />
          Paste Text
        </Button>
      </div>

      {addMode === "file" && (
        <Card className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Upload Document</p>
            <button className="inline-flex items-center justify-center" onClick={() => setAddMode(null)}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">PDF, DOCX, TXT · max 25 MB</p>
          <div
            className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-5 transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              handleFileUpload(e.dataTransfer.files);
            }}
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Drop file here or <span className="text-primary underline">browse</span>
                </p>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </Card>
      )}

      {addMode === "url" && (
        <Card className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Add URL</p>
            <button className="inline-flex items-center justify-center" onClick={() => setAddMode(null)}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">URL</Label>
              <Input
                autoFocus
                placeholder="https://example.com/page"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIngestUrl()}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">
                Name <span className="opacity-60">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. Support Page"
                value={urlName}
                onChange={(e) => setUrlName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIngestUrl()}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" disabled={ingestingUrl || !urlValue.trim()} onClick={handleIngestUrl}>
              {ingestingUrl ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add URL"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddMode(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {addMode === "text" && (
        <Card className="p-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium">Paste Text</p>
            <button className="inline-flex items-center justify-center" onClick={() => setAddMode(null)}>
              <X className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Name</Label>
              <Input
                autoFocus
                placeholder="e.g. FAQ Document"
                value={textName}
                onChange={(e) => setTextName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Content</Label>
              <textarea
                placeholder="Paste your text here…"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={5}
                className="w-full rounded-md border bg-background px-3 py-2 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
              <p className="text-right text-[11px] text-muted-foreground mt-0.5">
                {textContent.length} chars
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={ingestingText || !textName.trim() || !textContent.trim()}
              onClick={handleIngestText}
            >
              {ingestingText ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add Text"}
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddMode(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-10 text-center">
          <FileText className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-xs font-medium">No documents yet</p>
          <p className="text-[11px] text-muted-foreground mt-1 max-w-[240px]">
            Upload a file, add a URL, or paste text to give this agent something to reason over.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card key={doc.id} className="p-3">
              <div className="flex items-start gap-2.5">
                <div className="mt-0.5 shrink-0">
                  <DocTypeIcon type={doc.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium truncate">{doc.name}</p>
                    <StatusBadge status={doc.status} />
                  </div>
                  <div className="flex items-center gap-2.5 mt-0.5">
                    <p className="text-[11px] text-muted-foreground">
                      {doc.chunk_count != null ? `${doc.chunk_count} chunks` : "—"}
                    </p>
                    {doc.source_url && (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                      >
                        <Link2 className="h-3 w-3" />
                        Source
                      </a>
                    )}
                  </div>
                  {doc.error_message && (
                    <p className="text-[11px] text-destructive mt-1">{doc.error_message}</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    className="rounded p-1.5 hover:bg-muted text-muted-foreground hover:text-primary"
                    onClick={() => openEdit(doc)}
                    disabled={doc.status === "processing"}
                    title="Edit content"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="rounded p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                    title="Delete"
                  >
                    {deleting === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showTestSearch && (
        <div className="space-y-2.5 border-t pt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Test Search
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="Ask something your agent should know…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="h-8 text-sm"
            />
            <Button
              size="sm"
              disabled={searching || !searchQuery.trim()}
              onClick={handleSearch}
              className="h-8 shrink-0"
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
          </div>

          {searchResults !== null && (
            <div className="space-y-2">
              {searchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-3">
                  No relevant chunks found above threshold.
                </p>
              ) : (
                searchResults.map((r) => (
                  <Card key={r.chunk_id} className="p-2.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-medium text-muted-foreground">{r.document_name}</p>
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {(r.similarity * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed line-clamp-3">{r.content}</p>
                  </Card>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <Dialog open={editingDoc !== null} onOpenChange={(open) => !open && setEditingDoc(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Name</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground mb-1 block">Content</Label>
              {loadingEditContent ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={14}
                  className="w-full rounded-md border bg-background px-3 py-2 text-xs resize-y focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Saving replaces the document's full content and re-indexes it — the
                agent's answers reflect the update once processing finishes.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setEditingDoc(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={savingEdit || loadingEditContent || !editContent.trim()}
              onClick={handleSaveEdit}
            >
              {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save & Re-index"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocTypeIcon({ type }: { type: DocType }) {
  const cls = "h-4 w-4";
  if (type === "url") return <Globe className={`${cls} text-blue-500`} />;
  if (type === "text") return <FileText className={`${cls} text-purple-500`} />;
  return <FileText className={`${cls} text-orange-500`} />;
}

function StatusBadge({ status }: { status: DocStatus }) {
  const map: Record<
    DocStatus,
    { label: string; className: string; icon: React.ReactNode }
  > = {
    ready: {
      label: "Indexed",
      className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    processing: {
      label: "Processing",
      className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    pending: {
      label: "Pending",
      className: "bg-muted text-muted-foreground",
      icon: <Clock className="h-3 w-3" />,
    },
    error: {
      label: "Failed",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const { label, className, icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`}
    >
      {icon}
      {label}
    </span>
  );
}
