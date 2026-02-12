"use client";

import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Label } from "@cloudflare/kumo/components/label";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Select } from "@cloudflare/kumo/components/select";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import {
  CaretDown,
  CaretUp,
  Check,
  Copy,
  FloppyDisk,
  Key,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import * as React from "react";
import { discoverOIDCEndpoints, saveFullConfig } from "#app/functions/admin.ts";
import { getProviderDisplayName } from "#app/lib/auth-endpoints.ts";
import type { AuthProvider, Config } from "#app/models/config.ts";

/**
 * Encode config as base64 JSON (client-side).
 */
function encodeConfigBase64(config: Config): string {
  const json = JSON.stringify(config);
  return btoa(json);
}

type ConfigPageClientProps = {
  config: Config;
  source: "static" | "database";
};

function getZoneName(host: string): string {
  const parts = host.split(".");
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }
  return host;
}

type ProviderType = "github" | "google" | "oidc";

export function ConfigPageClient({
  config: initialConfig,
  source,
}: ConfigPageClientProps): React.ReactElement {
  // Editable config state
  const [serviceHost, setServiceHost] = React.useState(
    initialConfig.service.host,
  );
  const [tunnelHostPattern, setTunnelHostPattern] = React.useState(
    initialConfig.tunnel.hostPattern,
  );
  const [providers, setProviders] = React.useState<AuthProvider[]>(
    initialConfig.auth.providers,
  );

  // Saved state reference (to compare for changes)
  const [savedConfig, setSavedConfig] = React.useState(initialConfig);

  // UI state
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [isCopied, setIsCopied] = React.useState(false);

  // Add provider form state
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [providerType, setProviderType] = React.useState<ProviderType>("oidc");
  const [isFetchingDiscovery, setIsFetchingDiscovery] = React.useState(false);

  // Provider form fields
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");
  const [providerName, setProviderName] = React.useState("");
  const [issuer, setIssuer] = React.useState("");
  const [authorizationEndpoint, setAuthorizationEndpoint] = React.useState("");
  const [tokenEndpoint, setTokenEndpoint] = React.useState("");
  const [userinfoEndpoint, setUserinfoEndpoint] = React.useState("");
  const [jwksUri, setJwksUri] = React.useState("");

  // Compute current config from state
  const currentConfig: Config = React.useMemo(
    () => ({
      ...savedConfig,
      service: { host: serviceHost },
      tunnel: { hostPattern: tunnelHostPattern },
      auth: { providers },
    }),
    [savedConfig, serviceHost, tunnelHostPattern, providers],
  );

  // Track if there are unsaved changes
  const hasChanges = React.useMemo(() => {
    return JSON.stringify(currentConfig) !== JSON.stringify(savedConfig);
  }, [currentConfig, savedConfig]);

  // Validation
  const isValid =
    serviceHost && (!tunnelHostPattern || tunnelHostPattern.startsWith("*."));

  // Compute live base64 preview (client-side)
  const liveBase64 = React.useMemo(
    () => encodeConfigBase64(currentConfig),
    [currentConfig],
  );

  // Navigation guard for unsaved changes
  React.useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasChanges) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasChanges]);

  // Intercept link clicks for navigation guard
  React.useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest("a");
      if (link && hasChanges) {
        const href = link.getAttribute("href");
        // Only guard internal navigation
        if (href?.startsWith("/") && !href.startsWith("/_auth")) {
          const confirmed = window.confirm(
            "You have unsaved changes. Are you sure you want to leave this page?",
          );
          if (!confirmed) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [hasChanges]);

  const resetProviderForm = () => {
    setClientId("");
    setClientSecret("");
    setProviderName("");
    setIssuer("");
    setAuthorizationEndpoint("");
    setTokenEndpoint("");
    setUserinfoEndpoint("");
    setJwksUri("");
    setProviderType("oidc");
  };

  const handleFetchDiscovery = async () => {
    if (!issuer) {
      setError("Please enter an issuer URL");
      return;
    }

    setIsFetchingDiscovery(true);
    setError(null);

    const result = await discoverOIDCEndpoints(issuer);
    if (result.isOk()) {
      setAuthorizationEndpoint(result.value.authorization_endpoint);
      setTokenEndpoint(result.value.token_endpoint);
      setUserinfoEndpoint(result.value.userinfo_endpoint ?? "");
      setJwksUri(result.value.jwks_uri);
    } else {
      setError(result.error.message);
    }
    setIsFetchingDiscovery(false);
  };

  const handleAddProvider = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let provider: AuthProvider;
    const id = crypto.randomUUID();

    switch (providerType) {
      case "github":
        provider = { id, type: "github", clientId, clientSecret };
        break;
      case "google":
        provider = { id, type: "google", clientId, clientSecret };
        break;
      case "oidc":
        if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
          setError("Please fetch OIDC configuration or fill in all endpoints");
          return;
        }
        provider = {
          id,
          type: "oidc",
          name: providerName || "Custom OIDC",
          issuer,
          clientId,
          clientSecret,
          authorizationEndpoint,
          tokenEndpoint,
          userinfoEndpoint: userinfoEndpoint || undefined,
          jwksUri,
        };
        break;
    }

    setProviders([...providers, provider]);
    resetProviderForm();
    setShowAddForm(false);
  };

  const handleDeleteProvider = (providerId: string) => {
    if (providers.length === 1) {
      setError("Cannot delete the last auth provider");
      return;
    }

    if (!confirm("Are you sure you want to delete this provider?")) {
      return;
    }

    setProviders(providers.filter((p) => p.id !== providerId));
  };

  const handleSave = async () => {
    if (!isValid) {
      setError("Please fix validation errors before saving");
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    const result = await saveFullConfig(currentConfig);
    if (result.isOk()) {
      setSavedConfig(result.value.config);
      setSuccess("Configuration saved successfully");
    } else {
      setError(result.error.message);
    }
    setIsSaving(false);
  };

  const handleCopyConfig = async () => {
    try {
      await navigator.clipboard.writeText(liveBase64);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = liveBase64;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const getProviderDetails = (provider: AuthProvider) => {
    switch (provider.type) {
      case "github":
        return { issuer: "github.com", clientId: provider.clientId };
      case "google":
        return { issuer: "accounts.google.com", clientId: provider.clientId };
      case "oidc":
        return { issuer: provider.issuer, clientId: provider.clientId };
    }
  };

  const getProviderHelpText = () => {
    switch (providerType) {
      case "github":
        return (
          <p className="text-sm text-kumo-subtle">
            Create an OAuth App at{" "}
            <a
              href="https://github.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="text-kumo-brand underline"
            >
              GitHub Developer Settings
            </a>
          </p>
        );
      case "google":
        return (
          <p className="text-sm text-kumo-subtle">
            Create OAuth credentials at{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-kumo-brand underline"
            >
              Google Cloud Console
            </a>
          </p>
        );
      case "oidc":
        return (
          <p className="text-sm text-kumo-subtle">
            Enter your OIDC provider details (Auth0, Okta, Keycloak, etc.)
          </p>
        );
    }
  };

  const serviceZone = serviceHost ? getZoneName(serviceHost) : "example.com";
  const tunnelZone = tunnelHostPattern
    ? getZoneName(tunnelHostPattern.slice(2))
    : "tunnel.io";

  return (
    <div className="space-y-6">
      {error && <Banner variant="error">{error}</Banner>}

      {success && <Banner>{success}</Banner>}

      {/* Unsaved changes warning */}
      {hasChanges && <Banner variant="alert">You have unsaved changes.</Banner>}

      {/* Config Source */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <Text variant="heading3">Configuration Source</Text>
          <Text variant="secondary">
            Where the current configuration is loaded from
          </Text>
        </div>
        <div className="flex items-center gap-4">
          <Badge
            variant={source === "static" ? "primary" : "secondary"}
            className="text-sm"
          >
            {source === "static" ? "Static Secret (CONFIG)" : "D1 Database"}
          </Badge>
          <p className="text-sm text-kumo-subtle">
            {source === "database"
              ? "Changes will be persisted to the database."
              : "Configuration is loaded from CONFIG secret. Changes here require redeployment."}
          </p>
        </div>
      </Surface>

      {/* Hosts Configuration */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <Text variant="heading3">Hosts Configuration</Text>
          <Text variant="secondary">
            Configure the service host and tunnel host pattern
          </Text>
        </div>
        <div className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Service Host</Label>
              <Input
                aria-label="Service Host"
                value={serviceHost}
                onChange={(e) => setServiceHost(e.target.value)}
                placeholder="dotunnel.example.com"
              />
              <p className="text-xs text-kumo-subtle">
                Hostname for the admin dashboard and API
              </p>
            </div>

            <div className="space-y-2">
              <Label>Tunnel Host Pattern</Label>
              <Input
                aria-label="Tunnel Host Pattern"
                value={tunnelHostPattern}
                onChange={(e) => setTunnelHostPattern(e.target.value)}
                placeholder="*.tunnel.io"
              />
              <p className="text-xs text-kumo-subtle">
                Wildcard pattern for tunnel endpoints (must start with *.)
              </p>
            </div>
          </div>

          {isValid && serviceHost && tunnelHostPattern && (
            <div className="rounded-md border border-kumo-line p-4 space-y-2">
              <h4 className="text-sm font-medium">Request Routing</h4>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-kumo-elevated px-2 py-1 text-xs">
                    {serviceHost}
                  </code>
                  <span className="text-kumo-subtle">→ Dashboard & API</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-kumo-elevated px-2 py-1 text-xs">
                    {tunnelHostPattern}
                  </code>
                  <span className="text-kumo-subtle">→ Tunnel endpoints</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Surface>

      {/* Auth Providers */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <Text variant="heading3">Auth Providers ({providers.length})</Text>
          <Text variant="secondary">
            Configured authentication providers for user sign-in
          </Text>
        </div>
        <div className="space-y-4">
          {providers.length === 0 ? (
            <p className="text-sm text-kumo-subtle">No providers configured</p>
          ) : (
            <div className="space-y-4">
              {providers.map((provider) => {
                const details = getProviderDetails(provider);
                return (
                  <div
                    key={provider.id}
                    className="rounded-md border border-kumo-line p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-elevated">
                          <Key size={20} />
                        </div>
                        <div>
                          <p className="font-medium">
                            {getProviderDisplayName(provider)}
                          </p>
                          <p className="text-sm text-kumo-subtle">
                            {details.issuer}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">
                          {provider.type.toUpperCase()}
                        </Badge>
                        <Button
                          variant="destructive"
                          shape="square"
                          size="sm"
                          aria-label="Delete provider"
                          icon={<Trash size={16} />}
                          onClick={() => handleDeleteProvider(provider.id)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-kumo-subtle">Client ID</span>
                        <code className="rounded bg-kumo-elevated px-2 py-0.5 text-xs">
                          {details.clientId.slice(0, 20)}...
                        </code>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Provider Form */}
          <div className="rounded-md border border-dashed border-kumo-line">
            <button
              type="button"
              className="w-full p-4 flex items-center justify-between text-left hover:bg-kumo-elevated/50 transition-colors"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <div className="flex items-center gap-2">
                <Plus size={16} />
                <span className="font-medium">Add Provider</span>
              </div>
              {showAddForm ? <CaretUp size={16} /> : <CaretDown size={16} />}
            </button>

            {showAddForm && (
              <form
                onSubmit={handleAddProvider}
                className="p-4 pt-0 space-y-4 border-t border-kumo-line"
              >
                <div className="space-y-2">
                  <Label>Provider Type</Label>
                  <Select
                    value={providerType}
                    onValueChange={(v) => setProviderType(v as ProviderType)}
                  >
                    <Select.Option value="github">GitHub (OAuth)</Select.Option>
                    <Select.Option value="google">Google (OIDC)</Select.Option>
                    <Select.Option value="oidc">
                      Custom OIDC (Auth0, Okta, etc.)
                    </Select.Option>
                  </Select>
                  {getProviderHelpText()}
                </div>

                {providerType === "oidc" && (
                  <>
                    <div className="space-y-2">
                      <Label>Display Name</Label>
                      <Input
                        aria-label="Display Name"
                        placeholder="Auth0"
                        value={providerName}
                        onChange={(e) => setProviderName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Issuer URL</Label>
                      <div className="flex gap-2">
                        <Input
                          aria-label="Issuer URL"
                          placeholder="https://mytenant.auth0.com"
                          value={issuer}
                          onChange={(e) => setIssuer(e.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleFetchDiscovery}
                          disabled={isFetchingDiscovery || !issuer}
                        >
                          {isFetchingDiscovery ? <Loader /> : "Fetch"}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-md border border-kumo-line p-4">
                      <h4 className="text-sm font-medium text-kumo-subtle">
                        Endpoints (auto-filled from discovery)
                      </h4>

                      <div className="space-y-2">
                        <Label>Authorization Endpoint</Label>
                        <Input
                          aria-label="Authorization Endpoint"
                          placeholder="https://..."
                          value={authorizationEndpoint}
                          onChange={(e) =>
                            setAuthorizationEndpoint(e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Token Endpoint</Label>
                        <Input
                          aria-label="Token Endpoint"
                          placeholder="https://..."
                          value={tokenEndpoint}
                          onChange={(e) => setTokenEndpoint(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>UserInfo Endpoint (optional)</Label>
                        <Input
                          aria-label="UserInfo Endpoint"
                          placeholder="https://..."
                          value={userinfoEndpoint}
                          onChange={(e) => setUserinfoEndpoint(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>JWKS URI</Label>
                        <Input
                          aria-label="JWKS URI"
                          placeholder="https://..."
                          value={jwksUri}
                          onChange={(e) => setJwksUri(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label>Client ID</Label>
                  <Input
                    aria-label="Client ID"
                    placeholder="Enter client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label>Client Secret</Label>
                  <Input
                    aria-label="Client Secret"
                    type="password"
                    placeholder="Enter client secret"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    required
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      resetProviderForm();
                      setShowAddForm(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={!clientId || !clientSecret}
                    icon={<Plus size={16} />}
                  >
                    Add Provider
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      </Surface>

      {/* Wrangler Routes */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <Text variant="heading3">Wrangler Routes Configuration</Text>
          <Text variant="secondary">
            Add these routes to your wrangler.jsonc file
          </Text>
        </div>
        <div className="rounded-md bg-kumo-elevated p-4 font-mono text-sm overflow-auto">
          <pre>{`"routes": [
  {
    "pattern": "${serviceHost || "dotunnel.example.com"}/*",
    "zone_name": "${serviceZone}"
  },
  {
    "pattern": "${tunnelHostPattern || "*.tunnel.io"}/*",
    "zone_name": "${tunnelZone}"
  }
]`}</pre>
        </div>
      </Surface>

      {/* Export / Save Section */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <Text variant="heading3">
            {source === "database"
              ? "Save Configuration"
              : "Export Configuration"}
          </Text>
          <Text variant="secondary">
            {source === "database"
              ? "Save changes to the database, then export for production deployment"
              : "Copy the base64-encoded configuration for deployment"}
          </Text>
        </div>
        <div className="space-y-4">
          {/* Base64 Preview */}
          <div className="space-y-2">
            <Label>Base64-encoded Configuration</Label>
            <div className="relative">
              <div className="rounded-md bg-kumo-elevated p-3 pr-12 font-mono text-xs break-all max-h-32 overflow-auto">
                {liveBase64}
              </div>
              <Button
                type="button"
                variant="ghost"
                shape="square"
                size="sm"
                className="absolute right-1 top-1"
                onClick={handleCopyConfig}
                aria-label="Copy to clipboard"
                icon={
                  isCopied ? (
                    <Check size={16} className="text-kumo-success" />
                  ) : (
                    <Copy size={16} />
                  )
                }
              />
            </div>
          </div>

          {/* Deployment instructions */}
          <div className="rounded-md bg-kumo-elevated p-3 font-mono text-sm">
            <p className="text-kumo-subtle"># Set config secret</p>
            <p>wrangler secret put CONFIG</p>
            <p className="text-kumo-subtle mt-2"># Deploy</p>
            <p>wrangler deploy</p>
          </div>

          {/* Action Button */}
          <div className="flex justify-end pt-4 border-t border-kumo-line">
            {source === "database" ? (
              <Button
                onClick={handleSave}
                disabled={isSaving || !hasChanges || !isValid}
                size="lg"
                variant="primary"
                icon={isSaving ? undefined : <FloppyDisk size={16} />}
              >
                {isSaving ? (
                  <>
                    <Loader />
                    Saving...
                  </>
                ) : (
                  "Save Configuration"
                )}
              </Button>
            ) : (
              <Button
                onClick={handleCopyConfig}
                size="lg"
                variant="primary"
                icon={isCopied ? <Check size={16} /> : <Copy size={16} />}
              >
                {isCopied ? "Copied!" : "Copy Configuration"}
              </Button>
            )}
          </div>
        </div>
      </Surface>
    </div>
  );
}
