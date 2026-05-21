"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Key, Plus, Trash2, Copy, Check, Loader2, AlertTriangle, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";

interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiTokensPage() {
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await apiClient.get("/api/tokens");
      setTokens(data.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const { data } = await apiClient.post("/api/tokens", { name: name.trim() });
      setNewToken(data.data.token);
      setName("");
      setShowForm(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Any applications using it will lose access.")) return;
    setRevokingId(id);
    try {
      await apiClient.delete(`/api/tokens/${id}`);
      setTokens(prev => prev.filter(t => t.id !== id));
    } finally {
      setRevokingId(null);
    }
  }

  function copyToken() {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Key className="h-6 w-6" /> API Tokens
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Use bearer tokens to authenticate API requests from external applications.
          </p>
        </div>
        <Button onClick={() => setShowForm(s => !s)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> New Token
        </Button>
      </div>

      {/* New token created banner */}
      {newToken && (
        <Card className="border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-green-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-800">Token created — copy it now</p>
              <p className="text-xs text-green-700 mt-0.5">
                This token will not be shown again. Store it securely.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <code className="flex-1 rounded bg-white border border-green-200 px-3 py-1.5 text-xs font-mono break-all">
                  {newToken}
                </code>
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={copyToken}>
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
            <button onClick={() => setNewToken(null)} className="text-green-600 hover:text-green-800 text-xs">
              Dismiss
            </button>
          </div>
        </Card>
      )}

      {/* Create form */}
      {showForm && (
        <Card className="p-4">
          <p className="text-sm font-semibold mb-3">Create new token</p>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label className="text-xs mb-1 block">Token name</Label>
              <Input
                className="h-9 text-sm"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Production app, Zapier"
                onKeyDown={e => e.key === "Enter" && create()}
                autoFocus
              />
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={create} disabled={creating || !name.trim()} className="h-9">
                {creating && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Create
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)} className="h-9">
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Token list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tokens.length === 0 ? (
        <Card className="p-12 text-center">
          <Key className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No API tokens</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a token to authenticate API requests from your applications.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="divide-y">
            {tokens.map(token => (
              <div key={token.id} className="flex items-center gap-4 px-4 py-3">
                <Key className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{token.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {token.token_prefix}••••••••••••••••
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground shrink-0">
                  {token.last_used_at ? (
                    <p>Last used {new Date(token.last_used_at).toLocaleDateString()}</p>
                  ) : (
                    <p className="text-amber-600">Never used</p>
                  )}
                  <p>Created {new Date(token.created_at).toLocaleDateString()}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                  onClick={() => revoke(token.id)}
                  disabled={revokingId === token.id}
                >
                  {revokingId === token.id
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />
                  }
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Usage docs */}
      <Card className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Usage</p>
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Pass the token as a Bearer header in all API requests:</p>
          <pre className="rounded bg-muted px-3 py-2 text-[11px] font-mono overflow-x-auto">
{`curl https://your-domain.com/api/v1/flows \\
  -H "Authorization: Bearer cc_your_token_here"`}
          </pre>
          <p className="text-xs text-muted-foreground">
            Tokens have the same permissions as your account. Rotate tokens if they are exposed.
          </p>
        </div>
      </Card>
    </div>
  );
}
