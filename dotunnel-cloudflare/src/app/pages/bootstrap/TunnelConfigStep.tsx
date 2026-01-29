"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import * as React from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "#app/components/ui/alert.tsx";
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
import { saveTunnelConfig } from "#app/functions/bootstrap.ts";
import type { Config } from "#app/models/config.ts";
import { StepIndicator } from "#app/pages/bootstrap/StepIndicator.tsx";

type TunnelConfigStepProps = {
  config: Config;
};

export function TunnelConfigStep({
  config,
}: TunnelConfigStepProps): React.ReactElement {
  const [hostPattern, setHostPattern] = React.useState(
    config.tunnel.hostPattern || "",
  );
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Extract base domain from pattern for display
  const baseDomain = hostPattern.startsWith("*.") ? hostPattern.slice(2) : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result = await saveTunnelConfig(hostPattern);
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

      <Card>
        <CardHeader>
          <CardTitle>Configure Tunnel Host Pattern</CardTitle>
          <CardDescription>
            Set up the wildcard domain pattern for tunnel endpoints.
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
              <Label htmlFor="hostPattern">Tunnel Host Pattern</Label>
              <Input
                id="hostPattern"
                placeholder="*.mytunnel.io"
                value={hostPattern}
                onChange={(e) => setHostPattern(e.target.value)}
                required
              />
              <p className="text-sm text-muted-foreground">
                Must start with{" "}
                <code className="rounded bg-muted px-1">*.</code> followed by
                your domain.
              </p>
            </div>

            {baseDomain && (
              <div className="rounded-md border p-4 space-y-3">
                <h4 className="text-sm font-medium">Request Routing</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-muted-foreground">
                      {baseDomain}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span>Service dashboard & API</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-muted-foreground">
                      {hostPattern}
                    </span>
                    <span className="text-muted-foreground">→</span>
                    <span>Tunnel endpoints</span>
                  </div>
                </div>
              </div>
            )}

            <Alert>
              <AlertTitle>Workers Routes Configuration</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="mb-3">
                  Ensure these routes are configured in your Cloudflare
                  dashboard:
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  <table className="w-full">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-left font-normal">Route</th>
                        <th className="text-left font-normal">Worker</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td>{baseDomain || "example.com"}/*</td>
                        <td>dotunnel</td>
                      </tr>
                      <tr>
                        <td>{hostPattern || "*.example.com"}/*</td>
                        <td>dotunnel</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </AlertDescription>
            </Alert>

            <div className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => window.history.back()}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <Button type="submit" disabled={isLoading || !hostPattern}>
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
