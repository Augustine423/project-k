import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://server:4000";
const livekitTarget = process.env.VITE_LIVEKIT_PROXY_TARGET ?? "http://livekit:7880";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true },
      "/ws": { target: proxyTarget, ws: true, changeOrigin: true },
      // LiveKit signaling (WS + HTTP validate) through the Vite dev server so
      // phones on the LAN never need to reach localhost:7880 directly.
      "/livekit": {
        target: livekitTarget,
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/livekit/, ""),
      },
    },
  },
});
