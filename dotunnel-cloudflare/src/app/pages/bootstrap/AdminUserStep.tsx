"use client";

import { Banner } from "@cloudflare/kumo/components/banner";
import { LinkButton } from "@cloudflare/kumo/components/button";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import { Key, WarningCircle } from "@phosphor-icons/react";
import * as React from "react";

import { getProviderDisplayName } from "#app/lib/auth-endpoints.ts";
import type { Config } from "#app/models/config.ts";
import { StepIndicator } from "#app/pages/bootstrap/StepIndicator.tsx";

type AdminUserStepProps = {
  config: Config;
};

export function AdminUserStep({
  config,
}: AdminUserStepProps): React.ReactElement {
  const provider = config.auth.providers[0];

  // Check for error in URL (from OAuth callback)
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const errorParam = params.get("error");
      if (errorParam) {
        setError(errorParam);
        // Clean up URL
        const url = new URL(window.location.href);
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.pathname);
      }
    }
  }, []);

  if (!provider) {
    return (
      <Banner variant="error">
        No auth provider configured. Please go back and configure one.
      </Banner>
    );
  }

  const providerName = getProviderDisplayName(provider);

  // Build OAuth authorization URL (relative URL works fine)
  const authUrl = `/_auth/login?${new URLSearchParams({
    provider_id: provider.id,
    bootstrap: "true",
  }).toString()}`;

  return (
    <>
      <StepIndicator currentStep="admin" />

      <Surface className="rounded-lg border border-kumo-line">
        <div className="p-6 space-y-2">
          <Text variant="heading3">Create Administrator Account</Text>
          <Text variant="secondary">
            Sign in with {providerName} to create the initial administrator
            account.
          </Text>
        </div>
        <div className="px-6 pb-6 space-y-6">
          {error && (
            <Banner variant="error">
              <WarningCircle size={16} className="inline mr-1" />
              <strong>Authentication Failed</strong> {error}
            </Banner>
          )}

          <Banner>
            The first user to sign in will become the administrator of this
            DOtunnel instance.
          </Banner>

          <div className="flex flex-col items-center space-y-4 py-8">
            <p className="text-center text-kumo-subtle">
              Click the button below to sign in with your configured provider.
            </p>

            <LinkButton
              href={authUrl}
              size="lg"
              variant="primary"
              icon={<Key size={20} />}
            >
              Sign in with {providerName}
            </LinkButton>
          </div>

          <div className="border-t border-kumo-line pt-4">
            <p className="text-center text-sm text-kumo-subtle">
              Configured provider: <strong>{providerName}</strong>
              {provider.type === "oidc" && (
                <span className="block text-xs">({provider.issuer})</span>
              )}
            </p>
          </div>
        </div>
      </Surface>
    </>
  );
}
