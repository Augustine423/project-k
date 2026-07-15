import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.DEBUG_BASE_URL ?? "https://127.0.0.1:5173";
const API = process.env.DEBUG_API_URL ?? "http://127.0.0.1:4000";
const LOG = path.resolve("src/debug-5d65c5.log");

try {
  fs.unlinkSync(LOG);
} catch {
  /* ok */
}

const createRes = await fetch(`${API}/api/rooms`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ displayName: "pw-host", mode: "interactive" }),
});
const ticket = await createRes.json();
if (!createRes.ok) {
  console.error("create failed", ticket);
  process.exit(1);
}

const roomId = ticket.room.id;
const browser = await chromium.launch({
  headless: true,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--allow-insecure-localhost",
    "--unsafely-treat-insecure-origin-as-secure=" + BASE,
  ],
});

const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  permissions: ["camera", "microphone"],
});
await context.grantPermissions(["camera", "microphone"], { origin: BASE });

const page = await context.newPage();
page.on("console", (msg) => console.log("BROWSER:", msg.type(), msg.text()));
page.on("pageerror", (err) => console.log("PAGEERROR:", err.message));

await page.addInitScript((t) => {
  const key = `projectk.ticket.${t.room.id}`;
  sessionStorage.setItem(key, JSON.stringify(t));
}, ticket);

await page.goto(`${BASE}/room/${roomId}`, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(3000);

const mic = page.getByRole("button", { name: /microphone|unmute|mute/i }).first();
const cam = page.getByRole("button", { name: /camera/i }).first();

console.log("mic visible", await mic.isVisible().catch(() => false));
console.log("cam visible", await cam.isVisible().catch(() => false));

if (await mic.isVisible().catch(() => false)) {
  await mic.click();
  await page.waitForTimeout(4000);
}
if (await cam.isVisible().catch(() => false)) {
  await cam.click();
  await page.waitForTimeout(5000);
}

// Stay connected long enough to catch negotiation/reconnect failures.
await page.waitForTimeout(8000);

const banner = await page.locator(".banner, .join-banner").allTextContents().catch(() => []);
console.log("banners:", banner);

const audioState = await page.evaluate(() => {
  const micBtn = document.querySelector('button[aria-label*="microphone"], button[aria-label*="Mute"], button[aria-label*="Unmute"]');
  const camBtn = document.querySelector('button[aria-label*="camera"], button[aria-label*="Camera"]');
  return {
    micPressed: micBtn?.getAttribute("aria-pressed"),
    camPressed: camBtn?.getAttribute("aria-pressed"),
    micLabel: micBtn?.getAttribute("aria-label"),
    camLabel: camBtn?.getAttribute("aria-label"),
  };
});
console.log("control state:", audioState);

await page.waitForTimeout(1000);
await browser.close();

if (fs.existsSync(LOG)) {
  console.log("---- LOG FILE ----");
  console.log(fs.readFileSync(LOG, "utf8"));
} else {
  console.log("NO LOG FILE at", LOG);
}
