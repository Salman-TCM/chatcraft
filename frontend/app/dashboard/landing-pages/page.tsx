"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutTemplate, Plus, Loader2, Pencil, Trash2, Globe, QrCode,
  Eye, EyeOff, X, Sparkles, Download, Code, Palette, BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface LandingPage {
  id: string;
  title: string;
  name: string;
  slug: string;
  short_id: string;
  description: string | null;
  theme: "light" | "dark";
  primary_color: string;
  is_published: boolean;
  chatbot_id: string | null;
  seo_meta: Record<string, string>;
  scan_count: number;
  html_content?: string;
  created_at: string;
  updated_at: string;
}

type EditorTab = "code" | "preview" | "seo";

interface AttributionData {
  total_visits: number;
  scan_count: number;
  top_sources: { key: string; count: number }[];
  top_mediums: { key: string; count: number }[];
  top_campaigns: { key: string; count: number }[];
  top_refs: { key: string; count: number }[];
}

export default function LandingPagesPage() {
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  const [editing, setEditing] = useState<LandingPage | null>(null);
  const [editorTab, setEditorTab] = useState<EditorTab>("code");
  const [htmlContent, setHtmlContent] = useState("");
  const [pageTitle, setPageTitle] = useState("");
  const [pageDesc, setPageDesc] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#6366f1");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDesc, setSeoDesc] = useState("");
  const [ogImage, setOgImage] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [qrPage, setQrPage] = useState<LandingPage | null>(null);
  const [qrFill, setQrFill] = useState("#000000");
  const [qrBack, setQrBack] = useState("#ffffff");
  const [qrBlobUrl, setQrBlobUrl] = useState<string | null>(null);
  const [attrPage, setAttrPage] = useState<LandingPage | null>(null);
  const [attrData, setAttrData] = useState<AttributionData | null>(null);
  const [attrLoading, setAttrLoading] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/landing-pages?limit=100");
      setPages(res.data.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!qrPage) return;
    const t = setTimeout(() => refreshQrPreview(qrPage, qrFill, qrBack), 300);
    return () => clearTimeout(t);
  }, [qrFill, qrBack, qrPage]);

  async function openEditor(p: LandingPage) {
    try {
      const res = await apiClient.get(`/api/v1/landing-pages/${p.id}`);
      const full: LandingPage = res.data.data;
      setEditing(full);
      setHtmlContent(full.html_content ?? "");
      setPageTitle(full.title);
      setPageDesc(full.description ?? "");
      setPrimaryColor(full.primary_color);
      setTheme(full.theme);
      setSeoTitle(full.seo_meta?.title ?? "");
      setSeoDesc(full.seo_meta?.description ?? "");
      setOgImage(full.seo_meta?.og_image ?? "");
      setEditorTab("code");
    } catch {}
  }

  async function savePage() {
    if (!editing) return;
    setSaving(true);
    try {
      await apiClient.patch(`/api/v1/landing-pages/${editing.id}`, {
        title: pageTitle,
        description: pageDesc || null,
        html_content: htmlContent,
        theme,
        primary_color: primaryColor,
        seo_meta: {
          title: seoTitle || undefined,
          description: seoDesc || undefined,
          og_image: ogImage || undefined,
        },
      });
      setEditing(null);
      await load();
    } catch {}
    setSaving(false);
  }

  async function createPage() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await apiClient.post("/api/v1/landing-pages", {
        name: newName.trim(),
        description: newDesc || null,
      });
      setShowCreate(false);
      setNewName("");
      setNewDesc("");
      await load();
    } catch {}
    setCreating(false);
  }

  async function deletePage(id: string) {
    if (!confirm("Delete this landing page?")) return;
    try {
      await apiClient.delete(`/api/v1/landing-pages/${id}`);
      setPages((p) => p.filter((pg) => pg.id !== id));
    } catch {}
  }

  async function togglePublish(p: LandingPage) {
    setPublishing(p.id);
    try {
      const res = await apiClient.post(`/api/v1/landing-pages/${p.id}/publish`);
      setPages((prev) => prev.map((pg) => pg.id === p.id ? { ...pg, is_published: res.data.data.is_published } : pg));
    } catch {}
    setPublishing(null);
  }

  async function openQrModal(p: LandingPage) {
    setQrPage(p);
    setQrFill("#000000");
    setQrBack("#ffffff");
    await refreshQrPreview(p, "#000000", "#ffffff");
  }

  async function refreshQrPreview(p: LandingPage, fill: string, back: string) {
    try {
      const res = await apiClient.get(
        `/api/v1/landing-pages/${p.id}/qr?fmt=png&size=300&fill=${encodeURIComponent(fill)}&back=${encodeURIComponent(back)}`,
        { responseType: "blob" }
      );
      setQrBlobUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(res.data); });
    } catch {}
  }

  async function downloadQr(fmt: "png" | "svg") {
    if (!qrPage) return;
    try {
      const fill = encodeURIComponent(qrFill);
      const back = encodeURIComponent(qrBack);
      const res = await apiClient.get(
        `/api/v1/landing-pages/${qrPage.id}/qr?fmt=${fmt}&size=600&fill=${fill}&back=${back}`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${qrPage.slug}-qr.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }

  async function openAttrModal(p: LandingPage) {
    setAttrPage(p);
    setAttrData(null);
    setAttrLoading(true);
    try {
      const res = await apiClient.get(`/api/v1/landing-pages/${p.id}/attribution`);
      setAttrData(res.data.data);
    } catch {}
    setAttrLoading(false);
  }

  async function generateAi() {
    if (!editing || !aiPrompt.trim()) return;
    setAiGenerating(true);
    try {
      const res = await apiClient.post(`/api/v1/landing-pages/${editing.id}/ai`, { prompt: aiPrompt });
      setHtmlContent((prev) => prev + "\n" + res.data.data.html);
      setAiPrompt("");
    } catch {}
    setAiGenerating(false);
  }

  function updatePreview() {
    if (!iframeRef.current) return;
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "";
    const darkStyle = theme === "dark" ? "background:#0f172a;color:#f1f5f9;" : "background:#fff;color:#0f172a;";
    iframeRef.current.srcdoc = `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"/>
<style>*,*::before,*::after{box-sizing:border-box;}:root{--primary:${primaryColor};}body{font-family:sans-serif;margin:0;${darkStyle}}a{color:var(--primary);}</style>
</head><body>${htmlContent}</body></html>`;
  }

  useEffect(() => {
    if (editorTab === "preview") updatePreview();
  }, [editorTab, htmlContent, primaryColor, theme]);

  const publicBase = typeof window !== "undefined" ? window.location.origin : "";

  if (editing) {
    return (
      <div className="flex flex-col h-screen">
        {/* Editor header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setEditing(null)}>← Back</Button>
            <div>
              <p className="font-semibold text-sm">{editing.name}</p>
              {editing.is_published && (
                <a href={`${publicBase}/p/${editing.slug}`} target="_blank" rel="noreferrer"
                  className="text-xs text-primary flex items-center gap-1">
                  /p/{editing.slug} <Eye className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Tab switcher */}
            <div className="flex rounded-lg border overflow-hidden text-sm">
              {(["code", "preview", "seo"] as EditorTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setEditorTab(t)}
                  className={`px-3 py-1.5 capitalize transition-colors ${editorTab === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                >
                  {t === "code" ? <><Code className="h-3.5 w-3.5 inline mr-1" />HTML</> : t === "preview" ? <><Eye className="h-3.5 w-3.5 inline mr-1" />Preview</> : <><Palette className="h-3.5 w-3.5 inline mr-1" />SEO</>}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={savePage} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              Save
            </Button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: code / preview / seo */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {editorTab === "code" && (
              <textarea
                className="flex-1 w-full p-4 font-mono text-xs resize-none bg-zinc-950 text-zinc-100 outline-none"
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                spellCheck={false}
              />
            )}
            {editorTab === "preview" && (
              <iframe
                ref={iframeRef}
                className="flex-1 w-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin"
                title="Page preview"
              />
            )}
            {editorTab === "seo" && (
              <div className="flex-1 overflow-y-auto p-6 space-y-4 max-w-xl">
                <h3 className="font-semibold">SEO & Metadata</h3>
                <div className="space-y-1">
                  <Label>Page Title</Label>
                  <Input value={pageTitle} onChange={(e) => setPageTitle(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Page Description</Label>
                  <Input value={pageDesc} onChange={(e) => setPageDesc(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>SEO Title (overrides page title)</Label>
                  <Input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} placeholder={pageTitle} />
                </div>
                <div className="space-y-1">
                  <Label>SEO Description</Label>
                  <Input value={seoDesc} onChange={(e) => setSeoDesc(e.target.value)} placeholder={pageDesc} />
                </div>
                <div className="space-y-1">
                  <Label>Social Sharing Image URL (OG Image)</Label>
                  <Input value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="https://example.com/image.png (recommended: 1200×630px)" />
                </div>
                {/* Social sharing preview card */}
                <div className="space-y-2">
                  <Label>Social Sharing Preview</Label>
                  <div className="rounded-xl border overflow-hidden bg-muted/40 max-w-sm shadow-sm">
                    {ogImage ? (
                      <img src={ogImage} alt="OG preview" className="w-full h-40 object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    ) : (
                      <div className="w-full h-40 bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center text-xs text-muted-foreground">No image set</div>
                    )}
                    <div className="p-3 space-y-0.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{typeof window !== "undefined" ? window.location.hostname : "yoursite.com"}</p>
                      <p className="text-sm font-semibold line-clamp-1">{seoTitle || pageTitle || "Page title"}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">{seoDesc || pageDesc || "Page description will appear here."}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">This is how your page will appear when shared on Facebook, LinkedIn, Slack, and similar platforms.</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label>Theme</Label>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as "light" | "dark")}
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="light">Light</option>
                      <option value="dark">Dark</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label>Primary Color</Label>
                    <div className="flex gap-2 items-center">
                      <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="h-9 w-14 rounded border cursor-pointer" />
                      <Input value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} className="font-mono text-sm" />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right: AI panel */}
          <div className="w-72 border-l flex flex-col bg-background shrink-0">
            <div className="p-3 border-b">
              <p className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-purple-500" /> AI Generator</p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-xs text-muted-foreground mb-2">
                Describe a section and AI will generate HTML to append to your page.
              </p>
              <textarea
                className="w-full h-28 p-2 text-sm rounded-md border bg-background resize-none"
                placeholder="e.g. A hero section with a headline, subtext, and a CTA button"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
              />
              <Button
                size="sm"
                className="w-full mt-2"
                onClick={generateAi}
                disabled={aiGenerating || !aiPrompt.trim()}
              >
                {aiGenerating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Sparkles className="h-4 w-4 mr-1" />}
                Generate
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <LayoutTemplate className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Landing Pages</h1>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Page
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : pages.length === 0 ? (
        <Card className="p-12 text-center">
          <LayoutTemplate className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No landing pages yet</p>
          <p className="text-sm text-muted-foreground mb-4">Create a page with a QR code or shareable link.</p>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> New Page</Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pages.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{p.name}</h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        p.is_published ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.is_published ? "Published" : "Draft"}
                    </span>
                  </div>
                  {p.description && <p className="text-sm text-muted-foreground truncate">{p.description}</p>}
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span>/p/{p.slug}</span>
                    {p.is_published && (
                      <a
                        href={`${publicBase}/p/${p.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline flex items-center gap-0.5"
                      >
                        Open <Eye className="h-3 w-3 ml-0.5" />
                      </a>
                    )}
                    {p.scan_count > 0 && <span>{p.scan_count} QR scan{p.scan_count !== 1 ? "s" : ""}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => togglePublish(p)}
                    disabled={publishing === p.id}
                    title={p.is_published ? "Unpublish" : "Publish"}
                  >
                    {publishing === p.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : p.is_published
                        ? <EyeOff className="h-4 w-4" />
                        : <Globe className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openQrModal(p)} title="QR code">
                    <QrCode className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openAttrModal(p)} title="Attribution">
                    <BarChart2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openEditor(p)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deletePage(p.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">New Landing Page</h2>
              <button onClick={() => setShowCreate(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <Label>Page Name *</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Summer Campaign"
                  onKeyDown={(e) => e.key === "Enter" && createPage()}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label>Description</Label>
                <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Optional description" />
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button onClick={createPage} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                Create Page
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* QR code modal */}
      {qrPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <QrCode className="h-4 w-4" /> QR Code
              </h2>
              <button onClick={() => { setQrPage(null); if (qrBlobUrl) URL.revokeObjectURL(qrBlobUrl); setQrBlobUrl(null); }}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="flex justify-center bg-muted rounded-lg p-4">
                {qrBlobUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrBlobUrl} alt="QR code" width={200} height={200} className="rounded" />
                ) : (
                  <div className="w-[200px] h-[200px] flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Foreground color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={qrFill} onChange={(e) => setQrFill(e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
                    <span className="text-xs font-mono text-muted-foreground">{qrFill}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Background color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={qrBack} onChange={(e) => setQrBack(e.target.value)} className="h-8 w-10 rounded border cursor-pointer" />
                    <span className="text-xs font-mono text-muted-foreground">{qrBack}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                Encodes: {typeof window !== "undefined" ? window.location.origin : ""}/p/{qrPage.slug}
              </p>
              <div className="flex gap-2">
                <Button className="flex-1 gap-1.5" onClick={() => downloadQr("png")}>
                  <Download className="h-3.5 w-3.5" /> PNG
                </Button>
                <Button variant="outline" className="flex-1 gap-1.5" onClick={() => downloadQr("svg")}>
                  <Download className="h-3.5 w-3.5" /> SVG
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Attribution modal */}
      {attrPage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="relative w-full max-w-md rounded-xl border bg-background p-6 shadow-xl">
            <button
              onClick={() => setAttrPage(null)}
              className="absolute right-4 top-4 rounded-full p-1 hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <BarChart2 className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Attribution — {attrPage.name}</h2>
            </div>
            {attrLoading && (
              <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            )}
            {!attrLoading && attrData && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold">{attrData.total_visits}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Total visits</p>
                  </div>
                  <div className="rounded-lg border bg-muted/30 p-3 text-center">
                    <p className="text-2xl font-bold">{attrData.scan_count}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">QR scans</p>
                  </div>
                </div>
                {attrData.top_sources.length > 0 && (
                  <AttrTable title="Top Sources" rows={attrData.top_sources} />
                )}
                {attrData.top_mediums.length > 0 && (
                  <AttrTable title="Top Mediums" rows={attrData.top_mediums} />
                )}
                {attrData.top_campaigns.length > 0 && (
                  <AttrTable title="Top Campaigns" rows={attrData.top_campaigns} />
                )}
                {attrData.top_refs.length > 0 && (
                  <AttrTable title="Top Refs" rows={attrData.top_refs} />
                )}
                {attrData.total_visits === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No visit data yet. Share your landing page to start tracking.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function AttrTable({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  const max = rows[0]?.count ?? 1;
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">{title}</p>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center gap-2">
            <span className="text-xs w-32 truncate font-medium">{r.key}</span>
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{r.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
