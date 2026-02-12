"use client";

import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Label } from "@cloudflare/kumo/components/label";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import { ArrowLeft } from "@phosphor-icons/react";
import * as React from "react";
import { saveHostsConfig } from "#app/functions/bootstrap.ts";
import type { Config } from "#app/models/config.ts";
import { StepIndicator } from "#app/pages/bootstrap/StepIndicator.tsx";

type TunnelConfigStepProps = {
  config: Config;
};

function getZoneName(host: string): string {
  // Extract the root domain (last two parts) for zone_name
  const parts = host.split(".");
  if (parts.length >= 2) {
    return parts.slice(-2).join(".");
  }
  return host;
}

export function TunnelConfigStep({
  config,
}: TunnelConfigStepProps): React.ReactElement {
  const [serviceHost, setServiceHost] = React.useState(
    config.service.host || "",
  );
  const [tunnelHostPattern, setTunnelHostPattern] = React.useState(
    config.tunnel.hostPattern || "",
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const isValid = serviceHost && tunnelHostPattern.startsWith("*.");

  // Extract zone names for wrangler config example
  const serviceZone = serviceHost ? getZoneName(serviceHost) : "example.com";
  const tunnelZone = tunnelHostPattern
    ? getZoneName(tunnelHostPattern.slice(2))
    : "tunnel.io";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await saveHostsConfig(serviceHost, tunnelHostPattern);
      if (result.success) {
        window.location.reload();
      } else {
        setError(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <StepIndicator currentStep="tunnel" />

      <Surface className="rounded-lg border border-kumo-line">
        <div className="p-6 space-y-2">
          <Text variant="heading3">Configure Hosts</Text>
          <Text variant="secondary">
            Set up the service host and tunnel host pattern. These can be on
            completely different domains.
          </Text>
        </div>
        <div className="px-6 pb-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <Banner variant="error">{error}</Banner>}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serviceHost">Service Host</Label>
                <Input
                  id="serviceHost"
                  placeholder="dotunnel.example.com"
                  value={serviceHost}
                  onChange={(e) => setServiceHost(e.target.value)}
                  required
                />
                <p className="text-sm text-kumo-subtle">
                  The host for the dashboard & API (e.g.,{" "}
                  <code className="rounded bg-kumo-elevated px-1">
                    dotunnel.example.com
                  </code>
                  )
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tunnelHostPattern">Tunnel Host Pattern</Label>
                <Input
                  id="tunnelHostPattern"
                  placeholder="*.tunnel.io"
                  value={tunnelHostPattern}
                  onChange={(e) => setTunnelHostPattern(e.target.value)}
                  required
                />
                <p className="text-sm text-kumo-subtle">
                  Wildcard pattern for tunnel endpoints. Must start with{" "}
                  <code className="rounded bg-kumo-elevated px-1">*.</code>{" "}
                  (e.g.,{" "}
                  <code className="rounded bg-kumo-elevated px-1">
                    *.tunnel.io
                  </code>
                  )
                </p>
              </div>
            </div>

            {isValid && (
              <div className="rounded-md border border-kumo-line p-4 space-y-3">
                <h4 className="text-sm font-medium">Request Routing</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-kumo-subtle">
                      {serviceHost}
                    </span>
                    <span className="text-kumo-subtle">&rarr;</span>
                    <span>Service dashboard & API</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-kumo-subtle">
                      {tunnelHostPattern}
                    </span>
                    <span className="text-kumo-subtle">&rarr;</span>
                    <span>Tunnel endpoints</span>
                  </div>
                </div>
              </div>
            )}

            <Banner>
              <strong>Wrangler Routes Configuration</strong>
              <div className="mt-2">
                <p className="mb-3">
                  Add these routes to your{" "}
                  <code className="rounded bg-kumo-elevated px-1">
                    wrangler.jsonc
                  </code>
                  :
                </p>
                <div className="rounded-md bg-kumo-elevated p-3 font-mono text-xs overflow-auto">
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
                <p className="mt-3 text-sm text-kumo-subtle">
                  Make sure DNS records are configured for both domains in
                  Cloudflare.
                </p>
              </div>
            </Banner>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
                icon={<ArrowLeft size={16} />}
              >
                Back
              </Button>
              <Button type="submit" disabled={isLoading || !isValid}>
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
