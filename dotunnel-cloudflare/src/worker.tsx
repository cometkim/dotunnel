import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import { Document } from "./app/Document.tsx";
import { setCommonHeaders } from "./app/headers.ts";
import { HomePage } from "./app/pages/Home.tsx";

export type AppContext = {};

export default defineApp([
  setCommonHeaders(),
  ({ ctx }) => {
    // setup ctx here
    ctx;
  },
  render(Document, [route("/", HomePage)]),
]);
