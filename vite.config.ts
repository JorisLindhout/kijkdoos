import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  resolve: {
    alias: [
      {
        find: /^three$/,
        replacement: decodeURIComponent(
          new URL("./node_modules/three/build/three.module.js", import.meta.url).pathname,
        ),
      },
    ],
    dedupe: ["react", "react-dom", "three"],
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
