"use client";

import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Label } from "@cloudflare/kumo/components/label";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import {
  ArrowSquareOut,
  Check,
  Circle,
  Copy,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import * as React from "react";
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

    if (result.isOk()) {
      setTunnels((prev) => [result.value, ...prev]);
      setShowCreateForm(false);
      setSubdomain("");
      setTunnelName("");
    } else {
      setError(result.error.message);
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

    if (result.isOk()) {
      setTunnels((prev) => prev.filter((t) => t.publicId !== publicId));
    } else {
      setError(result.error.message);
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

      if (result.isErr()) {
        setSubdomainError(result.error.message);
      } else if (!result.value.available) {
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
      {error && <Banner variant="error">{error}</Banner>}

      {/* Create tunnel section */}
      {!showCreateForm ? (
        <Button
          onClick={() => setShowCreateForm(true)}
          icon={<Plus size={16} />}
        >
          New Tunnel
        </Button>
      ) : (
        <Surface className="rounded-lg border border-kumo-line">
          <div className="p-6 space-y-2">
            <Text variant="heading3">Create Named Tunnel</Text>
            <Text variant="secondary">
              Reserve a persistent subdomain for your tunnel endpoint.
            </Text>
          </div>
          <div className="px-6 pb-6 space-y-4">
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
                <span className="text-kumo-subtle">.tunnel.io</span>
                {checkingSubdomain && <Loader size="sm" />}
              </div>
              {subdomainError && (
                <p className="text-sm text-kumo-danger">{subdomainError}</p>
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
                    <Loader size="sm" />
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
          </div>
        </Surface>
      )}

      {/* Named tunnels */}
      <Surface className="rounded-lg border border-kumo-line">
        <div className="p-6 space-y-2">
          <Text variant="heading3">Named Tunnels ({namedTunnels.length})</Text>
          <Text variant="secondary">
            {namedTunnels.length === 0
              ? "You haven't created any named tunnels yet"
              : "Persistent tunnel endpoints with custom subdomains"}
          </Text>
        </div>
        <div className="px-6 pb-6">
          {namedTunnels.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="rounded-full bg-kumo-elevated p-4">
                <ArrowSquareOut size={32} className="text-kumo-subtle" />
              </div>
              <h3 className="mt-4 text-lg font-semibold">No named tunnels</h3>
              <p className="mt-2 text-sm text-kumo-subtle">
                Create a named tunnel to reserve a persistent subdomain.
              </p>
              {!showCreateForm && (
                <Button
                  onClick={() => setShowCreateForm(true)}
                  className="mt-4"
                  icon={<Plus size={16} />}
                >
                  Create Tunnel
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {namedTunnels.map((tunnel) => (
                <div
                  key={tunnel.publicId}
                  className="flex items-center justify-between rounded-md border border-kumo-line p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Circle
                        size={8}
                        weight="fill"
                        className={
                          tunnel.status === "online"
                            ? "fill-kumo-success text-kumo-success"
                            : "fill-kumo-subtle text-kumo-subtle"
                        }
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
                      <p className="mt-1 text-sm text-kumo-subtle">
                        {tunnel.name}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-kumo-subtle">
                      Created {new Date(tunnel.createdAt).toLocaleDateString()}
                      {tunnel.lastConnectedAt &&
                        ` - Last connected ${new Date(tunnel.lastConnectedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      shape="square"
                      size="sm"
                      aria-label="Copy URL"
                      onClick={() => handleCopyUrl(tunnel)}
                      icon={
                        copiedId === tunnel.publicId ? (
                          <Check size={16} className="text-kumo-success" />
                        ) : (
                          <Copy size={16} />
                        )
                      }
                    />
                    <Button
                      variant="ghost"
                      shape="square"
                      size="sm"
                      aria-label="Delete tunnel"
                      onClick={() => handleDelete(tunnel.publicId)}
                      disabled={deletingId === tunnel.publicId}
                      icon={
                        deletingId === tunnel.publicId ? (
                          <Loader size="sm" />
                        ) : (
                          <Trash size={16} className="text-kumo-danger" />
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Surface>

      {/* Ephemeral tunnels (read-only) */}
      {ephemeralTunnels.length > 0 && (
        <Surface className="rounded-lg border border-kumo-line">
          <div className="p-6 space-y-2">
            <Text variant="heading3">
              Active Sessions ({ephemeralTunnels.length})
            </Text>
            <Text variant="secondary">
              Temporary tunnels created via CLI. These are automatically cleaned
              up.
            </Text>
          </div>
          <div className="px-6 pb-6">
            <div className="space-y-3">
              {ephemeralTunnels.map((tunnel) => (
                <div
                  key={tunnel.publicId}
                  className="flex items-center justify-between rounded-md border border-kumo-line p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Circle
                        size={8}
                        weight="fill"
                        className={
                          tunnel.status === "online"
                            ? "fill-kumo-success text-kumo-success"
                            : "fill-kumo-subtle text-kumo-subtle"
                        }
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
                      <p className="mt-1 text-sm text-kumo-subtle">
                        {tunnel.name}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-kumo-subtle">
                      Created {new Date(tunnel.createdAt).toLocaleDateString()}
                      {tunnel.lastConnectedAt &&
                        ` - Last connected ${new Date(tunnel.lastConnectedAt).toLocaleDateString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      shape="square"
                      size="sm"
                      aria-label="Copy URL"
                      onClick={() => handleCopyUrl(tunnel)}
                      icon={
                        copiedId === tunnel.publicId ? (
                          <Check size={16} className="text-kumo-success" />
                        ) : (
                          <Copy size={16} />
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Surface>
      )}
    </div>
  );
}
