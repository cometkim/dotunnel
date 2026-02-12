import { Badge } from "@cloudflare/kumo/components/badge";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import {
  ArrowSquareOut,
  CheckCircle,
  Database,
  HardDrives,
  Key,
  Pulse,
  Users,
} from "@phosphor-icons/react/ssr";
import type * as React from "react";
import type { SessionUser } from "#app/auth/session.ts";
import {
  type AdminDashboardData,
  getAdminDashboardData,
} from "#app/functions/admin.ts";
import { getProviderDisplayName } from "#app/lib/auth-endpoints.ts";
import { AdminLayout } from "./Layout.tsx";

type AdminDashboardProps = {
  user: SessionUser;
};

export async function AdminDashboard({
  user,
}: AdminDashboardProps): Promise<React.ReactElement> {
  const data = await getAdminDashboardData();

  return (
    <AdminLayout
      currentPath="/admin"
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-kumo-subtle">Overview of your DOtunnel service</p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatsCard
            title="Users"
            value={data.stats.usersCount}
            icon={<Users size={16} className="text-kumo-subtle" />}
            href="/admin/users"
          />
          <StatsCard
            title="Active Sessions"
            value={data.stats.sessionsCount}
            icon={<Pulse size={16} className="text-kumo-subtle" />}
            href="/admin/sessions"
          />
          <StatsCard
            title="Auth Providers"
            value={data.stats.providersCount}
            icon={<Key size={16} className="text-kumo-subtle" />}
            href="/admin/config"
          />
        </div>

        {/* Configuration Overview */}
        <ConfigOverview data={data} />
      </div>
    </AdminLayout>
  );
}

function StatsCard({
  title,
  value,
  icon,
  href,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  href: string;
}): React.ReactElement {
  return (
    <a href={href} className="block">
      <Surface className="rounded-lg p-6 transition-colors hover:bg-kumo-elevated/50">
        <div className="flex flex-row items-center justify-between space-y-0 pb-2">
          <span className="text-sm font-medium text-kumo-subtle">{title}</span>
          {icon}
        </div>
        <div className="text-2xl font-bold">{value}</div>
      </Surface>
    </a>
  );
}

function ConfigOverview({
  data,
}: {
  data: AdminDashboardData;
}): React.ReactElement {
  const { config, source } = data.config;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Service Configuration */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <HardDrives size={20} />
            Service Configuration
          </div>
          <Text variant="secondary">Current service host settings</Text>
        </div>
        <div className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-kumo-subtle">Config Source</span>
              <Badge variant={source === "static" ? "primary" : "secondary"}>
                {source === "static" ? "Static Secret" : "Database"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-kumo-subtle">Service Host</span>
              <code className="rounded bg-kumo-elevated px-2 py-1 text-sm">
                {config.service.host || "Not configured"}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-kumo-subtle">Tunnel Pattern</span>
              <code className="rounded bg-kumo-elevated px-2 py-1 text-sm">
                {config.tunnel.hostPattern || "Not configured"}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-kumo-subtle">Bootstrapped</span>
              {config.bootstrapped ? (
                <Badge
                  variant="primary"
                  className="bg-kumo-success hover:bg-kumo-success"
                >
                  <CheckCircle size={12} className="mr-1" />
                  Yes
                </Badge>
              ) : (
                <Badge variant="secondary">No</Badge>
              )}
            </div>
          </div>
          <a
            href="/admin/config"
            className="inline-flex items-center text-sm text-kumo-brand hover:underline"
          >
            Manage Configuration
            <ArrowSquareOut size={12} className="ml-1" />
          </a>
        </div>
      </Surface>

      {/* Auth Providers */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Key size={20} />
            Auth Providers
          </div>
          <Text variant="secondary">Configured authentication providers</Text>
        </div>
        <div className="space-y-4">
          {config.auth.providers.length === 0 ? (
            <p className="text-sm text-kumo-subtle">No providers configured</p>
          ) : (
            <div className="space-y-2">
              {config.auth.providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-md border border-kumo-line p-3"
                >
                  <div>
                    <p className="font-medium">
                      {getProviderDisplayName(provider)}
                    </p>
                    <p className="text-xs text-kumo-subtle">
                      {provider.type.toUpperCase()}
                    </p>
                  </div>
                  <Badge variant="outline">{provider.type}</Badge>
                </div>
              ))}
            </div>
          )}
          <a
            href="/admin/config"
            className="inline-flex items-center text-sm text-kumo-brand hover:underline"
          >
            Manage Providers
            <ArrowSquareOut size={12} className="ml-1" />
          </a>
        </div>
      </Surface>

      {/* Database Info */}
      <Surface className="rounded-lg p-6 md:col-span-2">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <Database size={20} />
            Database Status
          </div>
          <Text variant="secondary">D1 database information</Text>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-md border border-kumo-line p-4">
            <p className="text-sm text-kumo-subtle">Users</p>
            <p className="text-2xl font-bold">{data.stats.usersCount}</p>
          </div>
          <div className="rounded-md border border-kumo-line p-4">
            <p className="text-sm text-kumo-subtle">Sessions</p>
            <p className="text-2xl font-bold">{data.stats.sessionsCount}</p>
          </div>
          <div className="rounded-md border border-kumo-line p-4">
            <p className="text-sm text-kumo-subtle">Auth Providers</p>
            <p className="text-2xl font-bold">{data.stats.providersCount}</p>
          </div>
        </div>
      </Surface>
    </div>
  );
}
