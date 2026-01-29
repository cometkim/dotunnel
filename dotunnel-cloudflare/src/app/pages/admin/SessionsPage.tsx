import type * as React from "react";
import type { Session, SessionUser } from "#app/auth/session.ts";
import { getSessions } from "#app/functions/admin.ts";
import { AdminLayout } from "./Layout.tsx";
import { SessionsPageClient } from "./Sessions.tsx";

type AdminSessionsPageProps = {
  user: SessionUser;
  session: Session;
};

export async function AdminSessionsPage({
  user,
  session,
}: AdminSessionsPageProps): Promise<React.ReactElement> {
  const sessions = await getSessions();

  return (
    <AdminLayout
      currentPath="/admin/sessions"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Sessions" }]}
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Sessions</h1>
          <p className="text-muted-foreground">
            Manage active user sessions and CLI tokens
          </p>
        </div>

        <SessionsPageClient
          initialSessions={sessions}
          currentSessionId={session.publicId}
        />
      </div>
    </AdminLayout>
  );
}
