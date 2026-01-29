import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import {
  handleCliLogoutRequest,
  handleDeviceCodeRequest,
  handleDeviceTokenRequest,
  handleUserInfoRequest,
} from "#app/api/device.ts";
import { handleTunnelConnect } from "#app/api/tunnel.ts";
import {
  handleCallback,
  handleLogin,
  handleLogout,
} from "#app/auth/handlers.ts";
import type { Session, SessionUser } from "#app/auth/session.ts";
import { Document } from "#app/Document.tsx";
import { requireAuth, sessionLoader } from "#app/middlewares/auth.ts";
import {
  type BootstrapContextFields,
  bootstrapGuard,
} from "#app/middlewares/bootstrap-guard.ts";
import { setCommonHeaders } from "#app/middlewares/headers.ts";
import { tunnelProxy } from "#app/middlewares/tunnel-proxy.ts";
import { AdminConfig } from "#app/pages/admin/Config.tsx";
import { AdminDashboard } from "#app/pages/admin/Dashboard.tsx";
import { AdminSessionsPage } from "#app/pages/admin/SessionsPage.tsx";
import { AdminUsersPage } from "#app/pages/admin/UsersPage.tsx";
import { BootstrapPage } from "#app/pages/Bootstrap.tsx";
import { DeviceAuthPage } from "#app/pages/DeviceAuth.tsx";
import { ServiceDashboard } from "#app/pages/service/Dashboard.tsx";

// =============================================================================
// Durable Object Export
// =============================================================================

export { TunnelSession } from "#durable-objects/TunnelSession.ts";

// =============================================================================
// App Context Type
// =============================================================================

export type AppContext = BootstrapContextFields & {
  session: Session | null;
  user: SessionUser | null;
};

// =============================================================================
// App Definition
// =============================================================================

export default defineApp([
  setCommonHeaders(),

  // Tunnel proxy - handles requests to *.tunnel.io (before bootstrap check)
  tunnelProxy(),

  bootstrapGuard(),
  sessionLoader(),

  // Auth routes (before render, as they return Response directly)
  route("/_auth/login", { get: ({ request }) => handleLogin(request) }),
  route("/_auth/callback", { get: ({ request }) => handleCallback(request) }),
  route("/_auth/logout", { get: ({ request }) => handleLogout(request) }),

  // Device flow API routes (public, for CLI)
  route("/_api/device/code", {
    post: ({ request }) => handleDeviceCodeRequest(request),
  }),
  route("/_api/device/token", {
    post: ({ request }) => handleDeviceTokenRequest(request),
  }),
  route("/_api/user", { get: ({ request }) => handleUserInfoRequest(request) }),
  route("/_api/logout", {
    post: ({ request }) => handleCliLogoutRequest(request),
  }),

  // Tunnel connect API (CLI WebSocket connection)
  route("/_api/tunnel/connect", {
    post: ({ request }) => handleTunnelConnect(request),
    get: ({ request }) => handleTunnelConnect(request),
  }),

  // Page routes
  render(Document, [
    // Public routes
    route("/_bootstrap", BootstrapPage),

    // Protected routes (requireAuth ensures user/session exist)
    requireAuth(),

    // Service routes (user dashboard)
    // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
    route("/", ({ ctx }) => <ServiceDashboard user={ctx.user!} />),

    // Device authorization page (protected - user must be logged in)
    route("/_device", ({ ctx, request }) => {
      const url = new URL(request.url);
      const code = url.searchParams.get("code") || undefined;
      // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
      return <DeviceAuthPage user={ctx.user!} initialCode={code} />;
    }),

    // Admin routes
    // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
    route("/admin", ({ ctx }) => <AdminDashboard user={ctx.user!} />),
    // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
    route("/admin/config", ({ ctx }) => <AdminConfig user={ctx.user!} />),
    // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
    route("/admin/users", ({ ctx }) => <AdminUsersPage user={ctx.user!} />),
    route("/admin/sessions", ({ ctx }) => (
      // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
      <AdminSessionsPage user={ctx.user!} session={ctx.session!} />
    )),
  ]),
]);
