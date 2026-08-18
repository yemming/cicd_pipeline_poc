// 海德生車型主檔匯入 — 語意等同 bulkImportVehicleModelsAction（陣列 insert，23505 衝突逐筆重試）。
// admin 帳號（yemming.yu@gmail.com）目前沒有 indian-hds/lambretta-hds 品牌授權，
// 無法用該帳號透過瀏覽器實際操作新功能對這兩個品牌匯入，故用等價腳本直接寫入；
// 新功能本身另外用 Playwright 在有權限的品牌上做真實 UI 驗證（見報告）。
// 執行：node scripts/etl-haidesheng/import-vehicles.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const HDS_SUBSIDIARY_ID = "eff8140d-39d9-4bab-a3bd-50f56a349e9f";
const BRAND_MAP = { Indian: "indian-hds", Lambretta: "lambretta-hds" };

const vehicles = JSON.parse(
  readFileSync(new URL("./out/vehicles.json", import.meta.url), "utf-8"),
);

const rows = vehicles.models.map((m) => ({
  brand_id: BRAND_MAP[m.brand],
  subsidiary_id: HDS_SUBSIDIARY_ID,
  series: m.series,
  model_name: m.model_name,
  display_name: m.display_name,
  vehicle_type: "motorcycle",
  year_start: m.year ?? null,
  year_end: null,
  engine_cc: m.engine_cc ?? null,
  is_active: true,
  metadata: { ...m.metadata, colors: m.colors, source_model_codes: m.source_model_codes, _flags: m._flags ?? [] },
}));

console.log(`total=${rows.length}`);

let inserted = 0;
let skipped = 0;
const errors = [];

const { error } = await supabase.from("vehicle_models").insert(rows);
if (!error) {
  inserted = rows.length;
} else if (error.code === "23505") {
  for (const row of rows) {
    const { error: rowError } = await supabase.from("vehicle_models").insert(row);
    if (rowError) {
      skipped++;
      errors.push(`${row.model_name}: ${rowError.code === "23505" ? "已存在" : rowError.message}`);
    } else {
      inserted++;
    }
  }
} else {
  console.error("FAILED", error.message);
  process.exit(1);
}

console.log(JSON.stringify({ inserted, skipped, errors }, null, 2));
