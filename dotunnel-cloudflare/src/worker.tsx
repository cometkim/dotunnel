import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import { Document } from "#app/Document.tsx";
import { setCommonHeaders } from "#app/middlewares/headers.ts";
import { BootstrapPage } from "#app/pages/Bootstrap.tsx";
import { HomePage } from "#app/pages/Home.tsx";

export type AppContext = {};

export default defineApp([
  setCommonHeaders(),
  render(Document, [route("/", HomePage), route("/_bootstrap", BootstrapPage)]),
]);
