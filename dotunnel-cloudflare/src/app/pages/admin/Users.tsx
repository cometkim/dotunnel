"use client";

import { Loader2, Trash2, User } from "lucide-react";
import * as React from "react";
import { Alert, AlertDescription } from "#app/components/ui/alert.tsx";
import { Badge } from "#app/components/ui/badge.tsx";
import { Button } from "#app/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#app/components/ui/card.tsx";
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
    if (result.success) {
      setUsers((prev) => prev.filter((u) => u.id !== userId));
    } else {
      setError(result.error);
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
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Users ({users.length})</CardTitle>
          <CardDescription>Manage registered users</CardDescription>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <p className="text-sm text-muted-foreground">No users found</p>
          ) : (
            <div className="space-y-4">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-md border p-4"
                >
                  <div className="flex items-center gap-4">
                    {user.image ? (
                      <img
                        src={user.image}
                        alt={user.name}
                        className="h-10 w-10 rounded-full"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                        <User className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                      <p className="text-xs text-muted-foreground">
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
                      size="sm"
                      onClick={() => handleDeleteUser(user.id)}
                      disabled={isDeleting === user.id}
                    >
                      {isDeleting === user.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
