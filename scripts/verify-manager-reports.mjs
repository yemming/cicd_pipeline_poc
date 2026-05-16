#!/usr/bin/env node
// Playwright CLI 驗證 Phase 3A #3：RS_M2 業績報表（/sales/manager/sales-report，
// nav 入口為「業績報表」）。
// - reuse main repo 的 .pw-state.json（避免 dev session 過期）
// - dev server 由本檔案自己起在 :3006
// - 載入 → networkidle → 200 → 無 console error → 截圖 → 關鍵元素檢查
//   → [OK] / [FAIL] log → 清 dev server
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { spawn } from "node:child_process";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MAIN_PW_STATE = "/home/ming/projects/cicd_pipeline_poc/scripts/.pw-state.json";
const WORKTREE_PW_STATE = path.join(__dirname, ".pw-state.json");
const SCREENSHOT = "/tmp/manager-reports-verify.png";
const PORT = 3006;
const BASE = `http://localhost:${PORT}`;
const TARGET = `${BASE}/sales/manager/sales-report`;

function log(tag, ...m) {
  console.log(`[${tag}]`, ...m);
}

// 1) cp main 的 pw-state（fail fast 如果不存在）
if (!fs.existsSync(MAIN_PW_STATE)) {
  log("FAIL", "missing pw-state in main repo:", MAIN_PW_STATE);
  process.exit(2);
}
fs.copyFileSync(MAIN_PW_STATE, WORKTREE_PW_STATE);
log("OK", "copied pw-state to worktree");

// 2) 起 dev server（背景）
log("info", `starting dev server on port ${PORT}…`);
const devProc = spawn(
  "npm",
  ["run", "dev", "--", "-H", "0.0.0.0", "-p", String(PORT)],
  { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_ENV: "development" } },
);

let devReady = false;
const devLog = [];
devProc.stdout.on("data", (chunk) => {
  const s = chunk.toString();
  devLog.push(s);
  if (!devReady && (s.includes("Ready in") || s.includes("- Local:") || s.includes(`localhost:${PORT}`))) {
    devReady = true;
  }
});
devProc.stderr.on("data", (chunk) => {
  devLog.push(chunk.toString());
});

async function waitForReady(timeoutMs = 90_000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (devReady) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function cleanup(code) {
  try { devProc.kill("SIGTERM"); } catch {}
  await new Promise((r) => setTimeout(r, 500));
  try { devProc.kill("SIGKILL"); } catch {}
  process.exit(code);
}

process.on("SIGINT", () => cleanup(130));
process.on("SIGTERM", () => cleanup(143));

const ready = await waitForReady();
if (!ready) {
  log("FAIL", "dev server didn't become ready in 90s");
  console.error(devLog.join("").slice(-2000));
  await cleanup(1);
}
log("OK", "dev server ready");

// 3) Playwright load
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  storageState: WORKTREE_PW_STATE,
  viewport: { width: 1440, height: 900 },
});
// 對齊 dev session scope
await ctx.addCookies([
  {
    name: "dealeros_scope",
    value: encodeURIComponent(JSON.stringify({ brand_id: "indian" })),
    url: BASE,
  },
]);
const page = await ctx.newPage();

const consoleErrors = [];
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on("console", (msg) => {
  if (msg.type() === "error") {
    const t = msg.text();
    // 排除外部資源 404 / hot reload 雜訊
    if (t.includes("Failed to load resource") || t.includes("hot-reloader")) return;
    consoleErrors.push(`console.error: ${t}`);
  }
});

let status = 0;
let finalUrl = "";
try {
  const resp = await page.goto(TARGET, { waitUntil: "domcontentloaded", timeout: 300_000 });
  status = resp?.status() ?? 0;
  finalUrl = page.url();
  log("info", `nav status=${status} url=${finalUrl}`);
  if (finalUrl.includes("/login")) {
    log("FAIL", "redirected to /login — pw-state stale, re-run scripts/pw-login.mjs in main repo");
    await browser.close();
    await cleanup(1);
  }
  await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => null);
  await page.waitForSelector('[data-testid="sales-manager-report-page"]', { timeout: 60_000 });
} catch (e) {
  log("FAIL", `navigation: ${e.message}`);
  await page.screenshot({ path: SCREENSHOT, fullPage: true }).catch(() => null);
  await browser.close();
  await cleanup(1);
}

// 4) 關鍵元素檢查
const checks = await page.evaluate(() => {
  const txt = document.body.innerText;
  const txtLower = txt.toLowerCase();
  return {
    hasPageTestId: !!document.querySelector('[data-testid="sales-manager-report-page"]'),
    hasLayer1: txtLower.includes("layer 1") && txt.includes("結果指標"),
    hasLayer2: txtLower.includes("layer 2") && txt.includes("過程指標"),
    hasLayer3: txtLower.includes("layer 3") && txt.includes("行為數據"),
    hasBep: txt.includes("損益平衡進度"),
    hasMonthly: txt.includes("近 5 個月成交台數趨勢"),
    hasRsRanking: txt.includes("RS 個人業績排行"),
    hasModels: txt.includes("車系業績分析"),
    hasWeekly: txt.includes("本月週趨勢"),
    hasExportBtn: txt.includes("匯出 Excel"),
    hasPeriodToggle: txt.includes("本月") && txt.includes("本季") && txt.includes("本年"),
    hasRsName: txt.includes("林佳蓉"),
    hasModelName: txt.includes("Panigale V4"),
    rowCount: document.querySelectorAll("tbody tr").length,
    kpiCardCount: document.querySelectorAll('[class*="border-["][class*="rounded-lg"][class*="px-3.5"]').length,
  };
});

await page.screenshot({ path: SCREENSHOT, fullPage: true });
log("info", `screenshot → ${SCREENSHOT}`);

let allOk = status >= 200 && status < 400;
for (const [k, v] of Object.entries(checks)) {
  const ok = typeof v === "boolean" ? v : v > 0;
  log(ok ? "OK" : "FAIL", `${k}: ${v}`);
  if (!ok) allOk = false;
}
if (consoleErrors.length > 0) {
  for (const e of consoleErrors) log("FAIL", e);
  allOk = false;
} else {
  log("OK", "no console errors");
}

log(allOk ? "OK" : "FAIL", `final status=${status}, url=${finalUrl}`);

await browser.close();
await cleanup(allOk ? 0 : 1);
