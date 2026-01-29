import type { AppContext } from "#worker.tsx";

declare module "rwsdk/worker" {
  interface DefaultAppContext extends AppContext {}

  // App is the type of your defineApp export in src/worker.tsx
  export type App = typeof import("#worker.tsx").default;
}
