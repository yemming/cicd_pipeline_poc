import { chromium } from "@playwright/test";
const BASE = "https://dealeros.zeabur.app";
const HOST = "dealeros.zeabur.app";
const RO = "bdc7934a-0553-4b01-97a0-4ba63b884868";
const OUT = "/Users/mbp2020/Documents/cicd_pipeline_poc/docs/20260617/shots-real";

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 760 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.fill('input[type=email]', "yemming.yu@gmail.com");
await p.fill('input[type=password]', "yemming.yu@gmail.com");
await p.click('button[type=submit]');
await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25000 }).catch(() => {});
await ctx.addCookies([{ name: "dealeros_scope", value: JSON.stringify({ brand_id: "indian", store_id: null }), domain: HOST, path: "/" }]);
await p.goto(`${BASE}/parts/aftersales/repair-orders/${RO}`, { waitUntil: "networkidle" });
await p.waitForTimeout(1500);
// 視窗上半部（標題 + badge 列）裁切
await p.screenshot({ path: `${OUT}/09_borrowed-not-returned-closeup.png`, clip: { x: 230, y: 70, width: 1040, height: 230 } });
const badge = p.locator('[data-testid="tl-loan-outstanding-badge"]');
console.log("badge:", await badge.count(), await badge.first().textContent().catch(() => ""));
await b.close();
