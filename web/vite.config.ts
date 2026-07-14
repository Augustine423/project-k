import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://server:4000";
const janusTarget = process.env.VITE_JANUS_PROXY_TARGET ?? "http://janus:8188";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true },
      "/ws": { target: proxyTarget, ws: true, changeOrigin: true },
      // Janus WebSocket signaling through Vite dev server for LAN/mobile testing.
      "/janus": {
        target: janusTarget,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/janus/, ""),
      },
    },
  },
});
