"use client";

import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button, LinkButton } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import { ArrowSquareOut, Check, Copy } from "@phosphor-icons/react";
import * as React from "react";
import { completeBootstrap } from "#app/functions/bootstrap.ts";
import { getProviderDisplayName } from "#app/lib/auth-endpoints.ts";
import type { Config } from "#app/models/config.ts";
import { StepIndicator } from "#app/pages/bootstrap/StepIndicator.tsx";

type CompleteStepProps = {
  config: Config;
  configBase64: string;
};

function getZoneName(host: string): string {
  const parts = host.split(".");
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }
  return host;
}

export function CompleteStep({
  config,
  configBase64,
}: CompleteStepProps): React.ReactElement {
  const [isCopied, setIsCopied] = React.useState(false);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const serviceZone = getZoneName(config.service.host);
  const tunnelZone = getZoneName(config.tunnel.hostPattern.slice(2));

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(configBase64);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = configBase64;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    setError(null);

    try {
      const result = await completeBootstrap();
      if (result.success) {
        // Redirect to dashboard
        window.location.href = "/";
      } else {
        setError(result.error);
      }
    } finally {
      setIsCompleting(false);
    }
  };

  const provider = config.auth.providers[0];

  return (
    <>
      <StepIndicator currentStep="complete" />

      <Surface className="rounded-lg border border-kumo-line">
        <div className="p-6 space-y-2">
          <div className="flex items-center gap-2">
            <Check size={20} className="text-kumo-success" />
            <Text variant="heading3">Setup Complete!</Text>
          </div>
          <Text variant="secondary">
            Your DOtunnel service is configured and ready.
          </Text>
        </div>
        <div className="px-6 pb-6 space-y-6">
          {error && <Banner variant="error">{error}</Banner>}

          {/* Summary */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Configuration Summary</h4>
            <div className="rounded-md border border-kumo-line divide-y divide-kumo-line">
              <div className="flex items-center justify-between p-3">
                <span className="text-sm text-kumo-subtle">Auth Provider</span>
                <Badge variant="secondary">
                  {provider ? getProviderDisplayName(provider) : "None"}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="text-sm text-kumo-subtle">Service Host</span>
                <Badge variant="secondary" className="font-mono">
                  {config.service.host}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="text-sm text-kumo-subtle">
                  Tunnel Host Pattern
                </span>
                <Badge variant="secondary" className="font-mono">
                  {config.tunnel.hostPattern}
                </Badge>
              </div>
            </div>
          </div>

          {/* Wrangler Routes Configuration */}
          <Banner>
            <strong>Wrangler Routes Configuration</strong>
            <div className="mt-2 space-y-3">
              <p>
                Add these routes to your{" "}
                <code className="rounded bg-kumo-elevated px-1">
                  wrangler.jsonc
                </code>
                :
              </p>
              <div className="rounded-md bg-kumo-elevated p-3 font-mono text-xs overflow-auto">
                <pre>{`"routes": [
  {
    "pattern": "${config.service.host}/*",
    "zone_name": "${serviceZone}"
  },
  {
    "pattern": "${config.tunnel.hostPattern}/*",
    "zone_name": "${tunnelZone}"
  }
]`}</pre>
              </div>
            </div>
          </Banner>

          {/* Production Deployment */}
          <Banner>
            <strong>Production Deployment</strong>
            <div className="mt-2 space-y-3">
              <p>
                Your config is stored in the database. For production, set it as
                a static secret for optimal performance:
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium">1. Copy the config value:</p>
                <div className="relative">
                  <div className="rounded-md bg-kumo-elevated p-3 pr-12 font-mono text-xs break-all max-h-24 overflow-auto">
                    {configBase64}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    shape="square"
                    className="absolute right-1 top-1"
                    onClick={handleCopy}
                    aria-label="Copy config"
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

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  2. Set as secret and deploy:
                </p>
                <div className="rounded-md bg-kumo-elevated p-3 font-mono text-sm">
                  <p className="text-kumo-subtle"># Set config secret</p>
                  <p>wrangler secret put CONFIG</p>
                  <p className="text-kumo-subtle">
                    # Paste the base64 value when prompted
                  </p>
                  <p className="mt-2 text-kumo-subtle"># Deploy</p>
                  <p>wrangler deploy</p>
                </div>
              </div>
            </div>
          </Banner>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <LinkButton
              href="https://dash.cloudflare.com"
              external
              variant="outline"
              icon={<ArrowSquareOut size={16} />}
            >
              Cloudflare Dashboard
            </LinkButton>
            <Button onClick={handleComplete} disabled={isCompleting}>
              {isCompleting ? (
                <>
                  <Loader size="sm" />
                  Completing...
                </>
              ) : (
                "Go to Dashboard"
              )}
            </Button>
          </div>
        </div>
      </Surface>
    </>
  );
}
