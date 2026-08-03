"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Share2, Plus, Loader2, Trash2, X, Sparkles, Image as ImageIcon,
  Calendar, CheckCircle2, AlertCircle, Clock,
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

// ── Validation schemas ──────────────────────────────────────────────────────
// Mirrors backend/app/schemas/broadcast.py

const connectSchema = z.object({
  platform: z.enum(["facebook", "instagram", "x"]),
  name: z.string().trim().min(1, "Display name is required").max(255),
  account_id: z.string().max(255).optional().default(""),
  access_token: z.string().trim().min(1, "Access token is required").max(4096),
  page_id: z.string().max(255).optional().default(""),
  page_access_token: z.string().max(4096).optional().default(""),
});
type ConnectFormData = z.infer<typeof connectSchema>;
const connectDefaults: ConnectFormData = {
  platform: "facebook", name: "", account_id: "", access_token: "", page_id: "", page_access_token: "",
};

const composeSchema = z
  .object({
    content: z.string().trim().min(1, "Caption is required").max(5000),
    image_url: z.string().trim().max(1000).optional().default(""),
    account_ids: z.array(z.string()).min(1, "Select at least one account to post to"),
    publish_now: z.boolean(),
    scheduled_at: z.string().optional().default(""),
  })
  .superRefine((data, ctx) => {
    if (!data.publish_now && !data.scheduled_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Pick a date and time to schedule the post",
        path: ["scheduled_at"],
      });
    }
  });
type ComposeFormData = z.infer<typeof composeSchema>;
const composeDefaults: ComposeFormData = {
  content: "", image_url: "", account_ids: [], publish_now: true, scheduled_at: "",
};

const captionSchema = z.object({
  prompt: z.string().trim().min(1, "Describe what you'd like to post about"),
});
type CaptionFormData = z.infer<typeof captionSchema>;

