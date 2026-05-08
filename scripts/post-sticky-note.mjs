#!/usr/bin/env node
/**
 * 寫一張便利貼到 feedback_sticky_notes（自動化建頁 loop 用）
 *
 * Usage:
 *   node scripts/post-sticky-note.mjs <page_path> <color> <body...>
 *
 * Example:
 *   node scripts/post-sticky-note.mjs /parts/setup/control-types green "✓ Auto-build OK"
 *
 * - 走 SERVICE_ROLE，繞過 RLS
 * - x_px / y_px 採用該 page_path 既有 note 數量決定（避免疊在同位置）
 * - 同 page_path + 同 body prefix("[auto-build]") 既存的會被覆蓋更新（idempotent）
 */
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const envText = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  return Object.fromEntries(
    envText
      .split('\n')
      .filter((l) => l && !l.trim().startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
      }),
  );
}

const env = loadEnv();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in .env.local');
  process.exit(2);
}

const [pagePathArg, colorArg, ...bodyParts] = process.argv.slice(2);
if (!pagePathArg || !colorArg || bodyParts.length === 0) {
  console.error(
    'Usage: node scripts/post-sticky-note.mjs <page_path> <color> <body...>',
  );
  process.exit(2);
}
const ALLOWED_COLORS = new Set(['yellow', 'green', 'red', 'blue', 'pink']);
const color = ALLOWED_COLORS.has(colorArg) ? colorArg : 'yellow';
const page_path = pagePathArg;
const body = bodyParts.join(' ').slice(0, 1500); // 防呆截斷

const REST = `${SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

const AUTO_PREFIX = '[auto-build]';

// 1) 先看同 page_path 上既有便利貼數量（決定 x_px/y_px），順便找有沒有同樣的 [auto-build] note 可以覆蓋
const listResp = await fetch(
  `${REST}/feedback_sticky_notes?page_path=eq.${encodeURIComponent(page_path)}&select=id,body,x_px,y_px&order=created_at.asc`,
  { headers },
);
if (!listResp.ok) {
  console.error('List existing notes failed:', listResp.status, await listResp.text());
  process.exit(1);
}
const existing = await listResp.json();

const autoNote = existing.find(
  (n) => typeof n.body === 'string' && n.body.startsWith(AUTO_PREFIX),
);

const finalBody = body.startsWith(AUTO_PREFIX) ? body : `${AUTO_PREFIX} ${body}`;

if (autoNote) {
  // PATCH 既有 auto-build note
  const r = await fetch(
    `${REST}/feedback_sticky_notes?id=eq.${autoNote.id}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ body: finalBody, color, updated_at: new Date().toISOString(), resolved_at: null }),
    },
  );
  if (!r.ok) {
    console.error('PATCH failed:', r.status, await r.text());
    process.exit(1);
  }
  const out = await r.json();
  console.log(JSON.stringify({ ok: true, mode: 'updated', id: out[0]?.id, color, page_path }));
  process.exit(0);
}

// 2) 沒有 → INSERT，避開既有 note 位置
const x_px = 50 + (existing.length % 4) * 250;
const y_px = 80 + Math.floor(existing.length / 4) * 180;

const r = await fetch(`${REST}/feedback_sticky_notes`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    page_path,
    page_title: page_path,
    body: finalBody,
    color,
    x_px,
    y_px,
    brand_id: 'ducati',
  }),
});
if (!r.ok) {
  console.error('INSERT failed:', r.status, await r.text());
  process.exit(1);
}
const out = await r.json();
console.log(JSON.stringify({ ok: true, mode: 'inserted', id: out[0]?.id, color, page_path }));
