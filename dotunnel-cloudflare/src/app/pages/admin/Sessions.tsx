"use client";

import { Loader2, Monitor, Trash2 } from "lucide-react";
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
import { type AdminSession, deleteSession } from "#app/functions/admin.ts";

type SessionsPageClientProps = {
  initialSessions: AdminSession[];
  currentSessionId?: string;
};

export function SessionsPageClient({
  initialSessions,
  currentSessionId,
}: SessionsPageClientProps): React.ReactElement {
  const [sessions, setSessions] = React.useState(initialSessions);
  const [isDeleting, setIsDeleting] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleDeleteSession = async (publicId: string) => {
    if (publicId === currentSessionId) {
      if (
        !confirm(
          "This is your current session. You will be logged out. Continue?",
        )
      ) {
        return;
      }
    } else if (!confirm("Are you sure you want to delete this session?")) {
      return;
    }

    setIsDeleting(publicId);
    setError(null);

    const result = await deleteSession(publicId);
    if (result.success) {
      if (publicId === currentSessionId) {
        window.location.href = "/_auth/logout";
      } else {
        setSessions((prev) => prev.filter((s) => s.publicId !== publicId));
      }
    } else {
      setError(result.error);
    }
    setIsDeleting(null);
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return "Unknown";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Edge")) return "Edge";
    return "Browser";
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
          <CardTitle>Sessions ({sessions.length})</CardTitle>
          <CardDescription>Active user sessions</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions found</p>
          ) : (
            <div className="space-y-4">
              {sessions.map((session) => (
                <div
                  key={session.publicId}
                  className="flex items-center justify-between rounded-md border p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Monitor className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{session.userName}</p>
                        {session.publicId === currentSessionId && (
                          <Badge variant="default" className="text-xs">
                            Current
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {session.userEmail}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{parseUserAgent(session.userAgent)}</span>
                        <span>-</span>
                        <span>{session.ipAddress || "Unknown IP"}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isExpired(session.expiresAt) ? (
                      <Badge variant="destructive">Expired</Badge>
                    ) : (
                      <Badge variant="secondary">
                        Expires{" "}
                        {new Date(session.expiresAt).toLocaleDateString()}
                      </Badge>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteSession(session.publicId)}
                      disabled={isDeleting === session.publicId}
                    >
                      {isDeleting === session.publicId ? (
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
