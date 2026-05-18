"use client";

import { useEffect, useState } from "react";
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
  DialogTrigger,
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
import { Plus, Trash2, Wrench, Globe, RefreshCw } from "lucide-react";
import { apiClient } from "@/lib/api";

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

const defaultForm = {
  name: "",
  server_url: "",
  auth_type: "none",
  auth_config: {} as Record<string, string>,
  chatbot_id: "",
  is_active: true,
};

export default function MCPServersPage() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...defaultForm });
  const [saving, setSaving] = useState(false);
  const [tools, setTools] = useState<Record<string, MCPTool[]>>({});
  const [loadingTools, setLoadingTools] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await apiClient.get("/api/v1/mcp-servers");
      setServers(res.data.data || []);
    } catch {}
    setLoading(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.post("/api/v1/mcp-servers", form);
      setOpen(false);
      setForm({ ...defaultForm });
      await load();
    } catch {}
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this MCP server?")) return;
    await apiClient.delete(`/api/v1/mcp-servers/${id}`);
    await load();
  }

  async function handleToggle(server: MCPServer) {
    await apiClient.patch(`/api/v1/mcp-servers/${server.id}`, {
      ...server,
      is_active: !server.is_active,
    });
    await load();
  }

  async function discoverTools(serverId: string) {
    setLoadingTools(serverId);
    try {
      const res = await apiClient.get(`/api/v1/mcp-servers/${serverId}/tools`);
      setTools((t) => ({ ...t, [serverId]: res.data.data || [] }));
    } catch {}
    setLoadingTools(null);
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Add Server
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add MCP Server</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. My Custom Tools"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Server URL</Label>
                <Input
                  value={form.server_url}
                  onChange={(e) => setForm({ ...form, server_url: e.target.value })}
                  placeholder="https://mcp.example.com/rpc"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Authentication</Label>
                <Select
                  value={form.auth_type}
                  onValueChange={(v) => setForm({ ...form, auth_type: v, auth_config: {} })}
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
              </div>

              {form.auth_type === "bearer" && (
                <div className="space-y-1">
                  <Label>Token</Label>
                  <Input
                    type="password"
                    value={form.auth_config.token || ""}
                    onChange={(e) =>
                      setForm({ ...form, auth_config: { token: e.target.value } })
                    }
                    placeholder="Bearer token"
                  />
                </div>
              )}

              {form.auth_type === "header" && (
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Header Name</Label>
                    <Input
                      value={form.auth_config.header_name || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          auth_config: { ...form.auth_config, header_name: e.target.value },
                        })
                      }
                      placeholder="X-API-Key"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Header Value</Label>
                    <Input
                      type="password"
                      value={form.auth_config.header_value || ""}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          auth_config: { ...form.auth_config, header_value: e.target.value },
                        })
                      }
                      placeholder="secret"
                    />
                  </div>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={saving}>
                {saving ? "Adding..." : "Add Server"}
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
