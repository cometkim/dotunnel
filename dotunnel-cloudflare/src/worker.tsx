import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { Document } from "#app/Document.tsx";
import { bootstrapGuard } from "#app/middlewares/bootstrap-guard.ts";
import { setCommonHeaders } from "#app/middlewares/headers.ts";
import { BootstrapPage } from "#app/pages/Bootstrap.tsx";
import { HomePage } from "#app/pages/Home.tsx";

export interface AppContext {}

export default defineApp([
  setCommonHeaders(),
  bootstrapGuard(),
  render(Document, [route("/", HomePage), route("/_bootstrap", BootstrapPage)]),
]);
