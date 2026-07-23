"use client";

import { Badge } from "@cloudflare/kumo/components/badge";
import { Banner } from "@cloudflare/kumo/components/banner";
import { Button } from "@cloudflare/kumo/components/button";
import { Loader } from "@cloudflare/kumo/components/loader";
import { Surface } from "@cloudflare/kumo/components/surface";
import { Text } from "@cloudflare/kumo/components/text";
import { Monitor, Terminal, Trash } from "@phosphor-icons/react";
import * as React from "react";
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
    if (result.status === "ok") {
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
      setError(result.error.message);
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
      {error && <Banner variant="error">{error}</Banner>}

      {/* Browser Sessions */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <Text variant="heading3">
            Browser Sessions ({browserSessions.length})
          </Text>
          <Text variant="secondary">Active web browser sessions</Text>
        </div>
        {browserSessions.length === 0 ? (
          <p className="text-sm text-kumo-subtle">No browser sessions</p>
        ) : (
          <div className="space-y-4">
            {browserSessions.map((session) => (
              <div
                key={session.publicId}
                className="flex items-center justify-between rounded-md border border-kumo-line p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-elevated">
                    <Monitor size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{session.userName}</p>
                      {session.publicId === currentSessionId && (
                        <Badge variant="primary" className="text-xs">
                          Current
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-kumo-subtle">
                      {session.userEmail}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-kumo-subtle">
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
                      Expires {new Date(session.expiresAt).toLocaleDateString()}
                    </Badge>
                  ) : null}
                  <Button
                    variant="destructive"
                    shape="square"
                    size="sm"
                    aria-label="Delete session"
                    onClick={() =>
                      handleDeleteSession(session.publicId, session.type)
                    }
                    disabled={isDeleting === session.publicId}
                    icon={
                      isDeleting === session.publicId ? undefined : (
                        <Trash size={16} />
                      )
                    }
                  >
                    {isDeleting === session.publicId ? <Loader /> : null}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>

      {/* CLI Tokens */}
      <Surface className="rounded-lg p-6">
        <div className="mb-4">
          <Text variant="heading3">CLI Tokens ({activeCli.length})</Text>
          <Text variant="secondary">
            Active CLI authentication tokens from device flow
          </Text>
        </div>
        {activeCli.length === 0 ? (
          <p className="text-sm text-kumo-subtle">No active CLI tokens</p>
        ) : (
          <div className="space-y-4">
            {activeCli.map((session) => (
              <div
                key={session.publicId}
                className="flex items-center justify-between rounded-md border border-kumo-line p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-elevated">
                    <Terminal size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{session.userName}</p>
                      <Badge variant="outline" className="text-xs">
                        CLI
                      </Badge>
                    </div>
                    <p className="text-sm text-kumo-subtle">
                      {session.userEmail}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-kumo-subtle">
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
                    shape="square"
                    size="sm"
                    aria-label="Revoke token"
                    onClick={() =>
                      handleDeleteSession(session.publicId, session.type)
                    }
                    disabled={isDeleting === session.publicId}
                    icon={
                      isDeleting === session.publicId ? undefined : (
                        <Trash size={16} />
                      )
                    }
                  >
                    {isDeleting === session.publicId ? <Loader /> : null}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Surface>

      {/* Revoked CLI Tokens */}
      {revokedCli.length > 0 && (
        <Surface className="rounded-lg p-6">
          <div className="mb-4">
            <Text variant="heading3">Revoked Tokens ({revokedCli.length})</Text>
            <Text variant="secondary">Previously revoked CLI tokens</Text>
          </div>
          <div className="space-y-4">
            {revokedCli.map((session) => (
              <div
                key={session.publicId}
                className="flex items-center justify-between rounded-md border border-dashed border-kumo-line p-4 opacity-60"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-kumo-elevated">
                    <Terminal size={20} />
                  </div>
                  <div>
                    <p className="font-medium">{session.userName}</p>
                    <p className="text-sm text-kumo-subtle">
                      {session.userEmail}
                    </p>
                    <p className="text-xs text-kumo-subtle">
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
        </Surface>
      )}
    </div>
  );
}
