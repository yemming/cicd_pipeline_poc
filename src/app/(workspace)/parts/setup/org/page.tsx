import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { listRegions, listStores, listWarehouses } from "@/domain/org";

export const dynamic = "force-dynamic";

const TYPE_LABELS: Record<string, string> = {
  main: "主倉",
  temporary: "臨時倉",
  consignment: "寄存倉",
  warranty: "保固倉",
  transit: "在途倉",
  quarantine: "隔離倉",
  virtual: "虛擬倉",
};

export default async function OrgOverviewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ORG_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視組織的權限</p>
      </main>
    );
  }
  const [regionsRes, storesRes, warehousesRes] = await Promise.all([
    listRegions(),
    listStores(),
    listWarehouses(),
  ]);
  const regions = regionsRes.data;
  const stores = storesRes.data;
  const warehouses = warehousesRes.data;

  const storeMap = new Map(stores.map((s) => [s.id, s]));

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">組織三層架構</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">1.1</span>
        <span className="text-[12px] text-[#9A9890]">
          銷售區域 → 門店 → 倉庫　三層組織結構唯讀總覽
        </span>
      </header>

      <div className="px-4 py-2.5 rounded-lg bg-[#EAF4FB] border border-[#B5D4F4] text-[12px] text-[#185FA5]">
        📋 此頁為唯讀總覽。新增 / 修改請至各分頁：
        <Link href="/parts/setup/regions" className="ml-1 underline hover:text-[#1A3A5C]">銷售區域</Link>
        <span className="mx-1">·</span>
        <Link href="/parts/setup/stores" className="underline hover:text-[#1A3A5C]">門店</Link>
        <span className="mx-1">·</span>
        <Link href="/parts/setup/warehouses" className="underline hover:text-[#1A3A5C]">倉庫</Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">🗺 銷售區域（第一層）</span>
            <Link href="/parts/setup/regions" className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] flex items-center">前往管理 →</Link>
          </header>
          <div className="px-4 py-3">
            {regions.length === 0 ? (
              <p className="text-[12px] text-[#9A9890]">尚無區域。</p>
            ) : (
              <ul className="divide-y divide-[#F8F7F4]">
                {regions.map((r) => (
                  <li key={r.id} className="py-2 flex items-center justify-between">
                    <div>
                      <Link href={`/parts/setup/regions/${r.id}`} className="text-[12.5px] text-[#185FA5] hover:underline font-medium">{r.name}</Link>
                      <span className="ml-2 font-mono text-[11px] text-[#9A9890]">{r.code}</span>
                      {r.notes && <div className="text-[11px] text-[#9A9890] mt-0.5">涵蓋：{r.notes}</div>}
                    </div>
                    {r.is_active ? (
                      <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">🏪 門店（第二層）</span>
            <Link href="/parts/setup/stores" className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] flex items-center">前往管理 →</Link>
          </header>
          <div className="px-4 py-3">
            {stores.length === 0 ? (
              <p className="text-[12px] text-[#9A9890]">尚無門店。</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="text-[11px] text-[#9A9890]">
                  <tr>
                    <th className="text-left font-medium py-1.5">代碼</th>
                    <th className="text-left font-medium py-1.5">名稱</th>
                    <th className="text-left font-medium py-1.5">類型</th>
                    <th className="text-left font-medium py-1.5">狀態</th>
                  </tr>
                </thead>
                <tbody>
                  {stores.map((s) => (
                    <tr key={s.id} className="border-t border-[#F8F7F4]">
                      <td className="py-1.5 font-mono">
                        <Link href={`/parts/setup/stores/${s.id}`} className="text-[#185FA5] hover:underline">{s.code}</Link>
                      </td>
                      <td className="py-1.5">{s.name}</td>
                      <td className="py-1.5">
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
                          {s.store_type === "dealer" ? "經銷" : "直營"}
                        </span>
                      </td>
                      <td className="py-1.5">
                        {s.is_active ? (
                          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">🏗 倉庫（第三層）</span>
          <span className="text-[12px] text-[#9A9890]">每間門店可設定多個倉庫</span>
          <Link href="/parts/setup/warehouses" className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] flex items-center">前往管理 →</Link>
        </header>
        <div className="px-4 py-3">
          {warehouses.length === 0 ? (
            <p className="text-[12px] text-[#9A9890]">尚無倉庫。</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
                <tr>
                  <th className="text-left font-medium py-1.5 px-3">倉庫名稱</th>
                  <th className="text-left font-medium py-1.5 px-3">所屬門店</th>
                  <th className="text-left font-medium py-1.5 px-3">類型</th>
                  <th className="text-left font-medium py-1.5 px-3">狀態</th>
                </tr>
              </thead>
              <tbody>
                {warehouses.map((w) => (
                  <tr key={w.id} className="border-t border-[#F8F7F4]">
                    <td className="py-1.5 px-3">
                      <Link href={`/parts/setup/warehouses/${w.id}`} className="text-[#185FA5] hover:underline"><b>{w.name}</b></Link>
                      <span className="ml-1 font-mono text-[11px] text-[#9A9890]">{w.code}</span>
                    </td>
                    <td className="py-1.5 px-3 text-[12px]">
                      {w.org_id ? storeMap.get(w.org_id)?.name ?? "—" : "—"}
                    </td>
                    <td className="py-1.5 px-3">
                      <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">{TYPE_LABELS[w.type] ?? w.type}</span>
                    </td>
                    <td className="py-1.5 px-3">
                      {w.is_active ? (
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">啟用</span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">停用</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </main>
  );
}
