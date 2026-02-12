"use client";

import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import {
  ArrowsClockwise,
  Check,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import * as React from "react";

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
    <Surface className="rounded-lg border border-kumo-line">
      <div className="p-6 space-y-2">
        <div className="flex items-center gap-2">
          <WarningCircle size={20} className="text-kumo-warning" />
          <Text variant="heading3">Database Migration Required</Text>
        </div>
        <Text variant="secondary">
          The database schema has not been initialized.
        </Text>
      </div>
      <div className="px-6 pb-6 space-y-6">
        <Banner>
          <strong>Run migrations</strong>
          <div className="mt-2">
            <p className="mb-3">
              Execute the following command to apply database migrations:
            </p>
            <div className="rounded-md bg-kumo-elevated p-4 font-mono text-sm">
              <p className="text-kumo-subtle"># Local development:</p>
              <p className="mb-2">
                yarn wrangler d1 migrations apply dotunnel --local
              </p>
              <p className="text-kumo-subtle"># Production:</p>
              <p>yarn wrangler d1 migrations apply dotunnel --remote</p>
            </div>
          </div>
        </Banner>

        <div>
          <h4 className="mb-3 text-sm font-medium">Migration Status</h4>
          <div className="space-y-2">
            {status.requiredMigrations.map((migration) => {
              const isApplied = status.appliedMigrations.includes(migration);
              return (
                <div
                  key={migration}
                  className="flex items-center justify-between rounded-md border border-kumo-line p-3"
                >
                  <span className="font-mono text-sm">{migration}</span>
                  <Badge variant={isApplied ? "primary" : "destructive"}>
                    {isApplied ? (
                      <span className="flex items-center gap-1">
                        <Check size={12} /> Applied
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <X size={12} /> Not applied
                      </span>
                    )}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            icon={
              <ArrowsClockwise
                size={16}
                className={isRefreshing ? "animate-spin" : ""}
              />
            }
          >
            Refresh Status
          </Button>
        </div>
      </div>
    </Surface>
  );
}
