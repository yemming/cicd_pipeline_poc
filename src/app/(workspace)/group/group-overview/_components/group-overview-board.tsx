"use client";

/**
 * GRP01 集團總覽 — client board（G1，2026-06-01 Stitch→React 升級）
 *
 * 集團主管每日首頁：集團層 KPI（門店彙總）+ 逐店摘要卡，每店可下鑽到
 * GRP09 門店銷售診斷 / GRP10 門店售後診斷（設計稿要求「下鑽 Toast→真實跳轉」）。
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import Link from "next/link";

import { useSetPageHeader } from "@/components/page-header-context";
import type { GroupOverview } from "@/domain/group-analytics";

function pct(v: number | null): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}
function num(v: number | null, digits = 0): string {
  return v == null ? "—" : v.toFixed(digits);
}
function healthTone(v: number | null): string {
  if (v == null) return "text-[#9A9890]";
  if (v >= 80) return "text-[#3B6D11]";
  if (v >= 60) return "text-[#854F0B]";
  return "text-[#CC0000]";
}
function rateChip(rate: number | null): string {
  if (rate == null) return "bg-[#F2F2F2] text-[#6B6A68]";
  if (rate >= 1) return "bg-[#EAF3DE] text-[#3B6D11]";
  if (rate >= 0.9) return "bg-[#EAF4FB] text-[#185FA5]";
  if (rate >= 0.8) return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#FDECEA] text-[#CC0000]";
}

function KpiCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[26px] font-bold leading-tight mt-1 ${tone ?? "text-[#2C2C2A]"}`}>{value}</div>
    </div>
  );
}

export function GroupOverviewBoard({
  data,
  title = "集團總覽",
  sprint = "GRP01",
  caption = "一頁掌握全門店健康分 · 達成率 · NPS，點門店下鑽診斷",
  children,
}: {
  data: GroupOverview;
  title?: string;
  sprint?: string;
  caption?: string;
  children?: React.ReactNode;
}) {
  useSetPageHeader({
    title,
    breadcrumb: [{ label: "集團管理", href: "/group/dashboard" }, { label: title }],
    hideSearch: true,
  });

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{title}</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">{sprint}</span>
        <span className="text-[12px] text-[#9A9890]">{caption}</span>
      </header>

      {/* 集團層 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="集團平均健康分" value={num(data.healthAvg, 0)} tone={healthTone(data.healthAvg)} />
        <KpiCard label="集團 NPS" value={num(data.groupNps, 0)} />
        <KpiCard label="平均銷售達成率" value={pct(data.achievementAvg)} />
        <KpiCard label="門店數" value={String(data.storeCount)} />
      </div>

      {/* 逐店摘要 + 下鑽 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 各門店摘要（點下鑽診斷）</span>
        </header>
        <table className="w-full">
          <thead>
            <tr className="text-[11px] text-[#9A9890] bg-[#F8F7F4]">
              <th className="text-left font-medium px-4 py-2">門店</th>
              <th className="text-right font-medium px-4 py-2">健康分</th>
              <th className="text-right font-medium px-4 py-2">達成率</th>
              <th className="text-right font-medium px-4 py-2">NPS</th>
              <th className="text-right font-medium px-4 py-2">下鑽</th>
            </tr>
          </thead>
          <tbody>
            {data.stores.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-[#9A9890]">尚無門店資料</td></tr>
            )}
            {data.stores.map((s) => (
              <tr key={s.orgId} className="border-t border-[#EEECE6] text-[12.5px] text-[#2C2C2A]">
                <td className="px-4 py-2 font-medium">{s.name}</td>
                <td className={`px-4 py-2 text-right font-semibold ${healthTone(s.health)}`}>{num(s.health, 0)}</td>
                <td className="px-4 py-2 text-right">
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${rateChip(s.achievement)}`}>{pct(s.achievement)}</span>
                </td>
                <td className="px-4 py-2 text-right">{num(s.nps, 0)}</td>
                <td className="px-4 py-2">
                  <div className="flex gap-1.5 justify-end">
                    <Link
                      href={`/group/store-sales?store=${s.orgId}`}
                      className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    >
                      門店銷售 →
                    </Link>
                    <Link
                      href={`/group/store-service?store=${s.orgId}`}
                      className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    >
                      門店售後 →
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {children}
    </main>
  );
}
