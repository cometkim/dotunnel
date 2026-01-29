"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";
import { Alert, AlertDescription } from "#app/components/ui/alert.tsx";
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
import {
  discoverOIDCEndpoints,
  saveAuthProvider,
} from "#app/functions/bootstrap.ts";
import type { AuthProvider, Config } from "#app/models/config.ts";
import { StepIndicator } from "#app/pages/bootstrap/StepIndicator.tsx";

type AuthProviderStepProps = {
  config: Config;
};

type ProviderType = "github" | "google" | "oidc";

export function AuthProviderStep({
  config: _config,
}: AuthProviderStepProps): React.ReactElement {
  const [providerType, setProviderType] = React.useState<ProviderType>("oidc");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isFetchingDiscovery, setIsFetchingDiscovery] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Common fields
  const [clientId, setClientId] = React.useState("");
  const [clientSecret, setClientSecret] = React.useState("");

  // OIDC-specific fields
  const [name, setName] = React.useState("");
  const [issuer, setIssuer] = React.useState("");
  const [authorizationEndpoint, setAuthorizationEndpoint] = React.useState("");
  const [tokenEndpoint, setTokenEndpoint] = React.useState("");
  const [userinfoEndpoint, setUserinfoEndpoint] = React.useState("");
  const [jwksUri, setJwksUri] = React.useState("");

  const handleFetchDiscovery = async () => {
    if (!issuer) {
      setError("Please enter an issuer URL");
      return;
    }

    setIsFetchingDiscovery(true);
    setError(null);

    try {
      const result = await discoverOIDCEndpoints(issuer);
      if (result.success) {
        setAuthorizationEndpoint(result.discovery.authorization_endpoint);
        setTokenEndpoint(result.discovery.token_endpoint);
        setUserinfoEndpoint(result.discovery.userinfo_endpoint ?? "");
        setJwksUri(result.discovery.jwks_uri);
      } else {
        setError(result.error);
      }
    } finally {
      setIsFetchingDiscovery(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let provider: AuthProvider;
      const id = crypto.randomUUID();

      switch (providerType) {
        case "github":
          provider = {
            id,
            type: "github",
            clientId,
            clientSecret,
          };
          break;

        case "google":
          provider = {
            id,
            type: "google",
            clientId,
            clientSecret,
          };
          break;

        case "oidc":
          if (!authorizationEndpoint || !tokenEndpoint || !jwksUri) {
            setError(
              "Please fetch OIDC configuration or fill in all endpoints",
            );
            setIsLoading(false);
            return;
          }
          provider = {
            id,
            type: "oidc",
            name: name || "Custom OIDC",
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

      const result = await saveAuthProvider(provider);
      if (result.success) {
        // Reload to proceed to next step
        window.location.reload();
      } else {
        setError(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getHelpText = () => {
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

  return (
    <>
      <StepIndicator currentStep="auth" />

      <Card>
        <CardHeader>
          <CardTitle>Configure Authentication Provider</CardTitle>
          <CardDescription>
            Set up an OAuth/OIDC provider for admin authentication.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

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
              {getHelpText()}
            </div>

            {providerType === "oidc" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Display Name</Label>
                  <Input
                    id="name"
                    placeholder="Auth0"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
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
                      onChange={(e) => setAuthorizationEndpoint(e.target.value)}
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

            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </>
  );
}
