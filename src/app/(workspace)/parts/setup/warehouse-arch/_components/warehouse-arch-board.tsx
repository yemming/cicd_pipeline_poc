"use client";

import Link from "next/link";

import type { BusinessRuleRow, WarehouseLayerConfig, WarehouseLayerBadge } from "@/domain/rules";
import type { WarehouseSummary } from "@/domain/warehouse";

const LAYER_PALETTE: Record<
  WarehouseLayerConfig["accent"],
  { border: string; head: string }
> = {
  navy: { border: "border-[#1A3A5C]", head: "bg-[#1A3A5C]" },
  blue: { border: "border-[#185FA5]", head: "bg-[#185FA5]" },
  teal: { border: "border-[#0F6E56]", head: "bg-[#0F6E56]" },
  purple: { border: "border-[#7F77DD]", head: "bg-[#7F77DD]" },
};

const BADGE_PALETTE: Record<WarehouseLayerBadge["kind"], string> = {
  navy: "bg-[#EBF3FF] text-[#1A3A5C]",
  teal: "bg-[#E8F5F0] text-[#0F6E56]",
  amber: "bg-[#FDF3E3] text-[#854F0B]",
  red: "bg-[#FDECEA] text-[#CC0000]",
  gry: "bg-[#F2F2F2] text-[#6B6A68]",
};

const TYPE_CHIP: Record<string, string> = {
  main: "bg-[#EBF3FF] text-[#1A3A5C]",
  consignment: "bg-[#E8F5F0] text-[#0F6E56]",
  warranty: "bg-[#FDECEA] text-[#CC0000]",
  staging: "bg-[#FDF3E3] text-[#854F0B]",
};

function typeLabel(t: string | null): string {
  if (!t) return "—";
  const map: Record<string, string> = {
    main: "主倉",
    consignment: "寄存",
    warranty: "保固",
    staging: "暫存",
  };
  return map[t] ?? t;
}

function utilColor(pct: number): string {
  if (pct >= 75) return "bg-[#CC0000]";
  if (pct >= 50) return "bg-[#0F6E56]";
  if (pct >= 30) return "bg-[#854F0B]";
  return "bg-[#9A9890]";
}

export function WarehouseArchBoard({
  layers,
  warehouses,
}: {
  layers: BusinessRuleRow[];
  warehouses: WarehouseSummary[];
}) {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">倉儲四層架構</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          2.1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          倉庫 → 庫區 → 庫位 → 擺放位　四層結構說明與設定導覽
        </span>
      </header>

      {/* 4 層說明卡 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {layers.map((rule) => {
          const cfg = (rule.config ?? {}) as Partial<WarehouseLayerConfig>;
          const accent = cfg.accent ?? "navy";
          const palette = LAYER_PALETTE[accent];
          return (
            <section
              key={rule.id}
              className={`bg-white border rounded-lg overflow-hidden ${palette.border}`}
              style={{ borderWidth: 1.5 }}
            >
              <header className={`px-4 py-2.5 ${palette.head} text-white text-center`}>
                <div className="text-[22px] mb-1">{cfg.icon ?? "📦"}</div>
                <div className="text-[14px] font-semibold">{cfg.layer_title}</div>
                <div className="text-[12px] opacity-85 mt-0.5">{cfg.layer_name}</div>
              </header>
              <div className="px-3 py-3 text-[12px] text-[#5A5955] text-center leading-relaxed">
                {cfg.description}
                {cfg.badge && (
                  <div className="mt-3">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${BADGE_PALETTE[cfg.badge.kind]}`}
                    >
                      {cfg.badge.label}
                    </span>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* 倉儲架構總覽表 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">倉儲架構總覽</h2>
          <Link
            href="/parts/setup/warehouse-bins"
            className="h-[26px] px-3 inline-flex items-center rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
          >
            進入設定 →
          </Link>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">倉庫</th>
                <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">庫區數</th>
                <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">庫位數</th>
                <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">擺放位數</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold w-[180px]">使用率</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">倉庫類型</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    尚無倉庫資料，請至「倉庫 / 庫區 / 庫位 / 擺放」設定建立
                  </td>
                </tr>
              ) : (
                warehouses.map((w) => (
                  <tr key={w.id} className="border-t border-[#EEECE6]">
                    <td className="px-3 py-2 text-[12.5px] text-[#2C2C2A] font-semibold">{w.name}</td>
                    <td className="px-3 py-2 text-center font-mono text-[12px]">{w.zone_count}</td>
                    <td className="px-3 py-2 text-center font-mono text-[12px]">{w.bin_count}</td>
                    <td className="px-3 py-2 text-center font-mono text-[12px]">{w.slot_count}</td>
                    <td className="px-3 py-2">
                      {w.utilization_pct === null ? (
                        <span className="text-[11px] text-[#9A9890]">—</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[#EEECE6] rounded">
                            <div
                              className={`h-full rounded ${utilColor(w.utilization_pct)}`}
                              style={{ width: `${Math.min(100, w.utilization_pct)}%` }}
                            />
                          </div>
                          <span className="font-mono text-[11px] w-[40px] text-right">
                            {w.utilization_pct}%
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${TYPE_CHIP[w.type ?? ""] ?? "bg-[#F2F2F2] text-[#6B6A68]"}`}
                      >
                        {typeLabel(w.type)}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
          💡 庫區 / 庫位 / 擺放位數來自實際資料。使用率讀 metadata.utilization_pct（未接 stock 真實計算前留空）
        </div>
      </section>
    </main>
  );
}
