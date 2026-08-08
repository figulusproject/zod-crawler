import path from "path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    outDir: "dist/client",
  },
  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${process.env.EXPRESS_DEV_PORT ?? 3001}`,
      },
    },
  },
});
