// Janus HTML demos load adapter.js before janus.js so the global `adapter`
// exists. With Vite/ESM there is no global — pass webrtc-adapter explicitly.
import adapter from "webrtc-adapter";
import Janus from "janus-gateway";

let janusLibInitialized = false;

export function ensureJanusInit(): Promise<void> {
  if (janusLibInitialized) return Promise.resolve();
  return new Promise((resolve) => {
    Janus.init({
      debug: false,
      dependencies: Janus.useDefaultDependencies({ adapter }),
      callback: () => {
        janusLibInitialized = true;
        resolve();
      },
    });
  });
}
