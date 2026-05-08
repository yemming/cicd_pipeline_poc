/**
 * Wave 0 共用元件 sandbox — 內部驗證頁，不掛 nav。
 *
 * 目的：跑通 master-data queries + forms 元件 + RBAC 整條鏈路。
 * 不對 DB 做任何寫入，server action 只 sleep 模擬 round-trip 證明 spinner / 鎖 UI 有效。
 */
import { revalidatePath } from "next/cache";

import {
  listCustomers,
  listItems,
  listMotorcycleModels,
  listOrganizations,
} from "@/lib/master-data/queries";
import { getCurrentUserContext, getUserPermissions } from "@/lib/rbac/policies";
import { Combobox } from "@/components/forms/combobox";
import { DataTable } from "@/components/forms/data-table";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";

async function noopWrite(formData: FormData) {
  "use server";
  // 模擬 server round-trip：讓使用者看到 spinner / disabled 狀態
  await new Promise((r) => setTimeout(r, 1200));
  console.log("[sandbox] received:", Object.fromEntries(formData.entries()));
  revalidatePath("/admin/form-sandbox");
}

export default async function FormSandboxPage() {
  const [customers, items, models, orgs, ctx, perms] = await Promise.all([
    listCustomers({ limit: 25 }),
    listItems({ limit: 30 }),
    listMotorcycleModels(),
    listOrganizations(),
    getCurrentUserContext(),
    getUserPermissions(),
  ]);

  return (
    <main className="px-6 py-6 max-w-[1100px] space-y-6">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">Form Sandbox</h1>
        <p className="text-[13px] text-[#6B778C]">
          Wave 0 共用元件 + master-data queries + RBAC 的內部驗證頁。不寫 DB，純測 UI/資料管線。
        </p>
      </header>

      {/* RBAC 狀態 */}
      <section className="bg-white border border-[#DFE1E6] rounded-md p-4 space-y-2">
        <h2 className="text-[14px] font-bold text-[#172B4D]">當前使用者 / RBAC</h2>
        <div className="text-[13px] text-[#172B4D] grid grid-cols-2 gap-2">
          <div>
            <span className="text-[#6B778C]">User: </span>
            {ctx.email ?? "未登入"}
          </div>
          <div>
            <span className="text-[#6B778C]">Admin: </span>
            {ctx.isAdmin ? "✓" : "—"}
          </div>
          <div className="col-span-2">
            <span className="text-[#6B778C]">Roles: </span>
            {ctx.roles.length === 0
              ? "—"
              : ctx.roles.map((r) => `${r.brand_id}/${r.role}`).join(", ")}
          </div>
          <div className="col-span-2">
            <span className="text-[#6B778C]">Permissions ({perms.size}): </span>
            <span className="font-mono text-[11px]">
              {[...perms].slice(0, 8).join(", ")}
              {perms.size > 8 ? ` +${perms.size - 8} more` : ""}
            </span>
          </div>
        </div>
      </section>

      {/* Form 元件展示 */}
      <section className="bg-white border border-[#DFE1E6] rounded-md p-5 space-y-4">
        <h2 className="text-[14px] font-bold text-[#172B4D]">Form 元件（含 spinner 鎖 UI 驗證）</h2>
        <form action={noopWrite} className="grid grid-cols-2 gap-4">
          <FormField name="title" label="標題" required placeholder="一句話描述" />
          <FormField name="qty" label="數量" type="number" inputMode="numeric" defaultValue={1} />
          <SelectField
            name="org_id"
            label="組織（SelectField，&lt;30 筆）"
            required
            options={orgs.map((o) => ({
              value: o.id,
              label: o.name,
              hint: `${o.code} · L${o.level}`,
            }))}
          />
          <SelectField
            name="model_id"
            label="機車車型"
            options={models.map((m) => ({
              value: m.id,
              label: m.display_name,
              hint: m.series,
            }))}
          />
          <Combobox
            name="customer_id"
            label="客戶（Combobox，可搜尋）"
            placeholder="搜尋姓名 / 代碼 / 統編 / 電話…"
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              hint: [c.code, c.tax_id, c.phone].filter(Boolean).join(" · "),
            }))}
          />
          <Combobox
            name="item_id"
            label="料號（Combobox + 大量資料）"
            placeholder="搜尋料號或品名…"
            options={items.map((i) => ({
              value: i.id,
              label: `${i.code} ${i.name}`,
              hint: [i.category, i.control_type].filter(Boolean).join(" · "),
            }))}
          />
          <FormField
            name="notes"
            label="備註"
            multiline
            rows={3}
            className="col-span-2"
            placeholder="多行說明…"
          />
          <div className="col-span-2 flex items-center gap-3 pt-2">
            <SubmitButton idleLabel="送出（模擬寫入）" pendingLabel="送出中…" />
            <SubmitButton idleLabel="次按鈕" variant="secondary" type="button" />
            <span className="text-[12px] text-[#6B778C]">
              送出後伺服器 sleep 1.2s，期間按鈕應變 disabled 且轉圈圈
            </span>
          </div>
        </form>
      </section>

      {/* DataTable 驗證 */}
      <section className="space-y-3">
        <h2 className="text-[14px] font-bold text-[#172B4D]">
          DataTable — 客戶 (顯示 {customers.length} 筆)
        </h2>
        <DataTable
          rows={customers}
          getKey={(c) => c.id}
          columns={[
            { key: "code", header: "代碼", cell: (c) => <span className="font-mono">{c.code}</span>, width: "120px" },
            { key: "name", header: "姓名 / 公司", cell: (c) => c.name },
            { key: "type", header: "類型", cell: (c) => c.type, width: "100px" },
            { key: "tax_id", header: "統編", cell: (c) => c.tax_id ?? "—", width: "120px" },
            { key: "phone", header: "電話", cell: (c) => c.phone ?? "—", width: "140px" },
          ]}
          empty="沒有客戶資料 — 請先 seed customers 表"
        />
      </section>
    </main>
  );
}
