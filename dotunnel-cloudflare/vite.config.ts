import { cloudflare } from "@cloudflare/vite-plugin";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
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
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    cloudflare({
      viteEnvironment: { name: "worker" },
    }),
    redwood(),
    tailwindcss(),
  ],
});
