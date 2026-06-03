"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  GRADE_DEF,
  type GroupQuarterlyReportForPrint,
  type QuarterlyStoreRow,
} from "@/domain/group-quarterly-report.constants";

const int = (n: number | null): string =>
  n == null ? "—" : Math.round(n).toLocaleString("en-US");
const pct = (r: number | null): string =>
  r == null ? "—" : `${(r * 100).toFixed(1)}%`;
const nps = (n: number | null): string =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n)}`;

function RatioArrow({ r }: { r: number | null }) {
  if (r == null) return <span className="text-[#9A9890]">—</span>;
  const up = r >= 0;
  return (
    <span className={up ? "text-[#0F6E56] font-medium" : "text-[#CC0000] font-medium"}>
      {up ? "▲ +" : "▼ "}
      {(r * 100).toFixed(1)}%
    </span>
  );
}
function IntArrow({ d }: { d: number | null }) {
  if (d == null) return <span className="text-[#9A9890]">—</span>;
  if (d === 0) return <span className="text-[#5A5955]">→ 持平</span>;
  const up = d > 0;
  return (
    <span className={up ? "text-[#0F6E56] font-medium" : "text-[#CC0000] font-medium"}>
      {up ? "▲ +" : "▼ "}
      {d}
    </span>
  );
}

function GradeChip({ grade }: { grade: QuarterlyStoreRow["grade"] }) {
  if (!grade) return <span className="text-[#9A9890]">—</span>;
  const g = GRADE_DEF[grade];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
      style={{ background: g.bg, color: g.color }}
    >
      {g.emoji} {g.label}
    </span>
  );
}

function KpiCard({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
}) {
  return (
    <div className="flex-1 bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="text-[20px] font-semibold text-[#1A3A5C] leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-[#5A5955] mt-0.5">{sub}</div>}
      {delta != null && <div className="text-[11.5px] mt-1">{delta}</div>}
    </div>
  );
}

export function QuarterlyReportBoard({
  report,
  quarters,
}: {
  report: GroupQuarterlyReportForPrint | null;
  quarters: Array<{ key: string; label: string }>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useSetPageHeader({
    title: "季度績效報告",
    breadcrumb: [
      { label: "集團管理", href: "/group/health-score" },
      { label: "季度績效報告" },
    ],
    hideSearch: true,
  });

  function changeQuarter(key: string) {
    startTransition(() => {
      router.push(`/group/quarterly-report?q=${encodeURIComponent(key)}`);
    });
  }

  function openReport() {
    if (!report) return;
    window.open(`/print/group-quarterly-report/${report.quarterKey}`, "_blank");
  }

  if (!report) {
    return (
      <main className="px-6 py-5 space-y-3">
        <p className="text-[13px] text-[#9A9890]">
          目前沒有資料齊全的完整季度可出報告（需該季 3 個月的銷售/售後快照都到位）。
        </p>
      </main>
    );
  }

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">集團季度績效報告</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP05
        </span>
        <span className="text-[12px] text-[#9A9890]">
          {report.periodRangeLabel}・全集團 {report.storeCount} 間門店彙整・資料截止 {report.dataCutoff}
        </span>
      </header>

      {/* 工具列：季度選擇 + 開啟報告 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-end gap-2 flex-wrap">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890] font-medium">報告季度</label>
          <select
            value={report.quarterKey}
            onChange={(e) => changeQuarter(e.target.value)}
            disabled={isPending}
            className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
          >
            {quarters.map((qq) => (
              <option key={qq.key} value={qq.key}>
                {qq.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-[#9A9890] font-medium">達標門店</span>
          <span className="h-[30px] inline-flex items-center text-[12.5px] text-[#2C2C2A]">
            <b className="text-[#0F6E56]">
              {report.achievedStoreCount}/{report.storeCount}
            </b>
            <span className="text-[#9A9890] ml-1">（新車達成率 ≥ 90%）</span>
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={openReport}
            disabled={isPending}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60 inline-flex items-center gap-1"
            title="開啟完整 A4 報告，於新分頁可下載 PDF"
          >
            <span className="material-symbols-outlined text-[16px]">summarize</span>
            開啟完整報告 / 匯出 PDF
          </button>
        </div>
      </section>

      {/* 季度核心指標 */}
      <div className="flex gap-3 flex-wrap">
        <KpiCard
          label="全台新車銷量"
          value={`${int(report.groupNewCar)} 台`}
          sub={
            report.groupNewCarTarget != null
              ? `目標 ${int(report.groupNewCarTarget)}｜達成率 ${pct(report.groupNewCarRate)}`
              : undefined
          }
          delta={
            <span>
              <RatioArrow r={report.groupNewCarDelta} />{" "}
              <span className="text-[#9A9890]">{report.compareLabel}</span>
            </span>
          }
        />
        <KpiCard
          label="全台售後台次"
          value={`${int(report.groupService)} 次`}
          sub={
            report.groupServiceTarget != null
              ? `目標 ${int(report.groupServiceTarget)}｜達成率 ${pct(report.groupServiceRate)}`
              : undefined
          }
          delta={
            <span>
              <RatioArrow r={report.groupServiceDelta} />{" "}
              <span className="text-[#9A9890]">{report.compareLabel}</span>
            </span>
          }
        />
        <KpiCard label="季平均 NPS" value={nps(report.groupNps)} sub="集團整體淨推薦值" />
        <KpiCard
          label="平均 Health Score"
          value={report.groupHealth == null ? "—" : `${Math.round(report.groupHealth)}`}
          sub="五門店綜合體質均分"
          delta={
            <span>
              <IntArrow d={report.groupHealthDelta} />{" "}
              <span className="text-[#9A9890]">vs 上季</span>
            </span>
          }
        />
      </div>

      {/* 逐店評級摘要 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 各門店季度績效對比</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="text-left font-medium px-4 py-2">門店</th>
                <th className="text-right font-medium px-3 py-2">新車銷量</th>
                <th className="text-right font-medium px-3 py-2">新車達成率</th>
                <th className="text-right font-medium px-3 py-2">售後台次</th>
                <th className="text-right font-medium px-3 py-2">NPS 季平均</th>
                <th className="text-right font-medium px-3 py-2">零件周轉</th>
                <th className="text-right font-medium px-3 py-2">Health Score</th>
                <th className="text-right font-medium px-3 py-2">vs 上季</th>
                <th className="text-center font-medium px-3 py-2">評級</th>
              </tr>
            </thead>
            <tbody>
              {report.stores.map((s) => (
                <tr key={s.orgId} className="border-b border-[#F2F2F2] last:border-0">
                  <td className="px-4 py-2 font-medium text-[#2C2C2A]">{s.name}</td>
                  <td className="px-3 py-2 text-right">{int(s.newCar)}</td>
                  <td className="px-3 py-2 text-right">{pct(s.newCarRate)}</td>
                  <td className="px-3 py-2 text-right">{int(s.service)}</td>
                  <td className="px-3 py-2 text-right">{nps(s.nps)}</td>
                  <td className="px-3 py-2 text-right">{s.turnover == null ? "—" : `${s.turnover.toFixed(1)}x`}</td>
                  <td className="px-3 py-2 text-right font-semibold text-[#1A3A5C]">
                    {s.health == null ? "—" : s.health}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <IntArrow d={s.healthDelta} />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <GradeChip grade={s.grade} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 季度重點摘要 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 季度重點摘要</span>
        </header>
        <div className="px-4 py-3 space-y-1.5">
          {report.highlights.length === 0 ? (
            <p className="text-[12px] text-[#9A9890]">本季無自動摘要</p>
          ) : (
            report.highlights.map((h, i) => (
              <div
                key={i}
                className="text-[12.5px] text-[#2C2C2A] px-3 py-1.5 rounded"
                style={{
                  borderLeft: `3px solid ${h.tone === "good" ? "#0F6E56" : "#CC0000"}`,
                  background: h.tone === "good" ? "#F3F8EE" : "#FDECEA",
                }}
              >
                {h.tone === "good" ? "✅ " : "🔴 "}
                {h.text}
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
