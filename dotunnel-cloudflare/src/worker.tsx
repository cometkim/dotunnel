import { prefix, render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
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
import { AdminConfig } from "#app/pages/admin/Config.tsx";
import { AdminDashboard } from "#app/pages/admin/Dashboard.tsx";
import { AdminSessionsPage } from "#app/pages/admin/SessionsPage.tsx";
import { AdminUsersPage } from "#app/pages/admin/UsersPage.tsx";
import { BootstrapPage } from "#app/pages/Bootstrap.tsx";
import { HomePage } from "#app/pages/Home.tsx";

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
  bootstrapGuard(),
  sessionLoader(),

  // Auth routes (before render, as they return Response directly)
  route("/_auth/login", { get: ({ request }) => handleLogin(request) }),
  route("/_auth/callback", { get: ({ request }) => handleCallback(request) }),
  route("/_auth/logout", { get: ({ request }) => handleLogout(request) }),

  // Page routes
  render(Document, [
    route("/", HomePage),
    route("/_bootstrap", BootstrapPage),

    // Admin routes (protected by requireAuth middleware which ensures user/session exist)
    prefix("/admin", [
      requireAuth(),
      // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
      route("/", ({ ctx }) => <AdminDashboard user={ctx.user!} />),
      // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
      route("/config", ({ ctx }) => <AdminConfig user={ctx.user!} />),
      // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
      route("/users", ({ ctx }) => <AdminUsersPage user={ctx.user!} />),
      route("/sessions", ({ ctx }) => (
        // biome-ignore lint/style/noNonNullAssertion: guarded by requireAuth
        <AdminSessionsPage user={ctx.user!} session={ctx.session!} />
      )),
    ]),
  ]),
]);
