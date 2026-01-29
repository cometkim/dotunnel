"use client";

import { Loader2, Monitor, Terminal, Trash2 } from "lucide-react";
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

  const handleDeleteSession = async (publicId: string, type: string) => {
    const isCli = type === "cli";
    const action = isCli ? "revoke" : "delete";

    if (publicId === currentSessionId) {
      if (
        !confirm(
          "This is your current session. You will be logged out. Continue?",
        )
      ) {
        return;
      }
    } else if (!confirm(`Are you sure you want to ${action} this session?`)) {
      return;
    }

    setIsDeleting(publicId);
    setError(null);

    const result = await deleteSession(publicId);
    if (result.success) {
      if (publicId === currentSessionId) {
        window.location.href = "/_auth/logout";
      } else if (isCli) {
        // CLI sessions are soft-deleted, update state
        setSessions((prev) =>
          prev.map((s) =>
            s.publicId === publicId
              ? { ...s, revokedAt: new Date().toISOString() }
              : s,
          ),
        );
      } else {
        // Browser sessions are hard-deleted
        setSessions((prev) => prev.filter((s) => s.publicId !== publicId));
      }
    } else {
      setError(result.error);
    }
    setIsDeleting(null);
  };

  const isExpired = (expiresAt: string | null) =>
    expiresAt ? new Date(expiresAt) < new Date() : false;

  const parseUserAgent = (ua: string | null) => {
    if (!ua) return "Unknown";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("Edge")) return "Edge";
    return "Browser";
  };

  // Separate sessions by type and status
  const browserSessions = sessions.filter((s) => s.type !== "cli");
  const activeCli = sessions.filter((s) => s.type === "cli" && !s.revokedAt);
  const revokedCli = sessions.filter((s) => s.type === "cli" && s.revokedAt);

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Browser Sessions */}
      <Card>
        <CardHeader>
          <CardTitle>Browser Sessions ({browserSessions.length})</CardTitle>
          <CardDescription>Active web browser sessions</CardDescription>
        </CardHeader>
        <CardContent>
          {browserSessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No browser sessions</p>
          ) : (
            <div className="space-y-4">
              {browserSessions.map((session) => (
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
                    {session.expiresAt && isExpired(session.expiresAt) ? (
                      <Badge variant="destructive">Expired</Badge>
                    ) : session.expiresAt ? (
                      <Badge variant="secondary">
                        Expires{" "}
                        {new Date(session.expiresAt).toLocaleDateString()}
                      </Badge>
                    ) : null}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        handleDeleteSession(session.publicId, session.type)
                      }
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

      {/* CLI Tokens */}
      <Card>
        <CardHeader>
          <CardTitle>CLI Tokens ({activeCli.length})</CardTitle>
          <CardDescription>
            Active CLI authentication tokens from device flow
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activeCli.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active CLI tokens
            </p>
          ) : (
            <div className="space-y-4">
              {activeCli.map((session) => (
                <div
                  key={session.publicId}
                  className="flex items-center justify-between rounded-md border p-4"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Terminal className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{session.userName}</p>
                        <Badge variant="outline" className="text-xs">
                          CLI
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {session.userEmail}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{session.name || "Unnamed token"}</span>
                        {session.lastUsedAt && (
                          <>
                            <span>-</span>
                            <span>
                              Last used{" "}
                              {new Date(session.lastUsedAt).toLocaleString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">
                      Created {new Date(session.createdAt).toLocaleDateString()}
                    </Badge>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() =>
                        handleDeleteSession(session.publicId, session.type)
                      }
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

      {/* Revoked CLI Tokens */}
      {revokedCli.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Revoked Tokens ({revokedCli.length})</CardTitle>
            <CardDescription>Previously revoked CLI tokens</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {revokedCli.map((session) => (
                <div
                  key={session.publicId}
                  className="flex items-center justify-between rounded-md border border-dashed p-4 opacity-60"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                      <Terminal className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium">{session.userName}</p>
                      <p className="text-sm text-muted-foreground">
                        {session.userEmail}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {session.name || "Unnamed token"}
                      </p>
                    </div>
                  </div>
                  <Badge variant="destructive">
                    Revoked{" "}
                    {session.revokedAt &&
                      new Date(session.revokedAt).toLocaleDateString()}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
