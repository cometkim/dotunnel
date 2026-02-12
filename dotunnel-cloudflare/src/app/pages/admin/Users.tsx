"use client";

import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import { Trash, User } from "@phosphor-icons/react";
import * as React from "react";
import {
  type AdminUser,
  deleteUser,
  deleteUserSessions,
} from "#app/functions/admin.ts";

type UsersPageClientProps = {
  initialUsers: AdminUser[];
};

export function UsersPageClient({
  initialUsers,
}: UsersPageClientProps): React.ReactElement {
  const [users, setUsers] = React.useState(initialUsers);
  const [isDeleting, setIsDeleting] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleDeleteUser = async (userId: number) => {
    if (
      !confirm(
        "Are you sure you want to delete this user? This will also delete all their sessions.",
      )
    ) {
      return;
    }

    setIsDeleting(userId);
    setError(null);

    const result = await deleteUser(userId);
    if (result.isOk()) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } else {
      setError(result.error.message);
    }
    setIsDeleting(null);
  };

  const handleDeleteSessions = async (userId: number) => {
    if (
      !confirm("Are you sure you want to delete all sessions for this user?")
    ) {
      return;
    }

    setError(null);
    const result = await deleteUserSessions(userId);
    if (result.isErr()) {
      setError(result.error.message);
    }
  };

  return (
    <div className="space-y-6">
      {error && <Banner variant="error">{error}</Banner>}

      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <Text variant="heading3">Users ({users.length})</Text>
          <Text variant="secondary">Manage registered users</Text>
        </div>
        {users.length === 0 ? (
          <p className="text-sm text-kumo-subtle">No users found</p>
        ) : (
          <div className="space-y-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between rounded-md border border-kumo-line p-4"
              >
                <div className="flex items-center gap-4">
                  {user.image ? (
                    <img
                      src={user.image}
                      alt={user.name}
                      className="h-10 w-10 rounded-full"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-elevated">
                      <User size={20} />
                    </div>
                  )}
                  <div>
                    <p className="font-medium">{user.name}</p>
                    <p className="text-sm text-kumo-subtle">{user.email}</p>
                    <p className="text-xs text-kumo-subtle">
                      Joined {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {user.emailVerified && (
                    <Badge variant="secondary">Verified</Badge>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteSessions(user.id)}
                  >
                    Revoke Sessions
                  </Button>
                  <Button
                    variant="destructive"
                    shape="square"
                    size="sm"
                    aria-label="Delete user"
                    onClick={() => handleDeleteUser(user.id)}
                    disabled={isDeleting === user.id}
                    icon={
                      isDeleting === user.id ? undefined : <Trash size={16} />
                    }
                  >
                    {isDeleting === user.id ? <Loader /> : null}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>
    </div>
  );
}
