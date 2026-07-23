import { Banner } from "@cloudflare/kumo/components/banner";
import { LinkButton } from "@cloudflare/kumo/components/button";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import { Key, WarningCircle } from "@phosphor-icons/react/ssr";
import type * as React from "react";

/**
 * Safe subset of an auth provider for rendering.
 * Never pass full provider configs here - element props are serialized
 * into the RSC payload, which would expose client secrets to the browser.
 */
export type LoginProvider = {
  id: string;
  name: string;
};

type LoginPageProps = {
  providers: LoginProvider[];
  returnTo: string;
  error?: string;
};

export function LoginPage({
  providers,
  returnTo,
  error,
}: LoginPageProps): React.ReactElement {
  return (
    <div className="min-h-screen bg-kumo-base">
      <div className="container mx-auto max-w-md px-4 py-16">
        <Surface className="rounded-lg border border-kumo-line">
          <div className="p-6 space-y-2">
            <Text variant="heading3">Sign in to DOtunnel</Text>
            <Text variant="secondary">
              Choose a provider to continue to your dashboard.
            </Text>
          </div>
          <div className="px-6 pb-6 space-y-6">
            {error && (
              <Banner variant="error">
                <WarningCircle size={16} className="inline mr-1" />
                <strong>Authentication Failed</strong> {error}
              </Banner>
            )}

            <div className="flex flex-col space-y-3">
              {providers.map((provider) => (
                <LinkButton
                  key={provider.id}
                  href={`/_auth/login?${new URLSearchParams({
                    provider_id: provider.id,
                    return_to: returnTo,
                  }).toString()}`}
                  size="lg"
                  variant="primary"
                  icon={<Key size={20} />}
                >
                  Sign in with {provider.name}
                </LinkButton>
              ))}
            </div>
          </div>
        </Surface>
      </div>
    </div>
  );
}
