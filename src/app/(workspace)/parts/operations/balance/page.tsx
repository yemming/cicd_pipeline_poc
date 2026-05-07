import { PartsShell } from "@/components/parts/parts-shell";
import { createClient } from "@/lib/supabase/server";
import { BalanceFilters } from "./_components/balance-filters";

type SearchParams = Promise<{
  q?: string;
  warehouse?: string;
  abc?: string;
}>;

export default async function StockBalancePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const q = (params.q ?? "").trim();
  const warehouseFilter = params.warehouse ?? "";
  const abcFilter = params.abc ?? "";

  const supabase = await createClient();

  let query = supabase.from("v_stock_balances").select("*");
  if (q) {
    query = query.or(`item_code.ilike.%${q}%,item_name.ilike.%${q}%`);
  }
  if (warehouseFilter) {
    query = query.eq("warehouse_id", warehouseFilter);
  }
  if (abcFilter) {
    query = query.eq("abc_class", abcFilter);
  }
  const [{ data: balances }, { data: warehouses }] = await Promise.all([
    query.order("item_code", { ascending: true }),
    supabase.from("warehouses").select("id, code, name").eq("is_active", true).order("code"),
  ]);

  const list = balances ?? [];

  // 統計
  const totals = list.reduce(
    (acc, row) => {
      acc.totalSku += 1;
      acc.totalAvailable += Number(row.qty_available ?? 0);
      acc.totalFrozen += Number(row.qty_frozen ?? 0);
      acc.totalReserved += Number(row.qty_reserved ?? 0);
      acc.totalConsignment += Number(row.qty_consignment ?? 0);
      acc.totalValue += Number(row.qty_total ?? 0) * Number(row.avg_unit_cost ?? 0);
      return acc;
    },
    {
      totalSku: 0,
      totalAvailable: 0,
      totalFrozen: 0,
      totalReserved: 0,
      totalConsignment: 0,
      totalValue: 0,
    },
  );

  return (
    <PartsShell
      title="庫存查詢"
      chapter="6.4"
      description="跨倉庫即時庫存(可用 / 凍結 / 寄存 / 在途)"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "庫存作業" },
        { label: "庫存查詢" },
      ]}
    >
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <Stat label="料件種類" value={totals.totalSku} unit="種" color="text-[#1A3A5C]" />
        <Stat
          label="可用庫存"
          value={Math.round(totals.totalAvailable)}
          unit="件"
          color="text-[#0F6E56]"
        />
        <Stat
          label="預留 + 在途"
          value={Math.round(totals.totalReserved)}
          unit="件"
          color="text-[#7F77DD]"
        />
        <Stat
          label="凍結 + 隔離"
          value={Math.round(totals.totalFrozen)}
          unit="件"
          color="text-[#CC0000]"
        />
        <Stat
          label="總庫存價值"
          value={`NT$ ${Math.round(totals.totalValue).toLocaleString()}`}
          color="text-[#185FA5]"
        />
      </div>

      <BalanceFilters
        warehouses={(warehouses ?? []).map((w) => ({ id: w.id, code: w.code, name: w.name }))}
        currentQ={q}
        currentWarehouse={warehouseFilter}
        currentAbc={abcFilter}
      />

      <div className="bg-white rounded-lg border border-[#EEECE6] overflow-hidden mt-3">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] min-w-[900px]">
            <thead className="bg-[#FAFAF9] text-[10px] text-[#6B6A68] uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 px-3 font-semibold">料件</th>
                <th className="text-left py-2 px-3 font-semibold">分類</th>
                <th className="text-center py-2 px-3 font-semibold">ABC</th>
                <th className="text-left py-2 px-3 font-semibold">倉庫</th>
                <th className="text-right py-2 px-3 font-semibold">可用</th>
                <th className="text-right py-2 px-3 font-semibold">預留</th>
                <th className="text-right py-2 px-3 font-semibold">在途</th>
                <th className="text-right py-2 px-3 font-semibold">凍結</th>
                <th className="text-right py-2 px-3 font-semibold">寄存</th>
                <th className="text-right py-2 px-3 font-semibold">總量</th>
                <th className="text-right py-2 px-3 font-semibold">均價</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-[#9A9890]">
                    沒有符合條件的庫存資料
                  </td>
                </tr>
              ) : (
                list.map((row) => (
                  <tr
                    key={`${row.item_id}-${row.warehouse_id}`}
                    className="border-t border-[#F5F5F4] hover:bg-[#FAFAF9]"
                  >
                    <td className="py-2 px-3">
                      <div className="font-medium">{row.item_name}</div>
                      <div className="text-[10px] text-[#9A9890] font-mono">{row.item_code}</div>
                    </td>
                    <td className="py-2 px-3 text-[11px] text-[#6B6A68]">{row.item_category ?? "—"}</td>
                    <td className="py-2 px-3 text-center">
                      {row.abc_class && (
                        <span
                          className={`inline-block w-5 h-5 rounded-full text-[10px] font-bold leading-5 ${
                            row.abc_class === "A"
                              ? "bg-[#FDECEA] text-[#CC0000]"
                              : row.abc_class === "B"
                                ? "bg-[#FDF3E3] text-[#854F0B]"
                                : "bg-[#F5F5F4] text-[#6B6A68]"
                          }`}
                        >
                          {row.abc_class}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-[11px]">{row.warehouse_name}</td>
                    <td className="py-2 px-3 text-right font-semibold text-[#0F6E56]">
                      {Number(row.qty_available ?? 0)}
                    </td>
                    <td className="py-2 px-3 text-right text-[#7F77DD]">{Number(row.qty_reserved ?? 0)}</td>
                    <td className="py-2 px-3 text-right text-[#7F77DD]">{Number(row.qty_in_transit ?? 0)}</td>
                    <td className="py-2 px-3 text-right text-[#CC0000]">{Number(row.qty_frozen ?? 0)}</td>
                    <td className="py-2 px-3 text-right text-[#854F0B]">
                      {Number(row.qty_consignment ?? 0)}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold">{Number(row.qty_total ?? 0)}</td>
                    <td className="py-2 px-3 text-right text-[11px]">
                      NT$ {Math.round(Number(row.avg_unit_cost ?? 0)).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PartsShell>
  );
}

function Stat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number | string;
  unit?: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-[#EEECE6] px-3 py-2.5">
      <div className="text-[10px] text-[#9A9890] uppercase tracking-wide">{label}</div>
      <div className={`text-[18px] font-bold mt-0.5 ${color}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
        {unit && <span className="text-[11px] text-[#9A9890] font-medium ml-1">{unit}</span>}
      </div>
    </div>
  );
}
