"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Share2, Plus, Loader2, Trash2, X, Sparkles, Image as ImageIcon,
  Calendar, CheckCircle2, AlertCircle, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface SocialAccount {
  id: string;
  platform: string;
  name: string;
  avatar_url: string | null;
  page_id: string | null;
}

interface SocialPost {
  id: string;
  account_ids: string[];
  content: string;
  image_url: string | null;
  status: string;
  scheduled_at: string | null;
  published_at: string | null;
  platform_post_ids: Record<string, string>;
  error_log: string | null;
  created_at: string;
}

const PLATFORM_COLORS: Record<string, string> = {
  facebook:  "bg-blue-100 text-blue-700",
  instagram: "bg-pink-100 text-pink-700",
  x:         "bg-zinc-100 text-zinc-700",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  published: <CheckCircle2 className="h-4 w-4 text-green-600" />,
  failed:    <AlertCircle className="h-4 w-4 text-red-500" />,
  scheduled: <Clock className="h-4 w-4 text-blue-500" />,
  draft:     <Clock className="h-4 w-4 text-muted-foreground" />,
};

export default function SocialPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  // Compose state
  const [content, setContent] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [publishNow, setPublishNow] = useState(true);
  const [generatingCaption, setGeneratingCaption] = useState(false);
  const [captionPrompt, setCaptionPrompt] = useState("");
  const [publishing, setPublishing] = useState(false);

  // Connect account state
  const [connPlatform, setConnPlatform] = useState("facebook");
  const [connName, setConnName] = useState("");
  const [connToken, setConnToken] = useState("");
  const [connAccountId, setConnAccountId] = useState("");
  const [connPageId, setConnPageId] = useState("");
  const [connPageToken, setConnPageToken] = useState("");
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, postRes] = await Promise.all([
        apiClient.get("/api/v1/social/accounts"),
        apiClient.get("/api/v1/social/posts?limit=50"),
      ]);
      setAccounts(accRes.data.data ?? []);
      setPosts(postRes.data.data ?? []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generateCaption() {
    if (!captionPrompt.trim()) return;
    setGeneratingCaption(true);
    try {
      const res = await apiClient.post("/api/v1/social/posts/generate-caption", { prompt: captionPrompt });
      setContent(res.data.data.caption);
      setCaptionPrompt("");
    } catch {}
    setGeneratingCaption(false);
  }

  async function publish() {
    if (!content.trim() || selectedAccounts.length === 0) return;
    setPublishing(true);
    try {
      await apiClient.post("/api/v1/social/posts", {
        content,
        image_url: imageUrl || null,
        account_ids: selectedAccounts,
        publish_now: publishNow,
        scheduled_at: !publishNow && scheduledAt ? scheduledAt : null,
      });
      setShowCompose(false);
      setContent(""); setImageUrl(""); setSelectedAccounts([]); setScheduledAt(""); setPublishNow(true);
      await load();
    } catch {}
    setPublishing(false);
  }

  async function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;
    try {
      await apiClient.delete(`/api/v1/social/posts/${id}`);
      setPosts((p) => p.filter((post) => post.id !== id));
    } catch {}
  }

  async function connectAccount() {
    setConnecting(true);
    try {
      await apiClient.post("/api/v1/social/accounts", {
        platform: connPlatform,
        name: connName,
        access_token: connToken,
        account_id: connAccountId,
        page_id: connPageId || null,
        page_access_token: connPageToken || null,
      });
      setShowConnect(false);
      setConnName(""); setConnToken(""); setConnAccountId(""); setConnPageId(""); setConnPageToken("");
      await load();
    } catch {}
    setConnecting(false);
  }

  async function disconnectAccount(id: string) {
    if (!confirm("Disconnect this account?")) return;
    try {
      await apiClient.delete(`/api/v1/social/accounts/${id}`);
      setAccounts((p) => p.filter((a) => a.id !== id));
    } catch {}
  }

  function toggleAccount(id: string) {
    setSelectedAccounts((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Share2 className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Social Poster</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowConnect(true)}>
            <Plus className="h-4 w-4 mr-1" /> Connect Account
          </Button>
          <Button onClick={() => setShowCompose(true)} disabled={accounts.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> New Post
          </Button>
        </div>
      </div>

      {/* Connected accounts */}
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center gap-2 bg-muted rounded-full px-3 py-1.5">
              {a.avatar_url && <img src={a.avatar_url} alt="" className="w-5 h-5 rounded-full" />}
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[a.platform] ?? ""}`}>{a.platform}</span>
              <span className="text-sm font-medium">{a.name}</span>
              <button onClick={() => disconnectAccount(a.id)} className="text-muted-foreground hover:text-destructive ml-1">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : accounts.length === 0 ? (
        <Card className="p-12 text-center">
          <Share2 className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="font-medium mb-1">No social accounts connected</p>
          <p className="text-sm text-muted-foreground mb-4">Connect Facebook, Instagram, or X to start posting.</p>
          <Button onClick={() => setShowConnect(true)}><Plus className="h-4 w-4 mr-1" /> Connect Account</Button>
        </Card>
      ) : posts.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="font-medium mb-1">No posts yet</p>
          <p className="text-sm text-muted-foreground mb-4">Compose your first post across all your connected accounts.</p>
          <Button onClick={() => setShowCompose(true)}><Plus className="h-4 w-4 mr-1" /> New Post</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => {
            const postAccounts = accounts.filter((a) => post.account_ids.includes(a.id));
            return (
              <Card key={post.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {STATUS_ICONS[post.status] ?? null}
                      <span className="text-xs text-muted-foreground capitalize">{post.status}</span>
                      {postAccounts.map((a) => (
                        <span key={a.id} className={`text-xs px-1.5 py-0.5 rounded font-medium ${PLATFORM_COLORS[a.platform] ?? ""}`}>
                          {a.platform}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm line-clamp-2">{post.content}</p>
                    {post.image_url && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <ImageIcon className="h-3 w-3" /> Image attached
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {post.published_at
                        ? `Published ${new Date(post.published_at).toLocaleString()}`
                        : post.scheduled_at
                          ? `Scheduled for ${new Date(post.scheduled_at).toLocaleString()}`
                          : `Created ${new Date(post.created_at).toLocaleString()}`}
                    </p>
                    {post.error_log && (
                      <p className="text-xs text-red-500 mt-0.5">{post.error_log}</p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deletePost(post.id)} className="text-destructive hover:text-destructive shrink-0">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Compose modal */}
      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">Compose Post</h2>
              <button onClick={() => setShowCompose(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Account selector */}
              <div className="space-y-1">
                <Label>Post to *</Label>
                <div className="flex flex-wrap gap-2">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => toggleAccount(a.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border-2 transition-colors ${
                        selectedAccounts.includes(a.id) ? "border-primary bg-primary/10" : "border-muted"
                      }`}
                    >
                      <span className={`text-xs px-1.5 rounded font-medium ${PLATFORM_COLORS[a.platform] ?? ""}`}>{a.platform}</span>
                      {a.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* AI caption */}
              <div className="border rounded-lg p-3 space-y-2">
                <Label className="text-xs flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-purple-500" /> AI Caption</Label>
                <div className="flex gap-2">
                  <Input
                    value={captionPrompt}
                    onChange={(e) => setCaptionPrompt(e.target.value)}
                    placeholder="Describe your post topic..."
                    className="h-8 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && generateCaption()}
                  />
                  <Button size="sm" variant="outline" onClick={generateCaption} disabled={generatingCaption || !captionPrompt.trim()} className="shrink-0">
                    {generatingCaption ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Caption *</Label>
                <textarea
                  className="w-full h-32 p-3 text-sm rounded-md border bg-background resize-none"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's on your mind?"
                />
                <p className="text-xs text-muted-foreground text-right">{content.length} chars</p>
              </div>

              <div className="space-y-1">
                <Label>Image URL <span className="text-muted-foreground font-normal">(required for Instagram)</span></Label>
                <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input type="radio" id="now" checked={publishNow} onChange={() => setPublishNow(true)} />
                  <Label htmlFor="now" className="cursor-pointer">Publish Now</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input type="radio" id="schedule" checked={!publishNow} onChange={() => setPublishNow(false)} />
                  <Label htmlFor="schedule" className="cursor-pointer">Schedule</Label>
                </div>
                {!publishNow && (
                  <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
              <Button onClick={publish} disabled={publishing || !content.trim() || selectedAccounts.length === 0}>
                {publishing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {publishNow ? "Publish Now" : "Schedule Post"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Connect account modal */}
      {showConnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="font-semibold">Connect Social Account</h2>
              <button onClick={() => setShowConnect(false)}><X className="h-5 w-5 text-muted-foreground" /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="space-y-1">
                <Label>Platform</Label>
                <select value={connPlatform} onChange={(e) => setConnPlatform(e.target.value)}
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="x">X (Twitter)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Display Name</Label>
                <Input value={connName} onChange={(e) => setConnName(e.target.value)} placeholder="My Facebook Page" />
              </div>
              <div className="space-y-1">
                <Label>Account / User ID</Label>
                <Input value={connAccountId} onChange={(e) => setConnAccountId(e.target.value)} placeholder="123456789" />
              </div>
              <div className="space-y-1">
                <Label>Access Token</Label>
                <Input type="password" value={connToken} onChange={(e) => setConnToken(e.target.value)} placeholder="Long-lived access token" />
              </div>
              {connPlatform === "facebook" && (
                <>
                  <div className="space-y-1">
                    <Label>Page ID <span className="text-muted-foreground font-normal">(for posting to a Page)</span></Label>
                    <Input value={connPageId} onChange={(e) => setConnPageId(e.target.value)} placeholder="Page ID" />
                  </div>
                  <div className="space-y-1">
                    <Label>Page Access Token</Label>
                    <Input type="password" value={connPageToken} onChange={(e) => setConnPageToken(e.target.value)} placeholder="Page access token" />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowConnect(false)}>Cancel</Button>
              <Button onClick={connectAccount} disabled={connecting || !connName.trim() || !connToken.trim()}>
                {connecting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Connect
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
