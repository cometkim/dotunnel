"use client";

import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import * as React from "react";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "#app/components/ui/alert.tsx";
import { Badge } from "#app/components/ui/badge.tsx";
import { Button } from "#app/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#app/components/ui/card.tsx";
import { completeBootstrap } from "#app/functions/bootstrap.ts";
import { getProviderDisplayName } from "#app/lib/auth-endpoints.ts";
import type { Config } from "#app/models/config.ts";
import { StepIndicator } from "#app/pages/bootstrap/StepIndicator.tsx";

type CompleteStepProps = {
  config: Config;
  configBase64: string;
};

export function CompleteStep({
  config,
  configBase64,
}: CompleteStepProps): React.ReactElement {
  const [isCopied, setIsCopied] = React.useState(false);
  const [isCompleting, setIsCompleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

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
                  Tunnel Host
                </span>
                <Badge variant="secondary" className="font-mono">
                  {config.tunnel.hostPattern}
                </Badge>
              </div>
            </div>
          </div>

          {/* Production Deployment */}
          <Alert>
            <AlertTitle>Production Deployment</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>
                Your config is stored in the database. For optimal performance,
                deploy with static configuration:
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
                  2. Set as secret and redeploy:
                </p>
                <div className="rounded-md bg-muted p-3 font-mono text-sm">
                  <p className="text-muted-foreground"># Set config secret</p>
                  <p>yarn wrangler secret put CONFIG</p>
                  <p className="text-muted-foreground">
                    # Paste the base64 value when prompted
                  </p>
                  <p className="mt-2 text-muted-foreground"># Redeploy</p>
                  <p>yarn wrangler deploy</p>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              render={
                <a
                  href="https://dash.cloudflare.com"
                  target="_blank"
                  rel="noopener noreferrer"
                />
              }
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Cloudflare Dashboard
            </Button>
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
