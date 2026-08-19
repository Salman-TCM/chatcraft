"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Wrench, Globe, RefreshCw, Pencil } from "lucide-react";
import { apiClient } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { getErrorMessage, getFieldErrors } from "@/lib/errors";

interface MCPServer {
  id: string;
  name: string;
  server_url: string;
  auth_type: string;
  chatbot_id?: string;
  is_active: boolean;
  created_at: string;
}

interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: object;
}

const baseMcpServerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  server_url: z
    .string()
    .min(1, "Server URL is required")
    .url("Enter a valid URL"),
  auth_type: z.enum(["none", "bearer", "header"]),
  auth_config: z.object({
    token: z.string().optional(),
    header_name: z.string().optional(),
    header_value: z.string().optional(),
  }),
  chatbot_id: z.string().optional(),
  is_active: z.boolean(),
});

type MCPServerFormData = z.infer<typeof baseMcpServerSchema>;

// When editing, existing secrets are never sent back to the client, so a
// blank credential field means "keep the current value" rather than
// "credential is missing" — only require the fields when creating a server.
function buildMcpServerSchema(isEditing: boolean) {
  return baseMcpServerSchema.superRefine((data, ctx) => {
    if (isEditing) return;
    if (data.auth_type === "bearer" && !data.auth_config.token?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Token is required for bearer authentication",
        path: ["auth_config", "token"],
      });
    }
    if (data.auth_type === "header") {
      if (!data.auth_config.header_name?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Header name is required",
          path: ["auth_config", "header_name"],
        });
      }
      if (!data.auth_config.header_value?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Header value is required",
          path: ["auth_config", "header_value"],
        });
      }
    }
  });
}

const defaultFormValues: MCPServerFormData = {
  name: "",
  server_url: "",
  auth_type: "none",
  auth_config: { token: "", header_name: "", header_value: "" },
  chatbot_id: "",
  is_active: true,
};