export default function SocialPage() {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCompose, setShowCompose] = useState(false);
  const [showConnect, setShowConnect] = useState(false);

  const composeForm = useForm<ComposeFormData>({
    resolver: zodResolver(composeSchema),
    defaultValues: composeDefaults,
  });
  const captionForm = useForm<CaptionFormData>({
    resolver: zodResolver(captionSchema),
    defaultValues: { prompt: "" },
  });
  const connectForm = useForm<ConnectFormData>({
    resolver: zodResolver(connectSchema),
    defaultValues: connectDefaults,
  });

  const content = composeForm.watch("content") ?? "";
  const selectedAccounts = composeForm.watch("account_ids") ?? [];
  const publishNow = composeForm.watch("publish_now");
  const connPlatform = connectForm.watch("platform");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accRes, postRes] = await Promise.all([
        apiClient.get("/api/v1/social/accounts"),
        apiClient.get("/api/v1/social/posts?limit=50"),
      ]);
      setAccounts(accRes.data.data ?? []);
      setPosts(postRes.data.data ?? []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't load social data",
        description: getErrorMessage(err),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function onGenerateCaption(data: CaptionFormData) {
    try {
      const res = await apiClient.post("/api/v1/social/posts/generate-caption", { prompt: data.prompt });
      composeForm.setValue("content", res.data.data.caption, { shouldValidate: true });
      captionForm.reset({ prompt: "" });
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        captionForm.setError(field as keyof CaptionFormData, { message });
      });
      toast({
        variant: "destructive",
        title: "Couldn't generate caption",
        description: getErrorMessage(err),
      });
    }
  }

  async function onPublish(data: ComposeFormData) {
    try {
      await apiClient.post("/api/v1/social/posts", {
        content: data.content,
        image_url: data.image_url || null,
        account_ids: data.account_ids,
        publish_now: data.publish_now,
        scheduled_at: !data.publish_now && data.scheduled_at ? data.scheduled_at : null,
      });
      setShowCompose(false);
      composeForm.reset(composeDefaults);
      await load();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        composeForm.setError(field as keyof ComposeFormData, { message });
      });
      toast({
        variant: "destructive",
        title: "Couldn't publish post",
        description: getErrorMessage(err),
      });
    }
  }

  async function deletePost(id: string) {
    if (!confirm("Delete this post?")) return;
    try {
      await apiClient.delete(`/api/v1/social/posts/${id}`);
      setPosts((p) => p.filter((post) => post.id !== id));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't delete post",
        description: getErrorMessage(err),
      });
    }
  }

  async function onConnectAccount(data: ConnectFormData) {
    try {
      await apiClient.post("/api/v1/social/accounts", {
        platform: data.platform,
        name: data.name,
        access_token: data.access_token,
        account_id: data.account_id || "",
        page_id: data.page_id || null,
        page_access_token: data.page_access_token || null,
      });
      setShowConnect(false);
      connectForm.reset(connectDefaults);
      await load();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        connectForm.setError(field as keyof ConnectFormData, { message });
      });
      toast({
        variant: "destructive",
        title: "Couldn't connect account",
        description: getErrorMessage(err),
      });
    }
  }

  async function disconnectAccount(id: string) {
    if (!confirm("Disconnect this account?")) return;
    try {
      await apiClient.delete(`/api/v1/social/accounts/${id}`);
      setAccounts((p) => p.filter((a) => a.id !== id));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't disconnect account",
        description: getErrorMessage(err),
      });
    }
  }

  function toggleAccount(id: string) {
    const current = composeForm.getValues("account_ids") ?? [];
    const next = current.includes(id) ? current.filter((a) => a !== id) : [...current, id];
    composeForm.setValue("account_ids", next, { shouldValidate: true });
  }

  function openCompose() {
    composeForm.reset(composeDefaults);
    captionForm.reset({ prompt: "" });
    setShowCompose(true);
  }

  function openConnect() {
    connectForm.reset(connectDefaults);
    setShowConnect(true);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Share2 className="h-6 w-6" />
          <h1 className="text-2xl font-semibold">Social Poster</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openConnect}>
            <Plus className="h-4 w-4 mr-1" /> Connect Account
          </Button>
          <Button onClick={openCompose} disabled={accounts.length === 0}>
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
          <Button onClick={openConnect}><Plus className="h-4 w-4 mr-1" /> Connect Account</Button>
        </Card>
      ) : posts.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="font-medium mb-1">No posts yet</p>
          <p className="text-sm text-muted-foreground mb-4">Compose your first post across all your connected accounts.</p>
          <Button onClick={openCompose}><Plus className="h-4 w-4 mr-1" /> New Post</Button>
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
                {composeForm.formState.errors.account_ids && (
                  <p className="text-xs text-destructive">{composeForm.formState.errors.account_ids.message}</p>
                )}
              </div>

              {/* AI caption */}
              <div className="border rounded-lg p-3 space-y-2">
                <Label className="text-xs flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-purple-500" /> AI Caption</Label>
                <div className="flex gap-2">
                  <Input
                    {...captionForm.register("prompt")}
                    placeholder="Describe your post topic..."
                    className="h-8 text-sm"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        captionForm.handleSubmit(onGenerateCaption)();
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={captionForm.handleSubmit(onGenerateCaption)}
                    disabled={captionForm.formState.isSubmitting}
                    className="shrink-0"
                  >
                    {captionForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  </Button>
                </div>
                {captionForm.formState.errors.prompt && (
                  <p className="text-xs text-destructive">{captionForm.formState.errors.prompt.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Caption *</Label>
                <textarea
                  className="w-full h-32 p-3 text-sm rounded-md border bg-background resize-none"
                  {...composeForm.register("content")}
                  placeholder="What's on your mind?"
                />
                <p className="text-xs text-muted-foreground text-right">{content.length} chars</p>
                {composeForm.formState.errors.content && (
                  <p className="text-xs text-destructive">{composeForm.formState.errors.content.message}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label>Image URL <span className="text-muted-foreground font-normal">(required for Instagram)</span></Label>
                <Input {...composeForm.register("image_url")} placeholder="https://..." />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="now"
                    checked={publishNow}
                    onChange={() => composeForm.setValue("publish_now", true, { shouldValidate: true })}
                  />
                  <Label htmlFor="now" className="cursor-pointer">Publish Now</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="schedule"
                    checked={!publishNow}
                    onChange={() => composeForm.setValue("publish_now", false, { shouldValidate: true })}
                  />
                  <Label htmlFor="schedule" className="cursor-pointer">Schedule</Label>
                </div>
                {!publishNow && (
                  <>
                    <Input type="datetime-local" {...composeForm.register("scheduled_at")} />
                    {composeForm.formState.errors.scheduled_at && (
                      <p className="text-xs text-destructive">{composeForm.formState.errors.scheduled_at.message}</p>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowCompose(false)}>Cancel</Button>
              <Button onClick={composeForm.handleSubmit(onPublish)} disabled={composeForm.formState.isSubmitting}>
                {composeForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
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
                <select {...connectForm.register("platform")}
                  className="w-full h-9 rounded-md border bg-background px-2 text-sm">
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="x">X (Twitter)</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label>Display Name</Label>
                <Input {...connectForm.register("name")} placeholder="My Facebook Page" />
                {connectForm.formState.errors.name && (
                  <p className="text-xs text-destructive">{connectForm.formState.errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Account / User ID</Label>
                <Input {...connectForm.register("account_id")} placeholder="123456789" />
              </div>
              <div className="space-y-1">
                <Label>Access Token</Label>
                <Input type="password" {...connectForm.register("access_token")} placeholder="Long-lived access token" />
                {connectForm.formState.errors.access_token && (
                  <p className="text-xs text-destructive">{connectForm.formState.errors.access_token.message}</p>
                )}
              </div>
              {connPlatform === "facebook" && (
                <>
                  <div className="space-y-1">
                    <Label>Page ID <span className="text-muted-foreground font-normal">(for posting to a Page)</span></Label>
                    <Input {...connectForm.register("page_id")} placeholder="Page ID" />
                  </div>
                  <div className="space-y-1">
                    <Label>Page Access Token</Label>
                    <Input type="password" {...connectForm.register("page_access_token")} placeholder="Page access token" />
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-2 p-4 border-t">
              <Button variant="outline" onClick={() => setShowConnect(false)}>Cancel</Button>
              <Button onClick={connectForm.handleSubmit(onConnectAccount)} disabled={connectForm.formState.isSubmitting}>
                {connectForm.formState.isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Connect
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
