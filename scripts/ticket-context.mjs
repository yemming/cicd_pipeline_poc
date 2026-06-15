#!/usr/bin/env node
// @ts-check
/**
 * ticket-context.mjs — 把一張許願單的「全部輸入」materialize 成檔案，給實作 agent 一次吃進去。
 *
 * DevOps 的前置：實作端 agent 接單前，要能讀到使用者用「任何形式」貼的需求。四個管道：
 *   ① 需求 description（feedback_tickets.description）
 *   ② 留言 comments（feedback_comments）
 *   ③ 附件 attachments（ticket-level: metadata.attachments[]；comment-level: feedback_comment_attachments）→ 從 storage 下載
 *   ④ 白板 canvas（feedback_canvas_snapshots.snapshot）→ 抽 text element + 把內嵌圖 files[].dataURL 解成 PNG
 *
 * 輸出到 tickets-context/<shortid>/：
 *   context.md（彙整：需求/留言/驗收/附件清單/白板文字）+ 所有圖檔（白板截圖、附件）
 * agent 只要 Read 這個資料夾就拿到全貌（圖可直接視覺讀）。
 *
 * 跑法：node --env-file=.env.local scripts/ticket-context.mjs <ticketId|前6碼>
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, "..");
const BUCKET = "feedback-attachments";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const arg = process.argv[2];
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };
if (!arg) die("用法：node --env-file=.env.local scripts/ticket-context.mjs <ticketId|前6碼>");
if (!SUPABASE_URL || !SERVICE_KEY) die("缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");

const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

/** 把 dataURL（data:image/png;base64,xxx）寫成檔案，回副檔名 */
function writeDataUrl(dataUrl, outBase) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl ?? "");
  if (!m) return null;
  const ext = m[1].split("/")[1]?.replace("+xml", "") || "bin";
  const path = `${outBase}.${ext}`;
  writeFileSync(path, Buffer.from(m[2], "base64"));
  return path;
}

async function main() {
  // 找單據
  let ticket;
  if (arg.length === 36) {
    const { data } = await sb.from("feedback_tickets").select("*").eq("id", arg).maybeSingle();
    ticket = data;
  } else {
    const { data } = await sb.from("feedback_tickets").select("*").limit(500);
    ticket = (data ?? []).find((t) => t.id.startsWith(arg));
  }
  if (!ticket) die(`找不到單據 ${arg}`);

  const short = ticket.id.slice(0, 8);
  const outDir = resolve(PROJECT_ROOT, "tickets-context", short);
  mkdirSync(outDir, { recursive: true });
  const meta = ticket.metadata ?? {};
  const lines = [];
  const channels = { desc: false, comments: 0, attachments: 0, canvasText: 0, canvasImages: 0 };

  lines.push(`# Ticket Context — #${short}`, "", `**標題**：${ticket.title}`, `**狀態**：${ticket.status}`, "");

  // ① 需求
  lines.push("## ① 需求 description", "", ticket.description?.trim() || "（空）", "");
  channels.desc = !!ticket.description?.trim();

  // 範圍 + 驗收（②③ 規格層）
  if (meta.scope?.route) lines.push("## 範圍 scope", "", `- route: ${meta.scope.route}`, meta.scope.area ? `- area: ${meta.scope.area}` : "", "");
  const acc = Array.isArray(meta.acceptance) ? meta.acceptance : [];
  if (acc.length) {
    lines.push("## 驗收 acceptance");
    for (const c of acc) lines.push(`- ${c.id}: 給定「${c.given}」當「${c.when}」則「${c.then}」`);
    lines.push("");
  }

  // ② 留言
  const { data: comments } = await sb
    .from("feedback_comments")
    .select("body, created_at, author_id")
    .eq("ticket_id", ticket.id)
    .order("created_at", { ascending: true });
  channels.comments = comments?.length ?? 0;
  if (channels.comments) {
    lines.push("## ② 留言 comments");
    for (const c of comments) lines.push(`- [${c.created_at}] ${c.body}`);
    lines.push("");
  }

  // ③ 附件（ticket-level metadata.attachments + comment-level）→ 下載
  lines.push("## ③ 附件 attachments");
  const attPaths = [];
  for (const a of meta.attachments ?? []) attPaths.push({ path: a.storage_path, name: a.file_name });
  const { data: catts } = await sb
    .from("feedback_comment_attachments")
    .select("storage_path, file_name, comment_id")
    .in("comment_id", (comments ?? []).map((_, i) => i).length ? (await sb.from("feedback_comments").select("id").eq("ticket_id", ticket.id)).data?.map((r) => r.id) ?? [] : []);
  for (const a of catts ?? []) attPaths.push({ path: a.storage_path, name: a.file_name });

  for (const a of attPaths) {
    const { data: blob, error } = await sb.storage.from(BUCKET).download(a.path);
    if (error || !blob) { lines.push(`- ⚠️ 下載失敗：${a.name}（${error?.message}）`); continue; }
    const buf = Buffer.from(await blob.arrayBuffer());
    const ext = extname(a.name) || ".bin";
    const localName = `att_${attPaths.indexOf(a) + 1}${ext}`;
    writeFileSync(resolve(outDir, localName), buf);
    lines.push(`- ${a.name} → ${localName}（${(buf.length / 1024).toFixed(0)} KB）`);
    channels.attachments++;
  }
  if (!channels.attachments) lines.push("（無）");
  lines.push("");

  // ④ 白板 canvas → 抽 text + 解內嵌圖
  const { data: canvas } = await sb
    .from("feedback_canvas_snapshots")
    .select("snapshot")
    .eq("ticket_id", ticket.id)
    .maybeSingle();
  lines.push("## ④ 白板 canvas");
  if (!canvas?.snapshot) {
    lines.push("（無白板）", "");
  } else {
    const snap = canvas.snapshot;
    const els = Array.isArray(snap.elements) ? snap.elements : [];
    const texts = els.filter((e) => e.type === "text" && e.text).map((e) => e.text);
    channels.canvasText = texts.length;
    if (texts.length) { lines.push("**白板文字元素**："); for (const t of texts) lines.push(`- ${t}`); }
    // 內嵌圖：files{ fileKey: { dataURL } }
    const files = snap.files ?? {};
    let idx = 0;
    for (const key of Object.keys(files)) {
      idx++;
      const out = writeDataUrl(files[key]?.dataURL, resolve(outDir, `canvas_${idx}`));
      if (out) { lines.push(`- 白板內嵌圖 ${idx} → ${out.split("/").pop()}`); channels.canvasImages++; }
    }
    lines.push(`（白板：${texts.length} 文字 / ${channels.canvasImages} 內嵌圖）`, "");
  }

  // 摘要
  lines.push("---", "", "## 讀取摘要（DevOps 前置自檢）",
    `- ① 需求：${channels.desc ? "✓" : "—"}`,
    `- ② 留言：${channels.comments} 則`,
    `- ③ 附件：${channels.attachments} 個（已下載）`,
    `- ④ 白板：${channels.canvasText} 文字 / ${channels.canvasImages} 圖（已解出）`);

  writeFileSync(resolve(outDir, "context.md"), lines.join("\n"));
  console.log(`\n✅ 已打包 → tickets-context/${short}/`);
  console.log(`   ① 需求 ${channels.desc ? "✓" : "—"}｜② 留言 ${channels.comments}｜③ 附件 ${channels.attachments}｜④ 白板 ${channels.canvasText}字/${channels.canvasImages}圖`);
  console.log(`   context.md + 圖檔已寫出，agent 可直接 Read 此資料夾\n`);
}

main().catch((e) => die(e instanceof Error ? e.message : String(e)));