export default function MCPServersPage() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingServer, setEditingServer] = useState<MCPServer | null>(null);
  const editingServerRef = useRef<MCPServer | null>(null);
  const [tools, setTools] = useState<Record<string, MCPTool[]>>({});
  const [loadingTools, setLoadingTools] = useState<string | null>(null);

  const resolver: Resolver<MCPServerFormData> = useCallback(
    (values, context, options) =>
      zodResolver(buildMcpServerSchema(!!editingServerRef.current))(values, context, options),
    []
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<MCPServerFormData>({
    resolver,
    defaultValues: defaultFormValues,
  });

  const authType = watch("auth_type");

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    editingServerRef.current = editingServer;
  }, [editingServer]);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/mcp-servers");
      setServers(res.data.data || []);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to load MCP servers",
        description: getErrorMessage(err),
      });
    }
    setLoading(false);
  }

  async function onSubmit(data: MCPServerFormData) {
    const token = data.auth_config.token?.trim() ?? "";
    const headerName = data.auth_config.header_name?.trim() ?? "";
    const headerValue = data.auth_config.header_value?.trim() ?? "";

    // On edit, existing secrets aren't sent back to the client, so an
    // untouched (blank) credential field means "keep the current value"
    // rather than "clear it".
    const auth_config: Record<string, string> | undefined =
      data.auth_type === "none"
        ? {}
        : data.auth_type === "bearer"
          ? token
            ? { token }
            : editingServer
              ? undefined
              : { token: "" }
          : headerName || headerValue
            ? { header_name: headerName, header_value: headerValue }
            : editingServer
              ? undefined
              : { header_name: "", header_value: "" };

    const payload = {
      name: data.name,
      server_url: data.server_url,
      auth_type: data.auth_type,
      ...(auth_config !== undefined ? { auth_config } : {}),
      chatbot_id: data.chatbot_id || undefined,
      is_active: data.is_active,
    };

    try {
      if (editingServer) {
        await apiClient.patch(`/api/v1/mcp-servers/${editingServer.id}`, payload);
        toast({ variant: "success", title: "MCP server updated" });
      } else {
        await apiClient.post("/api/v1/mcp-servers", payload);
        toast({ variant: "success", title: "MCP server added" });
      }
      setOpen(false);
      setEditingServer(null);
      reset(defaultFormValues);
      await load();
    } catch (err) {
      const fieldErrors = getFieldErrors(err);
      Object.entries(fieldErrors).forEach(([field, message]) => {
        setError(field as keyof MCPServerFormData, { message });
      });
      toast({
        variant: "destructive",
        title: "Failed to save MCP server",
        description: getErrorMessage(err),
      });
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this MCP server?")) return;
    try {
      await apiClient.delete(`/api/v1/mcp-servers/${id}`);
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to remove MCP server",
        description: getErrorMessage(err),
      });
    }
  }

  async function handleToggle(server: MCPServer) {
    try {
      await apiClient.patch(`/api/v1/mcp-servers/${server.id}`, {
        ...server,
        is_active: !server.is_active,
      });
      await load();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to update MCP server",
        description: getErrorMessage(err),
      });
    }
  }

  async function discoverTools(serverId: string) {
    setLoadingTools(serverId);
    try {
      const res = await apiClient.get(`/api/v1/mcp-servers/${serverId}/tools`);
      setTools((t) => ({ ...t, [serverId]: res.data.data || [] }));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to discover tools",
        description: getErrorMessage(err),
      });
    }
    setLoadingTools(null);
  }

  function openAddDialog() {
    setEditingServer(null);
    reset(defaultFormValues);
    setOpen(true);
  }

  function openEditDialog(server: MCPServer) {
    setEditingServer(server);
    reset({
      name: server.name,
      server_url: server.server_url,
      auth_type: (server.auth_type as MCPServerFormData["auth_type"]) || "none",
      auth_config: { token: "", header_name: "", header_value: "" },
      chatbot_id: server.chatbot_id ?? "",
      is_active: server.is_active,
    });
    setOpen(true);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setEditingServer(null);
      reset(defaultFormValues);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">MCP Servers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Connect Model Context Protocol servers to extend AI capabilities with external tools
          </p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <Button onClick={openAddDialog}>
            <Plus className="h-4 w-4 mr-2" /> Add Server
          </Button>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingServer ? "Edit MCP Server" : "Add MCP Server"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  {...register("name")}
                  placeholder="e.g. My Custom Tools"
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Server URL</Label>
                <Input
                  {...register("server_url")}
                  placeholder="https://mcp.example.com/rpc"
                />
                {errors.server_url && (
                  <p className="text-sm text-destructive">{errors.server_url.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Authentication</Label>
                <Controller
                  control={control}
                  name="auth_type"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => {
                        field.onChange(v as MCPServerFormData["auth_type"]);
                        setValue("auth_config", {
                          token: "",
                          header_name: "",
                          header_value: "",
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="bearer">Bearer Token</SelectItem>
                        <SelectItem value="header">Custom Header</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              {authType === "bearer" && (
                <div className="space-y-1">
                  <Label>Token</Label>
                  <Input
                    type="password"
                    {...register("auth_config.token")}
                    placeholder={
                      editingServer ? "Leave blank to keep current token" : "Bearer token"
                    }
                  />
                  {errors.auth_config?.token && (
                    <p className="text-sm text-destructive">
                      {errors.auth_config.token.message}
                    </p>
                  )}
                </div>
              )}

              {authType === "header" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Header Name</Label>
                    <Input
                      {...register("auth_config.header_name")}
                      placeholder={editingServer ? "Keep current name" : "X-API-Key"}
                    />
                    {errors.auth_config?.header_name && (
                      <p className="text-sm text-destructive">
                        {errors.auth_config.header_name.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label>Header Value</Label>
                    <Input
                      type="password"
                      {...register("auth_config.header_value")}
                      placeholder={editingServer ? "Keep current value" : "secret"}
                    />
                    {errors.auth_config?.header_value && (
                      <p className="text-sm text-destructive">
                        {errors.auth_config.header_value.message}
                      </p>
                    )}
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting
                  ? editingServer
                    ? "Saving..."
                    : "Adding..."
                  : editingServer
                    ? "Save Changes"
                    : "Add Server"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading...</p>
      ) : servers.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Globe className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="font-medium text-lg">No MCP servers configured</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-xs">
              Connect external tool servers to give your AI agents access to custom capabilities
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {servers.map((server) => (
            <Card key={server.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{server.name}</CardTitle>
                    <Badge variant={server.is_active ? "default" : "secondary"}>
                      {server.is_active ? "Active" : "Disabled"}
                    </Badge>
                    <Badge variant="outline" className="font-mono text-xs">
                      {server.auth_type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={server.is_active}
                      onCheckedChange={() => handleToggle(server)}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => openEditDialog(server)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => discoverTools(server.id)}
                      disabled={loadingTools === server.id}
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${loadingTools === server.id ? "animate-spin" : ""}`}
                      />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => handleDelete(server.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground font-mono mt-1">{server.server_url}</p>
              </CardHeader>

              {tools[server.id] && tools[server.id].length > 0 && (
                <CardContent className="pt-0">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="tools" className="border-0">
                      <AccordionTrigger className="text-sm py-2">
                        <div className="flex items-center gap-2">
                          <Wrench className="h-3.5 w-3.5" />
                          {tools[server.id].length} tool{tools[server.id].length !== 1 ? "s" : ""} available
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-2">
                          {tools[server.id].map((tool) => (
                            <div
                              key={tool.name}
                              className="bg-muted rounded p-3 text-sm"
                            >
                              <p className="font-medium font-mono">{tool.name}</p>
                              {tool.description && (
                                <p className="text-muted-foreground text-xs mt-1">{tool.description}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              )}

              {tools[server.id]?.length === 0 && (
                <CardContent className="pt-0">
                  <p className="text-xs text-muted-foreground">No tools found on this server.</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
