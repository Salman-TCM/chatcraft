"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  GitFork,
  Play,
  Pause,
  Copy,
  Trash2,
  Plus,
  Loader2,
  Pencil,
  FolderOpen,
  Folder,
  FolderPlus,
  MoreHorizontal,
  Sparkles,
  X,
  FolderInput,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { cn } from "@/lib/utils";

interface FlowItem {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  trigger_type: string | null;
  chatbot_id: string | null;
  folder_id: string | null;
  updated_at: string;
}

interface FolderItem {
  id: string;
  name: string;
  colour: string | null;
}

const TRIGGER_LABELS: Record<string, string> = {
  keyword: "Keyword",
  webhook: "Webhook",
  manual: "Manual",
  opt_in: "Opt-in",
};

const FOLDER_COLOURS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6",
];

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = "All"

  // Folder dialog
  const [folderDialog, setFolderDialog] = useState<{
    open: boolean;
    mode: "create" | "rename";
    folder?: FolderItem;
    name: string;
    colour: string;
  }>({ open: false, mode: "create", name: "", colour: FOLDER_COLOURS[0] });
  const [savingFolder, setSavingFolder] = useState(false);

  // AI Generate dialog
  const [aiDialog, setAiDialog] = useState(false);
  const [aiDesc, setAiDesc] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [flowsRes, foldersRes] = await Promise.all([
        apiClient.get("/api/v1/flows?limit=100"),
        apiClient.get("/api/v1/flows/folders"),
      ]);
      setFlows(flowsRes.data.data);
      setFolders(foldersRes.data.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleFlows = flows.filter((f) =>
    selectedFolder === null ? true : f.folder_id === selectedFolder
  );

  async function createFlow() {
    setCreating(true);
    try {
      const { data } = await apiClient.post("/api/v1/flows", {
        name: "Untitled Flow",
        folder_id: selectedFolder ?? undefined,
      });
      router.push(`/dashboard/flows/${data.data.id}/edit`);
    } finally {
      setCreating(false);
    }
  }

  async function generateFlow() {
    if (!aiDesc.trim()) return;
    setAiGenerating(true);
    try {
      const { data } = await apiClient.post("/api/v1/flows/generate", {
        description: aiDesc.trim(),
        folder_id: selectedFolder ?? undefined,
      });
      setAiDialog(false);
      setAiDesc("");
      router.push(`/dashboard/flows/${data.data.id}/edit`);
    } finally {
      setAiGenerating(false);
    }
  }

  async function toggleFlow(id: string, current: boolean) {
    await apiClient.post(`/api/v1/flows/${id}/toggle`);
    setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, is_active: !current } : f)));
  }

  async function duplicateFlow(id: string) {
    const { data } = await apiClient.post(`/api/v1/flows/${id}/duplicate`);
    setFlows((prev) => [data.data, ...prev]);
  }

  async function deleteFlow(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    await apiClient.delete(`/api/v1/flows/${id}`);
    setFlows((prev) => prev.filter((f) => f.id !== id));
  }

  async function moveToFolder(flowId: string, folderId: string | null) {
    await apiClient.patch(`/api/v1/flows/${flowId}`, { folder_id: folderId });
    setFlows((prev) =>
      prev.map((f) => (f.id === flowId ? { ...f, folder_id: folderId } : f))
    );
  }

  async function saveFolder() {
    if (!folderDialog.name.trim()) return;
    setSavingFolder(true);
    try {
      if (folderDialog.mode === "create") {
        const { data } = await apiClient.post("/api/v1/flows/folders", {
          name: folderDialog.name.trim(),
          colour: folderDialog.colour,
        });
        setFolders((prev) => [...prev, data.data]);
      } else if (folderDialog.folder) {
        await apiClient.patch(`/api/v1/flows/folders/${folderDialog.folder.id}`, {
          name: folderDialog.name.trim(),
          colour: folderDialog.colour,
        });
        setFolders((prev) =>
          prev.map((f) =>
            f.id === folderDialog.folder!.id
              ? { ...f, name: folderDialog.name.trim(), colour: folderDialog.colour }
              : f
          )
        );
      }
      setFolderDialog((d) => ({ ...d, open: false }));
    } finally {
      setSavingFolder(false);
    }
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}"? Flows inside will become unorganised.`)) return;
    await apiClient.delete(`/api/v1/flows/folders/${id}`);
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setFlows((prev) => prev.map((f) => (f.folder_id === id ? { ...f, folder_id: null } : f)));
    if (selectedFolder === id) setSelectedFolder(null);
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Folder sidebar */}
      <aside className="hidden w-52 shrink-0 border-r bg-muted/20 md:flex flex-col">
        <div className="flex items-center justify-between px-3 py-3 border-b">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Folders
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="New folder"
            onClick={() =>
              setFolderDialog({
                open: true,
                mode: "create",
                name: "",
                colour: FOLDER_COLOURS[0],
              })
            }
          >
            <FolderPlus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <nav className="flex-1 overflow-y-auto py-1">
          <button
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent rounded-none",
              selectedFolder === null && "bg-accent font-medium"
            )}
            onClick={() => setSelectedFolder(null)}
          >
            <GitFork className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">All flows</span>
            <span className="ml-auto text-xs text-muted-foreground">{flows.length}</span>
          </button>
          {folders.map((folder) => {
            const count = flows.filter((f) => f.folder_id === folder.id).length;
            return (
              <div key={folder.id} className="group flex items-center">
                <button
                  className={cn(
                    "flex flex-1 min-w-0 items-center gap-2 px-3 py-2 text-sm hover:bg-accent",
                    selectedFolder === folder.id && "bg-accent font-medium"
                  )}
                  onClick={() => setSelectedFolder(folder.id)}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-sm shrink-0"
                    style={{ background: folder.colour ?? "#6366f1" }}
                  />
                  <span className="truncate">{folder.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{count}</span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 mr-1"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() =>
                        setFolderDialog({
                          open: true,
                          mode: "rename",
                          folder,
                          name: folder.name,
                          colour: folder.colour ?? FOLDER_COLOURS[0],
                        })
                      }
                    >
                      <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => deleteFolder(folder.id, folder.name)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold">
                {selectedFolder
                  ? (folders.find((f) => f.id === selectedFolder)?.name ?? "Folder")
                  : "Flow Builder"}
              </h1>
              <p className="text-sm text-muted-foreground">
                Visual drag-and-drop conversation automation
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAiDialog(true)}
              >
                <Sparkles className="h-4 w-4" />
                AI Generate
              </Button>
              <Button size="sm" onClick={createFlow} disabled={creating}>
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                New Flow
              </Button>
            </div>
          </div>

          {/* Empty state */}
          {visibleFlows.length === 0 && (
            <Card className="flex flex-col items-center gap-3 py-16 text-center">
              <GitFork className="h-10 w-10 text-muted-foreground/40" />
              <p className="font-medium">No flows yet</p>
              <p className="text-sm text-muted-foreground">
                {selectedFolder
                  ? "This folder is empty. Create or move a flow here."
                  : "Create your first flow to automate conversations"}
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setAiDialog(true)}>
                  <Sparkles className="h-4 w-4" /> AI Generate
                </Button>
                <Button size="sm" onClick={createFlow} disabled={creating}>
                  <Plus className="h-4 w-4" /> Create Flow
                </Button>
              </div>
            </Card>
          )}

          {/* Flow grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleFlows.map((flow) => (
              <Card key={flow.id} className="flex flex-col gap-0 overflow-hidden">
                <div className="flex items-start justify-between p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full shrink-0",
                          flow.is_active ? "bg-green-500" : "bg-muted-foreground/30"
                        )}
                      />
                      <p className="truncate font-medium text-sm">{flow.name}</p>
                    </div>
                    {flow.description && (
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {flow.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {flow.trigger_type && (
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                          {TRIGGER_LABELS[flow.trigger_type] ?? flow.trigger_type}
                        </span>
                      )}
                      {flow.folder_id && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Folder className="h-3 w-3" />
                          {folders.find((f) => f.id === flow.folder_id)?.name}
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(flow.updated_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center border-t bg-muted/30 px-3 py-2 gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs flex-1"
                    onClick={() => router.push(`/dashboard/flows/${flow.id}/edit`)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title={flow.is_active ? "Pause" : "Activate"}
                    onClick={() => toggleFlow(flow.id, flow.is_active)}
                  >
                    {flow.is_active ? (
                      <Pause className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <Play className="h-3.5 w-3.5 text-green-600" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    title="Duplicate"
                    onClick={() => duplicateFlow(flow.id)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-7 w-7">
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <FolderInput className="h-3.5 w-3.5 mr-2" />
                          Move to folder
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          <DropdownMenuItem
                            onClick={() => moveToFolder(flow.id, null)}
                            disabled={!flow.folder_id}
                          >
                            <X className="h-3.5 w-3.5 mr-2" /> No folder
                          </DropdownMenuItem>
                          {folders.map((folder) => (
                            <DropdownMenuItem
                              key={folder.id}
                              onClick={() => moveToFolder(flow.id, folder.id)}
                              disabled={flow.folder_id === folder.id}
                            >
                              <span
                                className="h-2.5 w-2.5 rounded-sm mr-2 shrink-0"
                                style={{ background: folder.colour ?? "#6366f1" }}
                              />
                              {folder.name}
                            </DropdownMenuItem>
                          ))}
                          {folders.length === 0 && (
                            <DropdownMenuItem disabled>No folders yet</DropdownMenuItem>
                          )}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteFlow(flow.id, flow.name)}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Folder create/rename dialog */}
      <Dialog
        open={folderDialog.open}
        onOpenChange={(open) => setFolderDialog((d) => ({ ...d, open }))}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {folderDialog.mode === "create" ? "New folder" : "Rename folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={folderDialog.name}
                onChange={(e) => setFolderDialog((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Lead Nurture"
                onKeyDown={(e) => e.key === "Enter" && saveFolder()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLOURS.map((colour) => (
                  <button
                    key={colour}
                    className={cn(
                      "h-6 w-6 rounded-md border-2 transition-all",
                      folderDialog.colour === colour
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    )}
                    style={{ background: colour }}
                    onClick={() => setFolderDialog((d) => ({ ...d, colour }))}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFolderDialog((d) => ({ ...d, open: false }))}
            >
              Cancel
            </Button>
            <Button onClick={saveFolder} disabled={savingFolder || !folderDialog.name.trim()}>
              {savingFolder && <Loader2 className="h-4 w-4 animate-spin" />}
              {folderDialog.mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Generate dialog */}
      <Dialog open={aiDialog} onOpenChange={setAiDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Flow Builder
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Describe the conversation flow you want to build and AI will generate it for you.
            </p>
            <Textarea
              value={aiDesc}
              onChange={(e) => setAiDesc(e.target.value)}
              placeholder="e.g. When a user says 'hello', greet them and ask for their name. Save their name to a custom field, then send them a welcome message with their name."
              rows={5}
              className="resize-none"
            />
            <div className="flex flex-wrap gap-2">
              {[
                "Lead qualification flow",
                "Appointment booking",
                "Support ticket triage",
                "Product recommendation",
              ].map((example) => (
                <button
                  key={example}
                  className="rounded-full border px-3 py-1 text-xs hover:bg-accent transition-colors"
                  onClick={() => setAiDesc(example)}
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAiDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={generateFlow}
              disabled={aiGenerating || !aiDesc.trim()}
            >
              {aiGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Generate Flow
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
