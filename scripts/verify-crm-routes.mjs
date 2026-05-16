/**
 * Verify CRM batch move (Phase 2A):
 *   1. 12 new /crm/* routes return 200, no /login redirect.
 *   2. 2 old paths redirect to the corresponding new path.
 *
 * Usage: assumes dev server running at http://localhost:3003.
 * Reuses /home/ming/projects/cicd_pipeline_poc/scripts/.pw-state.json for auth.
 */

import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3003";

const STATE_PATH = "/home/ming/projects/cicd_pipeline_poc/scripts/.pw-state.json";

const NEW_ROUTES = [
  "/crm/sales/customer-base",
  "/crm/sales/survey-templates",
  "/crm/sales/call-tasks",
  "/crm/sales/dormant-leads",
  "/crm/sales/nps",
  "/crm/sales/push-notifications",
  "/crm/aftersales/customer-base",
  "/crm/aftersales/survey-templates",
  "/crm/aftersales/call-tasks",
  "/crm/aftersales/dormant-customers",
  "/crm/aftersales/nps",
  "/crm/aftersales/push-notifications",
];

const REDIRECT_CHECKS = [
  { from: "/sales/crm/customer-base", to: "/crm/sales/customer-base" },
  { from: "/sales/crm/nps-dashboard", to: "/crm/sales/nps" },
];

if (!fs.existsSync(STATE_PATH)) {
  console.error(`[FAIL] storage state not found: ${STATE_PATH}`);
  process.exit(1);
}

const failures = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STATE_PATH });
const page = await context.newPage();

// 1) new routes — expect 200, no /login redirect
for (const route of NEW_ROUTES) {
  const url = BASE + route;
  try {
    const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const status = response?.status() ?? 0;
    const finalUrl = page.url();
    const isLogin = finalUrl.includes("/login");
    if (status !== 200 || isLogin) {
      failures.push(`${route} status=${status} final=${finalUrl}`);
      console.log(`[FAIL] ${route}  status=${status}  final=${finalUrl}`);
    } else {
      console.log(`[ OK ] ${route}  status=${status}`);
    }
  } catch (err) {
    failures.push(`${route} threw ${err.message}`);
    console.log(`[FAIL] ${route}  threw ${err.message}`);
  }
}

// 2) redirect checks — final URL must start with `to`
for (const { from, to } of REDIRECT_CHECKS) {
  const url = BASE + from;
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    const finalUrl = page.url();
    const expected = BASE + to;
    if (!finalUrl.startsWith(expected)) {
      failures.push(`redirect ${from} -> expected ${to}, got ${finalUrl}`);
      console.log(`[FAIL] redirect ${from} expected ${expected}, got ${finalUrl}`);
    } else {
      console.log(`[ OK ] redirect ${from} -> ${finalUrl.replace(BASE, "")}`);
    }
  } catch (err) {
    failures.push(`redirect ${from} threw ${err.message}`);
    console.log(`[FAIL] redirect ${from} threw ${err.message}`);
  }
}

await browser.close();

if (failures.length === 0) {
  console.log(`\n[OK] ${NEW_ROUTES.length} routes + ${REDIRECT_CHECKS.length} redirects verified`);
  process.exit(0);
} else {
  console.log(`\n[FAIL] ${failures.length} failure(s):`);
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
