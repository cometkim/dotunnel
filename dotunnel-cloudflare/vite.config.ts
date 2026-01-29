import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { redwood } from "rwsdk/vite";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    allowedHosts: true, // Allow all hosts for tunnel testing
  },
  environments: {
    ssr: {},
  },
  plugins: [
    react({
      babel: {
        plugins: ["babel-plugin-react-compiler"],
      },
    }),
    cloudflare({
      viteEnvironment: { name: "worker" },
    }),
    redwood(),
    tailwindcss(),
  ],
});
