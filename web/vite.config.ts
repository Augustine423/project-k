import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://127.0.0.1:4000";
const livekitTarget = process.env.VITE_LIVEKIT_PROXY_TARGET ?? "http://127.0.0.1:7880";

export default defineConfig({
  plugins: [react(), basicSsl()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true, secure: false },
      "/ws": { target: proxyTarget, ws: true, changeOrigin: true, secure: false },
      "/livekit": {
        target: livekitTarget,
        changeOrigin: true,
        ws: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/livekit/, ""),
      },
    },
  },
});
