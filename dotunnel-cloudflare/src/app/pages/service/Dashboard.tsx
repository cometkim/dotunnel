import { Text } from "@cloudflare/kumo/components/text";
import type * as React from "react";
import type { SessionUser } from "#app/auth/session.ts";
import { getUserTunnels } from "#app/functions/tunnels.ts";
import { ServiceLayout } from "./Layout.tsx";
import { TunnelList } from "./TunnelList.tsx";

type ServiceDashboardProps = {
  user: SessionUser;
};

export async function ServiceDashboard({
  user,
}: ServiceDashboardProps): Promise<React.ReactElement> {
  const tunnels = await getUserTunnels(user.id);

  return (
    <ServiceLayout
      currentPath="/"
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Text variant="heading3">My Tunnels</Text>
            <Text variant="secondary">
              Create and manage your tunnel endpoints
            </Text>
          </div>
        </div>

        <TunnelList initialTunnels={tunnels} />
      </div>
    </ServiceLayout>
  );
}
