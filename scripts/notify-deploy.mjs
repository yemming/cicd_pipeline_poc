#!/usr/bin/env node
/**
 * notify-deploy.mjs — Zeabur 部署成功後，把「本輪更新摘要」推到開發群組 LINE。
 *
 * CI/CD pipeline 的出口訊號（入口是 feedback_ticket.created）。流程：
 *   1. 取本機 HEAD commit sha
 *   2. 輪詢 `zeabur deployment list --json`，直到 HEAD 那筆 deployment status === RUNNING
 *      （= Zeabur 部署「成功」，而非部署中就發）
 *   3. 用 git log（上一個已部署 sha .. HEAD）組本輪更新摘要
 *   4. POST 到 <APP_URL>/api/deploy/released（Bearer DEPLOY_NOTIFY_TOKEN）→ 由部署環境
 *      的 Notification Hub 渲染 LINE Flex 並推播
 *
 * 用法（push 完直接跑，它會自己等部署成功）：
 *   DEPLOY_NOTIFY_TOKEN=xxx node scripts/notify-deploy.mjs
 *   # 可選 env：APP_URL（預設 https://dealeros.zeabur.app）、
 *   #          POLL_TIMEOUT_MS（預設 1800000=30min）、POLL_INTERVAL_MS（預設 20000）
 *   #          DEPLOY_SUMMARY（curated 人話摘要，多行；給非技術讀者看，跳過 git log 自動組）、
 *   #          DEPLOY_CHANGE_COUNT（搭配 DEPLOY_SUMMARY，預設取行數）
 *   # 也會自動讀 .env.local 裡的 DEPLOY_NOTIFY_TOKEN / APP_URL
 *
 * 冪等：同一 sha 重跑會重發（無狀態檔）。需要避免重複請在外層判斷。
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/* ── 讀 .env.local 補 env（不覆蓋已存在的 process.env）── */
function loadDotEnv() {
  try {
    const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, vRaw] = m;
      if (process.env[k] != null) continue;
      process.env[k] = vRaw.replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 沒有 .env.local 就算了 */
  }
}
loadDotEnv();

const APP_URL = (process.env.APP_URL ?? "https://dealeros.zeabur.app").replace(/\/$/, "");
const TOKEN = process.env.DEPLOY_NOTIFY_TOKEN;
const TIMEOUT_MS = Number(process.env.POLL_TIMEOUT_MS ?? 30 * 60 * 1000);
const INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS ?? 20 * 1000);

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}
function zeaburDeployments() {
  const out = execFileSync("zeabur", ["deployment", "list", "--json"], { encoding: "utf8" });
  return JSON.parse(out);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function twTimestamp() {
  // Asia/Taipei（UTC+8）格式化 YYYY-MM-DD HH:mm
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

async function main() {
  if (!TOKEN) {
    console.error("✗ 缺 DEPLOY_NOTIFY_TOKEN（set env 或寫進 .env.local）");
    process.exit(1);
  }

  const head = git(["rev-parse", "HEAD"]);
  const headShort = head.slice(0, 7);
  console.log(`▸ HEAD = ${headShort}，輪詢 Zeabur 直到此 commit 部署成功（RUNNING）…`);

  const deadline = Date.now() + TIMEOUT_MS;
  let deployments = null;
  let prevSha = null;

  while (Date.now() < deadline) {
    let list;
    try {
      list = zeaburDeployments();
    } catch (e) {
      console.error(`  · zeabur 查詢失敗，稍後重試：${e.message?.split("\n")[0] ?? e}`);
      await sleep(INTERVAL_MS);
      continue;
    }

    const idx = list.findIndex((d) => (d.commitSHA ?? "").startsWith(head) || head.startsWith(d.commitSHA ?? "_nope_"));
    if (idx === -1) {
      console.log(`  · 尚未在 Zeabur 看到 ${headShort}（可能還在排隊），等 ${INTERVAL_MS / 1000}s…`);
      await sleep(INTERVAL_MS);
      continue;
    }

    const dep = list[idx];
    if (dep.status === "RUNNING") {
      deployments = list;
      // 上一個「不同 commit」的部署 sha（list 為新到舊）→ git log 範圍起點
      const prev = list.slice(idx + 1).find((d) => d.commitSHA && d.commitSHA !== dep.commitSHA);
      prevSha = prev?.commitSHA ?? null;
      console.log(`✓ ${headShort} 已 RUNNING（部署成功）`);
      break;
    }
    if (dep.status === "FAILED" || dep.status === "CRASHED") {
      console.error(`✗ ${headShort} 部署狀態 ${dep.status}，不發通知`);
      process.exit(2);
    }
    console.log(`  · ${headShort} 狀態 ${dep.status}，等 ${INTERVAL_MS / 1000}s…`);
    await sleep(INTERVAL_MS);
  }

  if (!deployments) {
    console.error(`✗ 等了 ${Math.round(TIMEOUT_MS / 60000)} 分鐘仍未 RUNNING，放棄（部署可能卡住）`);
    process.exit(3);
  }

  // 組更新摘要：預設用 git log（上一個已部署 sha .. HEAD）；
  // 若提供 DEPLOY_SUMMARY env（多輪/跨日彙整、要寫人話給非技術讀者）則用 curated 摘要。
  let summary;
  let changeCount;
  if (process.env.DEPLOY_SUMMARY) {
    const customLines = process.env.DEPLOY_SUMMARY.split("\n").map((s) => s.trim()).filter(Boolean);
    summary = customLines.map((l) => (l.startsWith("•") ? l : `• ${l}`)).join("\n");
    changeCount = process.env.DEPLOY_CHANGE_COUNT ?? String(customLines.length);
  } else {
    const range = prevSha ? `${prevSha}..${head}` : "-1"; // 無前一筆 → 只取 HEAD 本身
    let lines;
    if (prevSha) {
      lines = git(["log", range, "--no-merges", "--pretty=%s"]).split("\n").filter(Boolean);
    } else {
      lines = [git(["log", "-1", "--pretty=%s"])];
    }
    const MAX = 12;
    changeCount = String(lines.length);
    const shown = lines.slice(0, MAX).map((l) => `• ${l}`);
    if (lines.length > MAX) shown.push(`…等共 ${lines.length} 項`);
    summary = shown.join("\n");
  }

  const payload = {
    version: headShort,
    summary,
    changeCount,
    deployedAt: twTimestamp(),
    url: APP_URL + "/",
  };

  console.log(`▸ 推送本輪 ${changeCount} 項更新摘要到 LINE…`);
  const res = await fetch(`${APP_URL}/api/deploy/released`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`✗ 推送失敗 HTTP ${res.status}：${text}`);
    process.exit(4);
  }
  console.log(`✓ 已推送：${text}`);
}

main().catch((e) => {
  console.error("✗ 未預期錯誤：", e);
  process.exit(1);
});
