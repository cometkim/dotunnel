import type * as React from "react";
import type { SessionUser } from "#app/auth/session.ts";
import { getConfigData } from "#app/functions/admin.ts";
import { ConfigPageClient } from "./ConfigPage.tsx";
import { AdminLayout } from "./Layout.tsx";

type AdminConfigProps = {
  user: SessionUser;
};

export async function AdminConfig({
  user,
}: AdminConfigProps): Promise<React.ReactElement> {
  const data = await getConfigData();

  return (
    <AdminLayout
      currentPath="/admin/config"
      breadcrumbs={[
        { label: "Admin", href: "/admin" },
        { label: "Configuration" },
      ]}
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Configuration</h1>
          <p className="text-muted-foreground">
            Manage hosts, auth providers, and export configuration
          </p>
        </div>

        <ConfigPageClient config={data.config} source={data.source} />
      </div>
    </AdminLayout>
  );
}
