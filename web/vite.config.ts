import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://server:4000";
const livekitTarget = process.env.VITE_LIVEKIT_PROXY_TARGET ?? "http://livekit:7880";

/** Same-origin debug sink: append NDJSON even if host ingest proxy is unreachable. */
function agentDebugLogPlugin(): Plugin {
  return {
    name: "agent-debug-log",
    configureServer(server) {
      server.middlewares.use("/__agent_debug", (req, res, next) => {
        if (req.method !== "POST") return next();
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        req.on("end", () => {
          const line = Buffer.concat(chunks).toString("utf8").trim();
          if (line) {
            const targets = [
              path.resolve(process.cwd(), "src", "debug-5d65c5.log"),
              path.resolve(process.cwd(), "..", ".cursor", "debug-5d65c5.log"),
              path.resolve(process.cwd(), "..", "debug-5d65c5.log"),
            ];
            for (const file of targets) {
              try {
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.appendFileSync(file, line + "\n");
              } catch {
                /* ignore missing mount / permissions */
              }
            }
          }
          res.statusCode = 204;
          res.end();
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), basicSsl(), agentDebugLogPlugin()],
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
