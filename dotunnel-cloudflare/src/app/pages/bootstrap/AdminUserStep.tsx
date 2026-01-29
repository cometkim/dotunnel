"use client";

import { KeyRound } from "lucide-react";
import type * as React from "react";
import { Alert, AlertDescription } from "#app/components/ui/alert.tsx";
import { Button } from "#app/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#app/components/ui/card.tsx";
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

  if (!provider) {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          No auth provider configured. Please go back and configure one.
        </AlertDescription>
      </Alert>
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

      <Card>
        <CardHeader>
          <CardTitle>Create Administrator Account</CardTitle>
          <CardDescription>
            Sign in with {providerName} to create the initial administrator
            account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertDescription>
              The first user to sign in will become the administrator of this
              DOtunnel instance.
            </AlertDescription>
          </Alert>

          <div className="flex flex-col items-center space-y-4 py-8">
            <p className="text-center text-muted-foreground">
              Click the button below to sign in with your configured provider.
            </p>

            <Button size="lg" render={<a href={authUrl} />}>
              <KeyRound className="mr-2 h-5 w-5" />
              Sign in with {providerName}
            </Button>
          </div>

          <div className="border-t pt-4">
            <p className="text-center text-sm text-muted-foreground">
              Configured provider: <strong>{providerName}</strong>
              {provider.type === "oidc" && (
                <span className="block text-xs">({provider.issuer})</span>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
