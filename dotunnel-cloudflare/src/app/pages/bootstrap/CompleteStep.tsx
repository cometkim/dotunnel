"use client";

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import * as React from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "#app/components/ui/alert.tsx";
import { Badge } from "#app/components/ui/badge.tsx";
import { Button, buttonVariants } from "#app/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#app/components/ui/card.tsx";
import { completeBootstrap } from "#app/functions/bootstrap.ts";
import { getProviderDisplayName } from "#app/lib/auth-endpoints.ts";
import { cn } from "#app/lib/utils.ts";
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-green-500" />
            Setup Complete!
          </CardTitle>
          <CardDescription>
            Your DOtunnel service is configured and ready.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Summary */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Configuration Summary</h4>
            <div className="rounded-md border divide-y">
              <div className="flex items-center justify-between p-3">
                <span className="text-sm text-muted-foreground">
                  Auth Provider
                </span>
                <Badge variant="secondary">
                  {provider ? getProviderDisplayName(provider) : "None"}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="text-sm text-muted-foreground">
                  Service Host
                </span>
                <Badge variant="secondary" className="font-mono">
                  {config.service.host}
                </Badge>
              </div>
              <div className="flex items-center justify-between p-3">
                <span className="text-sm text-muted-foreground">
                  Tunnel Host Pattern
                </span>
                <Badge variant="secondary" className="font-mono">
                  {config.tunnel.hostPattern}
                </Badge>
              </div>
            </div>
          </div>

          {/* Wrangler Routes Configuration */}
          <Alert>
            <AlertTitle>Wrangler Routes Configuration</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>
                Add these routes to your{" "}
                <code className="rounded bg-muted px-1">wrangler.jsonc</code>:
              </p>
              <div className="rounded-md bg-muted p-3 font-mono text-xs overflow-auto">
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
            </AlertDescription>
          </Alert>

          {/* Production Deployment */}
          <Alert>
            <AlertTitle>Production Deployment</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>
                Your config is stored in the database. For production, set it as
                a static secret for optimal performance:
              </p>

              <div className="space-y-2">
                <p className="text-sm font-medium">1. Copy the config value:</p>
                <div className="relative">
                  <div className="rounded-md bg-muted p-3 pr-12 font-mono text-xs break-all max-h-24 overflow-auto">
                    {configBase64}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1"
                    onClick={handleCopy}
                  >
                    {isCopied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  2. Set as secret and deploy:
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  <p className="text-muted-foreground"># Set config secret</p>
                  <p>wrangler secret put CONFIG</p>
                  <p className="text-muted-foreground">
                    # Paste the base64 value when prompted
                  </p>
                  <p className="mt-2 text-muted-foreground"># Deploy</p>
                  <p>wrangler deploy</p>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <a
              href="https://dash.cloudflare.com"
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants({ variant: "outline" }))}
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Cloudflare Dashboard
            </a>
            <Button onClick={handleComplete} disabled={isCompleting}>
              {isCompleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing...
                </>
              ) : (
                "Go to Dashboard"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
