"use client";

import { AlertTriangle, Check, RefreshCw, X } from "lucide-react";
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

import { refreshMigrationStatus } from "#app/functions/bootstrap.ts";
import type { MigrationStatus } from "#app/lib/db.ts";

type MigrationStepProps = {
  migrationStatus: MigrationStatus;
};

export function MigrationStep({
  migrationStatus: initialStatus,
}: MigrationStepProps): React.ReactElement {
  const [status, setStatus] = React.useState(initialStatus);
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const newStatus = await refreshMigrationStatus();
      setStatus(newStatus);
      if (newStatus.migrated) {
        // Reload to proceed to next step
        window.location.reload();
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-yellow-500" />
          Database Migration Required
        </CardTitle>
        <CardDescription>
          The database schema has not been initialized.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Alert>
          <AlertTitle>Run migrations</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">
              Execute the following command to apply database migrations:
            </p>
            <div className="rounded-md bg-muted p-4 font-mono text-sm">
              <p className="text-muted-foreground"># Local development:</p>
              <p className="mb-2">
                yarn wrangler d1 migrations apply dotunnel --local
              </p>
              <p className="text-muted-foreground"># Production:</p>
              <p>yarn wrangler d1 migrations apply dotunnel --remote</p>
            </div>
          </AlertDescription>
        </Alert>

        <div>
          <h4 className="mb-3 text-sm font-medium">Migration Status</h4>
          <div className="space-y-2">
            {status.requiredMigrations.map((migration) => {
              const isApplied = status.appliedMigrations.includes(migration);
              return (
                <div
                  key={migration}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <span className="font-mono text-sm">{migration}</span>
                  <Badge variant={isApplied ? "default" : "destructive"}>
                    {isApplied ? (
                      <span className="flex items-center gap-1">
                        <Check className="h-3 w-3" /> Applied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <X className="h-3 w-3" /> Not applied
                      </span>
                    )}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh Status
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
