import type * as React from "react";

import {
  type BootstrapState,
  getBootstrapState,
} from "#app/functions/bootstrap.ts";
import { AdminUserStep } from "#app/pages/bootstrap/AdminUserStep.tsx";
import { AuthProviderStep } from "#app/pages/bootstrap/AuthProviderStep.tsx";
import { CompleteStep } from "#app/pages/bootstrap/CompleteStep.tsx";
import { MigrationStep } from "#app/pages/bootstrap/MigrationStep.tsx";
import { TunnelConfigStep } from "#app/pages/bootstrap/TunnelConfigStep.tsx";

// =============================================================================
// Main Bootstrap Page
// =============================================================================

export async function BootstrapPage(): Promise<React.ReactElement> {
  const state = await getBootstrapState();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">DOtunnel Setup</h1>
        </div>

        <BootstrapWizard state={state} />
      </div>
    </div>
  );
}

// =============================================================================
// Wizard Router
// =============================================================================

function BootstrapWizard({
  state,
}: {
  state: BootstrapState;
}): React.ReactElement {
  switch (state.step) {
    case "migration":
      return <MigrationStep migrationStatus={state.migrationStatus} />;

    case "auth":
      return <AuthProviderStep config={state.config} />;

    case "admin":
      return <AdminUserStep config={state.config} />;

    case "tunnel":
      return <TunnelConfigStep config={state.config} />;

    case "complete":
      return (
        <CompleteStep config={state.config} configBase64={state.configBase64} />
      );

    case "done":
      // This shouldn't happen - middleware should redirect
      return (
        <div className="text-center text-muted-foreground">
          Setup complete. Redirecting...
        </div>
      );
  }
}
