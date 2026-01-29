import type * as React from "react";
import type { SessionUser } from "#app/auth/session.ts";
import { getUsers } from "#app/functions/admin.ts";
import { AdminLayout } from "./Layout.tsx";
import { UsersPageClient } from "./Users.tsx";

type AdminUsersPageProps = {
  user: SessionUser;
};

export async function AdminUsersPage({
  user,
}: AdminUsersPageProps): Promise<React.ReactElement> {
  const users = await getUsers();

  return (
    <AdminLayout
      currentPath="/admin/users"
      breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Users" }]}
      user={{ name: user.name, email: user.email, image: user.image }}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Users</h1>
          <p className="text-muted-foreground">
            Manage registered users and their access
          </p>
        </div>

        <UsersPageClient initialUsers={users} />
      </div>
    </AdminLayout>
  );
}
