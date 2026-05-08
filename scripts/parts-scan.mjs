#!/usr/bin/env node
/**
 * 掃描 PARTS_PAGE_META 與 (workspace)/parts/ 目錄結構，列出已建 / 待建頁面。
 * 已建判定：specific route 檔案存在 (src/app/(workspace){path}/page.tsx)
 * 待建判定：沒有 specific route → 走 catch-all
 *
 * Usage:
 *   node scripts/parts-scan.mjs              # 印 markdown 表
 *   node scripts/parts-scan.mjs --pending    # 只印 pending 路徑（一行一條，給 pipe 用）
 *   node scripts/parts-scan.mjs --json       # JSON output
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const metaFile = path.join(ROOT, 'src/app/(workspace)/parts/[...slug]/page.tsx');
const meta = fs.readFileSync(metaFile, 'utf8');

const re = /"(\/parts\/[^"]+)":\s*\{\s*name:\s*"([^"]+)",\s*group:\s*"([^"]+)",\s*icon:\s*"([^"]+)"(?:,\s*htmlFile:\s*"([^"]+)")?/g;
const all = [];
let m;
while ((m = re.exec(meta))) {
  all.push({
    path: m[1],
    title: m[2],
    group: m[3],
    icon: m[4],
    htmlFile: m[5] ?? null,
  });
}

function hasSpecificRoute(p) {
  if (p === '/parts') return true;
  const file = path.join(ROOT, 'src/app/(workspace)' + p + '/page.tsx');
  return fs.existsSync(file);
}

const built = [];
const pending = [];
for (const r of all) {
  (hasSpecificRoute(r.path) ? built : pending).push(r);
}

const flag = process.argv[2];

if (flag === '--pending') {
  pending.forEach((r) => console.log(r.path));
  process.exit(0);
}

if (flag === '--json') {
  console.log(
    JSON.stringify(
      { total: all.length, built_count: built.length, pending_count: pending.length, built, pending },
      null,
      2,
    ),
  );
  process.exit(0);
}

// 預設 markdown
console.log(`# Parts pages scan\n`);
console.log(`- Total: **${all.length}**`);
console.log(`- Built: **${built.length}** (specific route)`);
console.log(`- Pending: **${pending.length}** (catch-all)\n`);

const groupMap = new Map();
for (const r of pending) {
  if (!groupMap.has(r.group)) groupMap.set(r.group, []);
  groupMap.get(r.group).push(r);
}

console.log(`## Pending\n`);
console.log('| Group | Path | Title | Stitch |');
console.log('|-------|------|-------|--------|');
for (const [group, rows] of groupMap) {
  for (const r of rows) {
    console.log(`| ${group} | \`${r.path}\` | ${r.title} | ${r.htmlFile ?? '—'} |`);
  }
}

console.log(`\n## Built\n`);
console.log('| Path | Title |');
console.log('|------|-------|');
for (const r of built) {
  console.log(`| \`${r.path}\` | ${r.title} |`);
}
