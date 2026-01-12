import type { AppContext } from "../src/worker.tsx";

declare module "rwsdk/worker" {
  interface DefaultAppContext extends AppContext {}

  // App is the type of your defineApp export in src/worker.tsx
  export type App = typeof import("../src/worker.tsx").default;
}
