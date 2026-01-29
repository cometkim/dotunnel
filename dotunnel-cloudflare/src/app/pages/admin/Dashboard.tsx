import {
  Activity,
  CheckCircle2,
  Database,
  ExternalLink,
  KeyRound,
  Server,
  Users,
} from "lucide-react";
import type * as React from "react";
import type { SessionUser } from "#app/auth/session.ts";
import { Badge } from "#app/components/ui/badge.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#app/components/ui/card.tsx";
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
          <p className="text-muted-foreground">
            Overview of your DOtunnel service
          </p>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <StatsCard
            title="Users"
            value={data.stats.usersCount}
            icon={<Users className="h-4 w-4 text-muted-foreground" />}
            href="/admin/users"
          />
          <StatsCard
            title="Active Sessions"
            value={data.stats.sessionsCount}
            icon={<Activity className="h-4 w-4 text-muted-foreground" />}
            href="/admin/sessions"
          />
          <StatsCard
            title="Auth Providers"
            value={data.stats.providersCount}
            icon={<KeyRound className="h-4 w-4 text-muted-foreground" />}
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
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          {icon}
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Service Configuration
          </CardTitle>
          <CardDescription>Current service host settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Config Source
              </span>
              <Badge variant={source === "static" ? "default" : "secondary"}>
                {source === "static" ? "Static Secret" : "Database"}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Service Host
              </span>
              <code className="rounded bg-muted px-2 py-1 text-sm">
                {config.service.host || "Not configured"}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Tunnel Pattern
              </span>
              <code className="rounded bg-muted px-2 py-1 text-sm">
                {config.tunnel.hostPattern || "Not configured"}
              </code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                Bootstrapped
              </span>
              {config.bootstrapped ? (
                <Badge
                  variant="default"
                  className="bg-green-500 hover:bg-green-600"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Yes
                </Badge>
              ) : (
                <Badge variant="secondary">No</Badge>
              )}
            </div>
          </div>
          <a
            href="/admin/config"
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            Manage Configuration
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      {/* Auth Providers */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            Auth Providers
          </CardTitle>
          <CardDescription>Configured authentication providers</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.auth.providers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No providers configured
            </p>
          ) : (
            <div className="space-y-2">
              {config.auth.providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {getProviderDisplayName(provider)}
                    </p>
                    <p className="text-xs text-muted-foreground">
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
            className="inline-flex items-center text-sm text-primary hover:underline"
          >
            Manage Providers
            <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </CardContent>
      </Card>

      {/* Database Info */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Status
          </CardTitle>
          <CardDescription>D1 database information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Users</p>
              <p className="text-2xl font-bold">{data.stats.usersCount}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Sessions</p>
              <p className="text-2xl font-bold">{data.stats.sessionsCount}</p>
            </div>
            <div className="rounded-md border p-4">
              <p className="text-sm text-muted-foreground">Auth Providers</p>
              <p className="text-2xl font-bold">{data.stats.providersCount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
