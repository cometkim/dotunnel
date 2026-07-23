"use client";

import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Label } from "@cloudflare/kumo/components/label";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Select } from "@cloudflare/kumo/components/select";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import * as React from "react";
import {
  discoverOIDCEndpoints,
  saveAuthProvider,
} from "#app/functions/bootstrap.ts";
import type { AuthProviderInput, PublicConfig } from "#app/models/config.ts";
import { StepIndicator } from "#app/pages/bootstrap/StepIndicator.tsx";

type AuthProviderStepProps = {
  config: PublicConfig;
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
      let provider: AuthProviderInput;
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

  return (
    <>
      <StepIndicator currentStep="auth" />

      <Surface className="rounded-lg border border-kumo-line">
        <div className="p-6 space-y-2">
          <Text variant="heading3">Configure Authentication Provider</Text>
          <Text variant="secondary">
            Set up an OAuth/OIDC provider for admin authentication.
          </Text>
        </div>
        <div className="px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <Banner variant="error">{error}</Banner>}

            <div className="space-y-2">
              <Label htmlFor="providerType">Provider Type</Label>
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
                      {isFetchingDiscovery ? <Loader size="sm" /> : "Fetch"}
                    </Button>
                  </div>
                </div>

                <div className="space-y-4 rounded-md border border-kumo-line p-4">
                  <h4 className="text-sm font-medium text-kumo-subtle">
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
                    <Loader size="sm" />
                    Saving...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </form>
        </div>
      </Surface>
    </>
  );
}
