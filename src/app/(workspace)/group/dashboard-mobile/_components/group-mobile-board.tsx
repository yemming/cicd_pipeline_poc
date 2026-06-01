"use client";

/**
 * GRP06 集團儀表板手機版 — client board（G1，2026-06-01 Stitch→React 升級）
 *
 * 集團總經理出差時用手機掌握即時集團數據，點門店卡片下鑽 GRP09/10。
 * 複用 GRP01 getGroupOverview 資料，窄螢幕堆疊卡片版型。
 * 天條：不直連 supabase；資料由 server page 注入。
 */

import Link from "next/link";

import { useSetPageHeader } from "@/components/page-header-context";
import type { GroupOverview } from "@/domain/group-analytics";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
function num(v: number | null): string {
  return v == null ? "—" : v.toFixed(0);
}
function healthTone(v: number | null): string {
  if (v == null) return "text-[#9A9890]";
  if (v >= 80) return "text-[#3B6D11]";
  if (v >= 60) return "text-[#854F0B]";
  return "text-[#CC0000]";
}

export function GroupMobileBoard({ data }: { data: GroupOverview }) {
  useSetPageHeader({
    title: "集團看板（手機）",
    breadcrumb: [{ label: "集團管理", href: "/group/dashboard" }, { label: "集團看板（手機）" }],
    hideSearch: true,
  });

  return (
    <main className="px-4 py-4 max-w-[480px] mx-auto space-y-3">
      <header className="flex items-center gap-2">
        <h1 className="text-[15px] font-semibold text-[#2C2C2A]">集團看板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">GRP06</span>
      </header>

      {/* KPI 2x2 */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2.5">
          <div className="text-[10.5px] text-[#9A9890]">集團平均健康分</div>
          <div className={`text-[22px] font-bold ${healthTone(data.healthAvg)}`}>{num(data.healthAvg)}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2.5">
          <div className="text-[10.5px] text-[#9A9890]">集團 NPS</div>
          <div className="text-[22px] font-bold text-[#2C2C2A]">{num(data.groupNps)}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2.5">
          <div className="text-[10.5px] text-[#9A9890]">平均達成率</div>
          <div className="text-[22px] font-bold text-[#2C2C2A]">{pct(data.achievementAvg)}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2.5">
          <div className="text-[10.5px] text-[#9A9890]">門店數</div>
          <div className="text-[22px] font-bold text-[#2C2C2A]">{data.storeCount}</div>
        </div>
      </div>

      {/* 門店卡片（堆疊） */}
      <div className="space-y-2">
        {data.stores.length === 0 && (
          <p className="text-center text-[12px] text-[#9A9890] py-6">尚無門店資料</p>
        )}
        {data.stores.map((s) => (
          <div key={s.orgId} className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#2C2C2A]">{s.name}</span>
              <span className={`text-[16px] font-bold ${healthTone(s.health)}`}>{num(s.health)}</span>
            </div>
            <div className="flex items-center gap-3 mt-1 text-[11.5px] text-[#5A5955]">
              <span>達成率 {pct(s.achievement)}</span>
              <span>NPS {num(s.nps)}</span>
            </div>
            <div className="flex gap-2 mt-2">
              <Link
                href={`/group/store-sales?store=${s.orgId}`}
                className="flex-1 h-[34px] rounded text-[12px] inline-flex items-center justify-center bg-white border border-[#D5D3CB] text-[#5A5955] active:bg-[#F8F7F4]"
              >
                門店銷售 →
              </Link>
              <Link
                href={`/group/store-service?store=${s.orgId}`}
                className="flex-1 h-[34px] rounded text-[12px] inline-flex items-center justify-center bg-white border border-[#D5D3CB] text-[#5A5955] active:bg-[#F8F7F4]"
              >
                門店售後 →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
