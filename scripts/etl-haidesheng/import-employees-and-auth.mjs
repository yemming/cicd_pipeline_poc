// 海德生 18 位員工 — employees 表新增 + Supabase Auth 帳號建立 + user_id 關聯。
// 角色（role_codes / user_assignments 操作範圍）刻意不指派：對照表未取得，見報告「誠實揭露限制」。
// 密碼只印到 stdout，不寫入任何檔案（避免進 git 歷史）。
// 執行：node scripts/etl-haidesheng/import-employees-and-auth.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import crypto from "node:crypto";

for (const line of readFileSync(".env.local", "utf-8").split("\n")) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const HDS_SUBSIDIARY_ID = "eff8140d-39d9-4bab-a3bd-50f56a349e9f"; // brands.default_subsidiary_id（indian-hds/lambretta-hds/polaris-hds 共用）
const HDS_BRAND_ID = "indian-hds"; // employees.brand_id 為 NOT NULL 單一欄位，18人主要對應 Indian 經銷體系；跨品牌可視範圍另由 user_assignments 處理

const org = JSON.parse(
  readFileSync(new URL("./out/org.json", import.meta.url), "utf-8"),
);

function genPassword() {
  // 12 碼：大寫+小寫+數字+符號各至少一個
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%";
  const all = upper + lower + digit + sym;
  let pw = [
    upper[crypto.randomInt(upper.length)],
    lower[crypto.randomInt(lower.length)],
    digit[crypto.randomInt(digit.length)],
    sym[crypto.randomInt(sym.length)],
  ];
  for (let i = 0; i < 8; i++) pw.push(all[crypto.randomInt(all.length)]);
  // shuffle
  for (let i = pw.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [pw[i], pw[j]] = [pw[j], pw[i]];
  }
  return pw.join("");
}

const results = [];

for (const emp of org.employees) {
  const password = genPassword();

  // 1) Supabase Auth 帳號
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email: emp.email,
    password,
    email_confirm: true,
    user_metadata: { name: emp.name, name_en: emp.name_en, source: "haidesheng_import_20260820" },
  });
  if (authError) {
    console.error(`AUTH FAIL ${emp.emp_code} ${emp.email}: ${authError.message}`);
    results.push({ emp_code: emp.emp_code, email: emp.email, ok: false, error: authError.message });
    continue;
  }
  const userId = authData.user.id;

  // 2) employees 表
  const { data: empRow, error: empError } = await supabase
    .from("employees")
    .insert({
      brand_id: HDS_BRAND_ID,
      subsidiary_id: HDS_SUBSIDIARY_ID,
      user_id: userId,
      emp_code: emp.emp_code,
      name: emp.name,
      email: emp.email,
      phone: emp.phone ?? null,
      position: emp.title_raw,
      employment_status: "active",
      is_active: true,
      external_source: "haidesheng_etl_20260810",
      metadata: {
        name_en: emp.name_en,
        ext: emp.ext ?? null,
        org_unit_raw: emp.org_unit_raw,
        resolved_node_code: emp.resolved_node_code,
        role_mapping_status: "role_missing_pending_client_confirmation",
        _flags: emp._flags ?? [],
      },
    })
    .select("id")
    .single();

  if (empError) {
    console.error(`EMPLOYEES FAIL ${emp.emp_code}: ${empError.message}`);
    results.push({ emp_code: emp.emp_code, email: emp.email, ok: false, error: empError.message, authUserId: userId });
    continue;
  }

  console.log(`OK ${emp.emp_code} ${emp.name}(${emp.name_en}) ${emp.email} -> employee=${empRow.id} auth=${userId}`);
  results.push({ emp_code: emp.emp_code, name: emp.name, email: emp.email, password, ok: true, employeeId: empRow.id, authUserId: userId });
}

console.log("\n=== 帳密清單（僅印到終端機，不寫入任何檔案）===");
for (const r of results) {
  if (r.ok) console.log(`${r.email}\t${r.password}`);
}
console.log(`\n成功 ${results.filter((r) => r.ok).length} / 總數 ${results.length}`);
