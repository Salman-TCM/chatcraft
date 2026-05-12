"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Globe,
  Link2,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { apiClient } from "@/lib/api";

type DocStatus = "pending" | "processing" | "done" | "failed";
type DocType = "pdf" | "docx" | "txt" | "csv" | "url" | "text";

interface KBDocument {
  id: string;
  name: string;
  type: DocType;
  status: DocStatus;
  chunk_count: number | null;
  created_at: string;
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

export default function KnowledgePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [docs, setDocs] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  // file upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // URL ingest
  const [urlValue, setUrlValue] = useState("");
  const [urlName, setUrlName] = useState("");
  const [ingestingUrl, setIngestingUrl] = useState(false);

  // Text ingest
  const [textName, setTextName] = useState("");
  const [textContent, setTextContent] = useState("");
  const [ingestingText, setIngestingText] = useState(false);

  // Test search
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);

  useEffect(() => {
    loadDocs();
  }, [id]);

  async function loadDocs() {
    try {
      const { data } = await apiClient.get(`/api/kb/${id}/documents`);
      setDocs(data.data);
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", files[0]);
    try {
      const { data } = await apiClient.post(`/api/kb/${id}/upload`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setDocs((prev) => [data.data, ...prev]);
      setAddMode(null);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleIngestUrl() {
    if (!urlValue.trim()) return;
    setIngestingUrl(true);
    try {
      const { data } = await apiClient.post(`/api/kb/${id}/ingest-url`, {
        url: urlValue.trim(),
        name: urlName.trim() || undefined,
      });
      setDocs((prev) => [data.data, ...prev]);
      setUrlValue("");
      setUrlName("");
      setAddMode(null);
    } finally {
      setIngestingUrl(false);
    }
  }

  async function handleIngestText() {
    if (!textName.trim() || !textContent.trim()) return;
    setIngestingText(true);
    try {
      const { data } = await apiClient.post(`/api/kb/${id}/ingest-text`, {
        name: textName.trim(),
        content: textContent.trim(),
      });
      setDocs((prev) => [data.data, ...prev]);
      setTextName("");
      setTextContent("");
      setAddMode(null);
    } finally {
      setIngestingText(false);
    }
  }

  async function handleDelete(docId: string) {
    if (!confirm("Delete this document? Its embeddings will be removed.")) return;
    setDeleting(docId);
    try {
      await apiClient.delete(`/api/kb/${id}/documents/${docId}`);
      setDocs((prev) => prev.filter((d) => d.id !== docId));
    } finally {
      setDeleting(null);
    }
  }

  async function handleSearch() {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const { data } = await apiClient.post(`/api/kb/${id}/search`, {
        query: searchQuery.trim(),
        top_k: 5,
        threshold: 0.3,
      });
      setSearchResults(data.data);
    } finally {
      setSearching(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={() => router.push(`/dashboard/chatbots/${id}`)}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Knowledge Base</h1>
          <p className="text-xs text-muted-foreground">
            {docs.length} document{docs.length !== 1 ? "s" : ""}
            {docs.some((d) => d.status === "done") &&
              ` · ${docs.filter((d) => d.status === "done").reduce((a, d) => a + (d.chunk_count ?? 0), 0)} chunks indexed`}
          </p>
        </div>
      </div>

      {/* Add source buttons */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={addMode === "file" ? "default" : "outline"}
          className="h-8 gap-1.5 text-xs"
          onClick={() => setAddMode(addMode === "file" ? null : "file")}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload File
        </Button>
        <Button
          size="sm"
          variant={addMode === "url" ? "default" : "outline"}
          className="h-8 gap-1.5 text-xs"
          onClick={() => setAddMode(addMode === "url" ? null : "url")}
        >
          <Globe className="h-3.5 w-3.5" />
          Add URL
        </Button>
        <Button
          size="sm"
          variant={addMode === "text" ? "default" : "outline"}
          className="h-8 gap-1.5 text-xs"
          onClick={() => setAddMode(addMode === "text" ? null : "text")}
        >
          <FileText className="h-3.5 w-3.5" />
          Paste Text
        </Button>
      </div>

      {/* File upload panel */}
      {addMode === "file" && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Upload Document</p>
            <button onClick={() => setAddMode(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <p className="text-xs text-muted-foreground">PDF, DOCX, TXT, CSV · max 25 MB</p>
          <div
            className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors cursor-pointer ${
              dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Drop file here or <span className="text-primary underline">browse</span></p>
              </>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.docx,.txt,.csv"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </Card>
      )}

      {/* URL ingest panel */}
      {addMode === "url" && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Add URL</p>
            <button onClick={() => setAddMode(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">URL</Label>
              <Input
                autoFocus
                placeholder="https://example.com/page"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIngestUrl()}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">
                Name <span className="opacity-60">(optional)</span>
              </Label>
              <Input
                placeholder="e.g. Support Page"
                value={urlName}
                onChange={(e) => setUrlName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleIngestUrl()}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={ingestingUrl || !urlValue.trim()}
              onClick={handleIngestUrl}
            >
              {ingestingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add URL"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddMode(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {/* Text ingest panel */}
      {addMode === "text" && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Paste Text</p>
            <button onClick={() => setAddMode(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
          </div>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Name</Label>
              <Input
                autoFocus
                placeholder="e.g. FAQ Document"
                value={textName}
                onChange={(e) => setTextName(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Content</Label>
              <textarea
                placeholder="Paste your text here…"
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                rows={8}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground"
              />
              <p className="text-right text-xs text-muted-foreground mt-0.5">{textContent.length} chars</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={ingestingText || !textName.trim() || !textContent.trim()}
              onClick={handleIngestText}
            >
              {ingestingText ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add Text"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setAddMode(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      <Separator />

      {/* Document list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-14 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No documents yet</p>
          <p className="text-xs text-muted-foreground mt-1">Upload a file, add a URL, or paste text to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <Card key={doc.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <DocTypeIcon type={doc.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{doc.name}</p>
                    <StatusBadge status={doc.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <p className="text-xs text-muted-foreground">
                      {doc.chunk_count != null ? `${doc.chunk_count} chunks` : "—"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </p>
                    {doc.source_url && (
                      <a
                        href={doc.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline flex items-center gap-0.5"
                      >
                        <Link2 className="h-3 w-3" />
                        Source
                      </a>
                    )}
                  </div>
                  {doc.error_message && (
                    <p className="text-xs text-destructive mt-1">{doc.error_message}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    className="rounded p-1.5 hover:bg-muted text-muted-foreground"
                    onClick={() => setExpandedDoc(expandedDoc === doc.id ? null : doc.id)}
                    title="View chunks"
                  >
                    {expandedDoc === doc.id ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    className="rounded p-1.5 hover:bg-muted text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(doc.id)}
                    disabled={deleting === doc.id}
                  >
                    {deleting === doc.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {expandedDoc === doc.id && <DocChunks chatbotId={id} docId={doc.id} />}
            </Card>
          ))}
        </div>
      )}

      <Separator />

      {/* Test search */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Test Search</p>
        <p className="text-xs text-muted-foreground">
          Query the vector store to preview which chunks the AI will retrieve for a given question.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="Ask something your chatbot should know…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          <Button size="sm" disabled={searching || !searchQuery.trim()} onClick={handleSearch} className="shrink-0">
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {searchResults !== null && (
          <div className="space-y-2">
            {searchResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No relevant chunks found above threshold.</p>
            ) : (
              searchResults.map((r) => (
                <Card key={r.chunk_id} className="p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">{r.document_name}</p>
                    <span className="text-xs font-mono text-muted-foreground">{(r.similarity * 100).toFixed(1)}%</span>
                  </div>
                  <p className="text-sm leading-relaxed line-clamp-4">{r.content}</p>
                </Card>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function DocChunks({ chatbotId, docId }: { chatbotId: string; docId: string }) {
  const [chunks, setChunks] = useState<{ id: string; content: string; chunk_index: number }[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiClient
      .get(`/api/kb/${chatbotId}/documents/${docId}`)
      .then(({ data }) => setChunks(data.data.chunks ?? []))
      .finally(() => setLoading(false));
  }, [chatbotId, docId]);

  if (loading) return <div className="mt-3 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>;
  if (!chunks?.length) return <p className="mt-3 text-xs text-muted-foreground text-center">No chunks — document may still be processing.</p>;

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs text-muted-foreground">{chunks.length} chunks</p>
      <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
        {chunks.map((c) => (
          <div key={c.id} className="rounded-md bg-muted/50 px-3 py-2">
            <p className="text-[10px] text-muted-foreground mb-0.5">Chunk {c.chunk_index + 1}</p>
            <p className="text-xs leading-relaxed line-clamp-3">{c.content}</p>
          </div>
        ))}
      </div>
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
  const map: Record<DocStatus, { label: string; className: string; icon: React.ReactNode }> = {
    done: {
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
    failed: {
      label: "Failed",
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      icon: <AlertCircle className="h-3 w-3" />,
    },
  };
  const { label, className, icon } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`}>
      {icon}
      {label}
    </span>
  );
}
