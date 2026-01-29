"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Save,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#app/components/ui/select.tsx";
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
    if (result.success) {
      setAuthorizationEndpoint(result.discovery.authorization_endpoint);
      setTokenEndpoint(result.discovery.token_endpoint);
      setUserinfoEndpoint(result.discovery.userinfo_endpoint ?? "");
      setJwksUri(result.discovery.jwks_uri);
    } else {
      setError(result.error);
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
    if (result.success) {
      setSavedConfig(result.config);
      setSuccess("Configuration saved successfully");
    } else {
      setError(result.error);
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
          <p className="text-sm text-muted-foreground">
            Create an OAuth App at{" "}
            <a
              href="https://github.com/settings/developers"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              GitHub Developer Settings
            </a>
          </p>
        );
      case "google":
        return (
          <p className="text-sm text-muted-foreground">
            Create OAuth credentials at{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              Google Cloud Console
            </a>
          </p>
        );
      case "oidc":
        return (
          <p className="text-sm text-muted-foreground">
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
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      )}

      {/* Unsaved changes warning */}
      {hasChanges && (
        <Alert>
          <AlertDescription>You have unsaved changes.</AlertDescription>
        </Alert>
      )}

      {/* Config Source */}
      <Card>
        <CardHeader>
          <CardTitle>Configuration Source</CardTitle>
          <CardDescription>
            Where the current configuration is loaded from
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Badge
              variant={source === "static" ? "default" : "secondary"}
              className="text-sm"
            >
              {source === "static" ? "Static Secret (CONFIG)" : "D1 Database"}
            </Badge>
            <p className="text-sm text-muted-foreground">
              {source === "database"
                ? "Changes will be persisted to the database."
                : "Configuration is loaded from CONFIG secret. Changes here require redeployment."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Hosts Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Hosts Configuration</CardTitle>
          <CardDescription>
            Configure the service host and tunnel host pattern
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="serviceHost">Service Host</Label>
              <Input
                id="serviceHost"
                value={serviceHost}
                onChange={(e) => setServiceHost(e.target.value)}
                placeholder="dotunnel.example.com"
              />
              <p className="text-xs text-muted-foreground">
                Hostname for the admin dashboard and API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="tunnelHostPattern">Tunnel Host Pattern</Label>
              <Input
                id="tunnelHostPattern"
                value={tunnelHostPattern}
                onChange={(e) => setTunnelHostPattern(e.target.value)}
                placeholder="*.tunnel.io"
              />
              <p className="text-xs text-muted-foreground">
                Wildcard pattern for tunnel endpoints (must start with *.)
              </p>
            </div>
          </div>

          {isValid && serviceHost && tunnelHostPattern && (
            <div className="rounded-md border p-4 space-y-2">
              <h4 className="text-sm font-medium">Request Routing</h4>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 text-xs">
                    {serviceHost}
                  </code>
                  <span className="text-muted-foreground">
                    → Dashboard & API
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="rounded bg-muted px-2 py-1 text-xs">
                    {tunnelHostPattern}
                  </code>
                  <span className="text-muted-foreground">
                    → Tunnel endpoints
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auth Providers */}
      <Card>
        <CardHeader>
          <CardTitle>Auth Providers ({providers.length})</CardTitle>
          <CardDescription>
            Configured authentication providers for user sign-in
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No providers configured
            </p>
          ) : (
            <div className="space-y-4">
              {providers.map((provider) => {
                const details = getProviderDetails(provider);
                return (
                  <div
                    key={provider.id}
                    className="rounded-md border p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                          <KeyRound className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {getProviderDisplayName(provider)}
                          </p>
                          <p className="text-sm text-muted-foreground">
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
                          size="sm"
                          onClick={() => handleDeleteProvider(provider.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Client ID</span>
                        <code className="rounded bg-muted px-2 py-0.5 text-xs">
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
          <div className="rounded-md border border-dashed">
            <button
              type="button"
              className="w-full p-4 flex items-center justify-between text-left hover:bg-muted/50 transition-colors"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span className="font-medium">Add Provider</span>
              </div>
              {showAddForm ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>

            {showAddForm && (
              <form
                onSubmit={handleAddProvider}
                className="p-4 pt-0 space-y-4 border-t"
              >
                <div className="space-y-2">
                  <Label htmlFor="providerType">Provider Type</Label>
                  <Select
                    value={providerType}
                    onValueChange={(v) => setProviderType(v as ProviderType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="github">GitHub (OAuth)</SelectItem>
                      <SelectItem value="google">Google (OIDC)</SelectItem>
                      <SelectItem value="oidc">
                        Custom OIDC (Auth0, Okta, etc.)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  {getProviderHelpText()}
                </div>

                {providerType === "oidc" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="providerName">Display Name</Label>
                      <Input
                        id="providerName"
                        placeholder="Auth0"
                        value={providerName}
                        onChange={(e) => setProviderName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="issuer">Issuer URL</Label>
                      <div className="flex gap-2">
                        <Input
                          id="issuer"
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
                          {isFetchingDiscovery ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Fetch"
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-md border p-4">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Endpoints (auto-filled from discovery)
                      </h4>

                      <div className="space-y-2">
                        <Label htmlFor="authorizationEndpoint">
                          Authorization Endpoint
                        </Label>
                        <Input
                          id="authorizationEndpoint"
                          placeholder="https://..."
                          value={authorizationEndpoint}
                          onChange={(e) =>
                            setAuthorizationEndpoint(e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tokenEndpoint">Token Endpoint</Label>
                        <Input
                          id="tokenEndpoint"
                          placeholder="https://..."
                          value={tokenEndpoint}
                          onChange={(e) => setTokenEndpoint(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="userinfoEndpoint">
                          UserInfo Endpoint (optional)
                        </Label>
                        <Input
                          id="userinfoEndpoint"
                          placeholder="https://..."
                          value={userinfoEndpoint}
                          onChange={(e) => setUserinfoEndpoint(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="jwksUri">JWKS URI</Label>
                        <Input
                          id="jwksUri"
                          placeholder="https://..."
                          value={jwksUri}
                          onChange={(e) => setJwksUri(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="clientId">Client ID</Label>
                  <Input
                    id="clientId"
                    placeholder="Enter client ID"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="clientSecret">Client Secret</Label>
                  <Input
                    id="clientSecret"
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
                  <Button type="submit" disabled={!clientId || !clientSecret}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Provider
                  </Button>
                </div>
              </form>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Wrangler Routes */}
      <Card>
        <CardHeader>
          <CardTitle>Wrangler Routes Configuration</CardTitle>
          <CardDescription>
            Add these routes to your wrangler.jsonc file
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md bg-muted p-4 font-mono text-sm overflow-auto">
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
        </CardContent>
      </Card>

      {/* Export / Save Section */}
      <Card>
        <CardHeader>
          <CardTitle>
            {source === "database"
              ? "Save Configuration"
              : "Export Configuration"}
          </CardTitle>
          <CardDescription>
            {source === "database"
              ? "Save changes to the database, then export for production deployment"
              : "Copy the base64-encoded configuration for deployment"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Base64 Preview */}
          <div className="space-y-2">
            <Label>Base64-encoded Configuration</Label>
            <div className="relative">
              <div className="rounded-md bg-muted p-3 pr-12 font-mono text-xs break-all max-h-32 overflow-auto">
                {liveBase64}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1"
                onClick={handleCopyConfig}
                title="Copy to clipboard"
              >
                {isCopied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Deployment instructions */}
          <div className="rounded-md bg-muted p-3 font-mono text-sm">
            <p className="text-muted-foreground"># Set config secret</p>
            <p>wrangler secret put CONFIG</p>
            <p className="text-muted-foreground mt-2"># Deploy</p>
            <p>wrangler deploy</p>
          </div>

          {/* Action Button */}
          <div className="flex justify-end pt-4 border-t">
            {source === "database" ? (
              <Button
                onClick={handleSave}
                disabled={isSaving || !hasChanges || !isValid}
                size="lg"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" />
                    Save Configuration
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleCopyConfig} size="lg">
                {isCopied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy Configuration
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
