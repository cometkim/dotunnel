"use client";

import {
  Check,
  Circle,
  Copy,
  ExternalLink,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { Alert, AlertDescription } from "#app/components/ui/alert.tsx";
import { Badge } from "#app/components/ui/badge.tsx";
import { Button } from "#app/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#app/components/ui/card.tsx";
import { Input } from "#app/components/ui/input.tsx";
import { Label } from "#app/components/ui/label.tsx";
import {
  createTunnel,
  deleteTunnel,
  isSubdomainAvailable,
} from "#app/functions/tunnels.ts";
import type { TunnelDisplay } from "#app/models/tunnel.ts";

type TunnelListProps = {
  initialTunnels: TunnelDisplay[];
};

export function TunnelList({
  initialTunnels,
}: TunnelListProps): React.ReactElement {
  const [tunnels, setTunnels] = React.useState(initialTunnels);
  const [isCreating, setIsCreating] = React.useState(false);
  const [showCreateForm, setShowCreateForm] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Create form state
  const [subdomain, setSubdomain] = React.useState("");
  const [tunnelName, setTunnelName] = React.useState("");
  const [subdomainError, setSubdomainError] = React.useState<string | null>(
    null,
  );
  const [checkingSubdomain, setCheckingSubdomain] = React.useState(false);

  // Split tunnels by type
  const namedTunnels = tunnels.filter((t) => t.type === "named");
  const ephemeralTunnels = tunnels.filter((t) => t.type === "ephemeral");

  const handleCreate = async () => {
    setIsCreating(true);
    setError(null);

    const input = {
      type: "named" as const,
      subdomain,
      name: tunnelName || undefined,
    };

    const result = await createTunnel(input);

    if (result.success) {
      setTunnels((prev) => [result.data, ...prev]);
      setShowCreateForm(false);
      setSubdomain("");
      setTunnelName("");
    } else {
      setError(result.error);
    }

    setIsCreating(false);
  };

  const handleDelete = async (publicId: string) => {
    if (!confirm("Are you sure you want to delete this tunnel?")) {
      return;
    }

    setDeletingId(publicId);
    setError(null);

    const result = await deleteTunnel(publicId);

    if (result.success) {
      setTunnels((prev) => prev.filter((t) => t.publicId !== publicId));
    } else {
      setError(result.error);
    }

    setDeletingId(null);
  };

  const handleCopyUrl = async (tunnel: TunnelDisplay) => {
    await navigator.clipboard.writeText(tunnel.url);
    setCopiedId(tunnel.publicId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const checkSubdomainAvailability = React.useCallback(
    async (value: string) => {
      if (value.length < 3) {
        setSubdomainError(null);
        return;
      }

      setCheckingSubdomain(true);
      const result = await isSubdomainAvailable(value);
      setCheckingSubdomain(false);

      if (!result.success) {
        setSubdomainError(result.error);
      } else if (!result.data.available) {
        setSubdomainError("This subdomain is already taken");
      } else {
        setSubdomainError(null);
      }
    },
    [],
  );

  // Debounced subdomain check
  React.useEffect(() => {
    if (!subdomain) {
      setSubdomainError(null);
      return;
    }

    const timer = setTimeout(() => {
      checkSubdomainAvailability(subdomain);
    }, 500);

    return () => clearTimeout(timer);
  }, [subdomain, checkSubdomainAvailability]);

  const canCreate =
    subdomain.length >= 3 && !subdomainError && !checkingSubdomain;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Create tunnel section */}
      {!showCreateForm ? (
        <Button onClick={() => setShowCreateForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          New Tunnel
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Create Named Tunnel</CardTitle>
            <CardDescription>
              Reserve a persistent subdomain for your tunnel endpoint.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Subdomain input */}
            <div className="space-y-2">
              <Label htmlFor="subdomain">Subdomain</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="subdomain"
                  value={subdomain}
                  onChange={(e) =>
                    setSubdomain(e.target.value.toLowerCase().trim())
                  }
                  placeholder="myapp"
                  className="max-w-xs"
                />
                <span className="text-muted-foreground">.tunnel.io</span>
                {checkingSubdomain && (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
              {subdomainError && (
                <p className="text-sm text-destructive">{subdomainError}</p>
              )}
            </div>

            {/* Optional name */}
            <div className="space-y-2">
              <Label htmlFor="name">Display Name (optional)</Label>
              <Input
                id="name"
                value={tunnelName}
                onChange={(e) => setTunnelName(e.target.value)}
                placeholder="My Development Server"
                className="max-w-md"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleCreate}
                disabled={isCreating || !canCreate}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Tunnel"
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowCreateForm(false);
                  setSubdomain("");
                  setTunnelName("");
                  setSubdomainError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Named tunnels */}
      <Card>
        <CardHeader>
          <CardTitle>Named Tunnels ({namedTunnels.length})</CardTitle>
          <CardDescription>
            {namedTunnels.length === 0
              ? "You haven't created any named tunnels yet"
              : "Persistent tunnel endpoints with custom subdomains"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {namedTunnels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-muted p-4">
                <ExternalLink className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No named tunnels</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                Create a named tunnel to reserve a persistent subdomain.
              </p>
              {!showCreateForm && (
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Create Tunnel
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {namedTunnels.map((tunnel) => (
                <div
                  key={tunnel.publicId}
                  className="flex items-center justify-between rounded-md border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Circle
                        className={`h-2 w-2 ${
                          tunnel.status === "online"
                            ? "fill-green-500 text-green-500"
                            : "fill-muted-foreground text-muted-foreground"
                        }`}
                      />
                      <a
                        href={tunnel.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm font-medium hover:underline"
                      >
                        {tunnel.url.replace("https://", "")}
                      </a>
                    </div>
                    {tunnel.name && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {tunnel.name}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {new Date(tunnel.createdAt).toLocaleDateString()}
                      {tunnel.lastConnectedAt &&
                        ` - Last connected ${new Date(tunnel.lastConnectedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyUrl(tunnel)}
                      title="Copy URL"
                    >
                      {copiedId === tunnel.publicId ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(tunnel.publicId)}
                      disabled={deletingId === tunnel.publicId}
                      title="Delete tunnel"
                    >
                      {deletingId === tunnel.publicId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 text-destructive" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ephemeral tunnels (read-only) */}
      {ephemeralTunnels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Sessions ({ephemeralTunnels.length})</CardTitle>
            <CardDescription>
              Temporary tunnels created via CLI. These are automatically cleaned
              up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ephemeralTunnels.map((tunnel) => (
                <div
                  key={tunnel.publicId}
                  className="flex items-center justify-between rounded-md border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Circle
                        className={`h-2 w-2 ${
                          tunnel.status === "online"
                            ? "fill-green-500 text-green-500"
                            : "fill-muted-foreground text-muted-foreground"
                        }`}
                      />
                      <a
                        href={tunnel.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-sm font-medium hover:underline"
                      >
                        {tunnel.url.replace("https://", "")}
                      </a>
                      <Badge variant="secondary">ephemeral</Badge>
                    </div>
                    {tunnel.name && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {tunnel.name}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-muted-foreground">
                      Created {new Date(tunnel.createdAt).toLocaleDateString()}
                      {tunnel.lastConnectedAt &&
                        ` - Last connected ${new Date(tunnel.lastConnectedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleCopyUrl(tunnel)}
                      title="Copy URL"
                    >
                      {copiedId === tunnel.publicId ? (
                        <Check className="h-4 w-4 text-green-500" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
