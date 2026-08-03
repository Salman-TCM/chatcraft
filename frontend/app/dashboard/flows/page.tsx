"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

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

// Folder create/rename form — name required (backend rejects whitespace-only
// on create; blank name on rename is a silent no-op server-side, so we only
// enforce non-empty on the create path via folderDialogMode).
const folderSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(255, "Max 255 characters"),
  colour: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a colour"),
});
type FolderFormData = z.infer<typeof folderSchema>;

// AI-generate-flow prompt form
const aiGenerateSchema = z.object({
  description: z.string().trim().min(1, "Describe the flow you want to build").max(2000, "Max 2000 characters"),
});
type AiGenerateFormData = z.infer<typeof aiGenerateSchema>;

export default function FlowsPage() {
  const router = useRouter();
  const [flows, setFlows] = useState<FlowItem[]>([]);
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null); // null = "All"

  // Folder dialog
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderDialogMode, setFolderDialogMode] = useState<"create" | "rename">("create");
  const [editingFolder, setEditingFolder] = useState<FolderItem | undefined>(undefined);
  const [savingFolder, setSavingFolder] = useState(false);

  const folderForm = useForm<FolderFormData>({
    resolver: zodResolver(folderSchema),
    defaultValues: { name: "", colour: FOLDER_COLOURS[0] },
  });

  // AI Generate dialog
  const [aiDialog, setAiDialog] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  const aiForm = useForm<AiGenerateFormData>({
    resolver: zodResolver(aiGenerateSchema),
    defaultValues: { description: "" },
  });

  const load = useCallback(async () => {
    try {
      const [flowsRes, foldersRes] = await Promise.all([
        apiClient.get("/api/v1/flows?limit=100"),
        apiClient.get("/api/v1/flows/folders"),
      ]);
      setFlows(flowsRes.data.data);
      setFolders(foldersRes.data.data);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't load flows",
        description: getErrorMessage(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visibleFlows = flows.filter((f) =>
    selectedFolder === null ? true : f.folder_id === selectedFolder
  );

  function openCreateFolder() {
    folderForm.reset({ name: "", colour: FOLDER_COLOURS[0] });
    setFolderDialogMode("create");
    setEditingFolder(undefined);
    setFolderDialogOpen(true);
  }

  function openRenameFolder(folder: FolderItem) {
    folderForm.reset({ name: folder.name, colour: folder.colour ?? FOLDER_COLOURS[0] });
    setFolderDialogMode("rename");
    setEditingFolder(folder);
    setFolderDialogOpen(true);
  }

  async function createFlow() {
    setCreating(true);
    try {
      const { data } = await apiClient.post("/api/v1/flows", {
        name: "Untitled Flow",
        folder_id: selectedFolder ?? undefined,
      });
      router.push(`/dashboard/flows/${data.data.id}/edit`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't create flow",
        description: getErrorMessage(err),
      });
    } finally {
      setCreating(false);
    }
  }

  async function onAiGenerateSubmit(values: AiGenerateFormData) {
    setAiGenerating(true);
    try {
      const { data } = await apiClient.post("/api/v1/flows/generate", {
        description: values.description,
        folder_id: selectedFolder ?? undefined,
      });
      setAiDialog(false);
      aiForm.reset({ description: "" });
      router.push(`/dashboard/flows/${data.data.id}/edit`);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't generate flow",
        description: getErrorMessage(err),
      });
      const fieldErrors = getFieldErrors(err);
      for (const [field, message] of Object.entries(fieldErrors)) {
        aiForm.setError(field as keyof AiGenerateFormData, { message });
      }
    } finally {
      setAiGenerating(false);
    }
  }

  async function toggleFlow(id: string, current: boolean) {
    try {
      await apiClient.post(`/api/v1/flows/${id}/toggle`);
      setFlows((prev) => prev.map((f) => (f.id === id ? { ...f, is_active: !current } : f)));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't update flow",
        description: getErrorMessage(err),
      });
    }
  }

  async function duplicateFlow(id: string) {
    try {
      const { data } = await apiClient.post(`/api/v1/flows/${id}/duplicate`);
      setFlows((prev) => [data.data, ...prev]);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't duplicate flow",
        description: getErrorMessage(err),
      });
    }
  }

  async function deleteFlow(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await apiClient.delete(`/api/v1/flows/${id}`);
      setFlows((prev) => prev.filter((f) => f.id !== id));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't delete flow",
        description: getErrorMessage(err),
      });
    }
  }

  async function moveToFolder(flowId: string, folderId: string | null) {
    try {
      await apiClient.patch(`/api/v1/flows/${flowId}`, { folder_id: folderId });
      setFlows((prev) =>
        prev.map((f) => (f.id === flowId ? { ...f, folder_id: folderId } : f))
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't move flow",
        description: getErrorMessage(err),
      });
    }
  }

  async function onFolderSubmit(values: FolderFormData) {
    setSavingFolder(true);
    try {
      if (folderDialogMode === "create") {
        const { data } = await apiClient.post("/api/v1/flows/folders", {
          name: values.name,
          colour: values.colour,
        });
        setFolders((prev) => [...prev, data.data]);
      } else if (editingFolder) {
        await apiClient.patch(`/api/v1/flows/folders/${editingFolder.id}`, {
          name: values.name,
          colour: values.colour,
        });
        setFolders((prev) =>
          prev.map((f) =>
            f.id === editingFolder.id
              ? { ...f, name: values.name, colour: values.colour }
              : f
          )
        );
      }
      setFolderDialogOpen(false);
    } catch (err) {
      toast({
        variant: "destructive",
        title: folderDialogMode === "create" ? "Couldn't create folder" : "Couldn't rename folder",
        description: getErrorMessage(err),
      });
      const fieldErrors = getFieldErrors(err);
      for (const [field, message] of Object.entries(fieldErrors)) {
        folderForm.setError(field as keyof FolderFormData, { message });
      }
    } finally {
      setSavingFolder(false);
    }
  }

  async function deleteFolder(id: string, name: string) {
    if (!confirm(`Delete folder "${name}"? Flows inside will become unorganised.`)) return;
    try {
      await apiClient.delete(`/api/v1/flows/folders/${id}`);
      setFolders((prev) => prev.filter((f) => f.id !== id));
      setFlows((prev) => prev.map((f) => (f.folder_id === id ? { ...f, folder_id: null } : f)));
      if (selectedFolder === id) setSelectedFolder(null);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't delete folder",
        description: getErrorMessage(err),
      });
    }
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
            onClick={openCreateFolder}
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
                      onClick={() => openRenameFolder(folder)}
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
        open={folderDialogOpen}
        onOpenChange={(open) => setFolderDialogOpen(open)}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {folderDialogMode === "create" ? "New folder" : "Rename folder"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                {...folderForm.register("name")}
                placeholder="e.g. Lead Nurture"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    folderForm.handleSubmit(onFolderSubmit)();
                  }
                }}
              />
              {folderForm.formState.errors.name && (
                <p className="text-xs text-destructive">
                  {folderForm.formState.errors.name.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2">
                {FOLDER_COLOURS.map((colour) => (
                  <button
                    key={colour}
                    type="button"
                    className={cn(
                      "h-6 w-6 rounded-md border-2 transition-all",
                      folderForm.watch("colour") === colour
                        ? "border-foreground scale-110"
                        : "border-transparent"
                    )}
                    style={{ background: colour }}
                    onClick={() => folderForm.setValue("colour", colour, { shouldValidate: true })}
                  />
                ))}
              </div>
              {folderForm.formState.errors.colour && (
                <p className="text-xs text-destructive">
                  {folderForm.formState.errors.colour.message}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFolderDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={folderForm.handleSubmit(onFolderSubmit)} disabled={savingFolder}>
              {savingFolder && <Loader2 className="h-4 w-4 animate-spin" />}
              {folderDialogMode === "create" ? "Create" : "Save"}
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
              {...aiForm.register("description")}
              placeholder="e.g. When a user says 'hello', greet them and ask for their name. Save their name to a custom field, then send them a welcome message with their name."
              rows={5}
              className="resize-none"
            />
            {aiForm.formState.errors.description && (
              <p className="text-xs text-destructive">
                {aiForm.formState.errors.description.message}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {[
                "Lead qualification flow",
                "Appointment booking",
                "Support ticket triage",
                "Product recommendation",
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  className="rounded-full border px-3 py-1 text-xs hover:bg-accent transition-colors"
                  onClick={() => aiForm.setValue("description", example, { shouldValidate: true })}
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
              onClick={aiForm.handleSubmit(onAiGenerateSubmit)}
              disabled={aiGenerating}
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
