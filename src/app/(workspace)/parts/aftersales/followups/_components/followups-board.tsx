"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { DonutChart } from "@/components/charts";
import {
  type CaseSafetyLevel,
  type CaseStatus,
  type CasesListFilter,
  type CasesSummary,
  type FollowupCaseWithRo,
  type RankRow,
  type SaPerformanceRow,
} from "@/domain/followup-cases";
import {
  saConversionColor,
  type AddonRejectionStatRow,
  type SaAddonConversionRow,
} from "@/domain/repair-order-addons.constants";


const statusLabel: Record<CaseStatus, string> = {
  tracking: "追蹤中",
  escalated: "主管介入",
  long_term: "長期追蹤",
  closed_won: "已閉環",
  closed_lost: "已結案（未修）",
};

const statusChip: Record<CaseStatus, string> = {
  tracking: "bg-[#FDF3E3] text-[#854F0B]",
  escalated: "bg-[#FDECEA] text-[#CC0000]",
  long_term: "bg-[#F2F2F2] text-[#6B6A68]",
  closed_won: "bg-[#EAF3DE] text-[#3B6D11]",
  closed_lost: "bg-[#EBF3FF] text-[#1A3A5C]",
};

const safetyLabel: Record<CaseSafetyLevel, string> = {
  normal: "一般建議",
  safety_related: "⚠️ 安全相關",
  safety_critical: "🔴 安全警示",
};

const safetyChip: Record<CaseSafetyLevel, string> = {
  normal: "bg-[#F2F2F2] text-[#6B6A68]",
  safety_related: "bg-[#FDF3E3] text-[#854F0B]",
  safety_critical: "bg-[#FDECEA] text-[#CC0000]",
};

const fmtMoney = (n: number) => {
  const v = Math.round(n);
  return `NT$${v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};
const pad = (n: number) => n.toString().padStart(2, "0");
const fmtDate = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
};
const dayDiff = (s: string | null) => {
  if (!s) return null;
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  return days;
};

export function FollowupsBoard({
  rows,
  summary,
  filter,
  canEdit,
  saNames,
  ranks,
  saPerformance,
  rejectionStats,
  saConversion,
}: {
  rows: FollowupCaseWithRo[];
  summary: CasesSummary;
  filter: CasesListFilter;
  canEdit: boolean;
  saNames: string[];
  ranks: RankRow[];
  saPerformance: SaPerformanceRow[];
  rejectionStats: AddonRejectionStatRow[];
  saConversion: SaAddonConversionRow[];
}) {
  useSetPageHeader({
    title: "增項閉環管理",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "增項閉環管理" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tab, setTab] = useState<"pending" | "timeline" | "stats">("pending");

  // B-24：拒絕原因圓餅圖資料（只取有件數的扇形）
  const rejectionTotalCount = useMemo(
    () => rejectionStats.reduce((s, r) => s + r.count, 0),
    [rejectionStats],
  );
  const rejectionPie = useMemo(
    () =>
      rejectionStats
        .filter((r) => r.count > 0)
        .map((r) => ({ name: r.label, value: r.count, color: r.color })),
    [rejectionStats],
  );

  // filter local state
  const [statusLocal, setStatusLocal] = useState<NonNullable<CasesListFilter["status"]>>(
    filter.status ?? "open",
  );
  const [safetyLocal, setSafetyLocal] = useState<NonNullable<CasesListFilter["safetyLevel"]>>(
    filter.safetyLevel ?? "all",
  );
  const [saLocal, setSaLocal] = useState(filter.saName ?? "");
  const [qLocal, setQLocal] = useState(filter.q ?? "");

  const submitFilter = () => {
    const sp = new URLSearchParams();
    if (statusLocal && statusLocal !== "open") sp.set("status", String(statusLocal));
    if (safetyLocal && safetyLocal !== "all") sp.set("safety", String(safetyLocal));
    if (saLocal) sp.set("sa", saLocal);
    if (qLocal) sp.set("q", qLocal);
    startTransition(() => router.push(`/parts/aftersales/followups?${sp.toString()}`));
  };

  const resetFilter = () => {
    setStatusLocal("open");
    setSafetyLocal("all");
    setSaLocal("");
    setQLocal("");
    startTransition(() => router.push("/parts/aftersales/followups"));
  };

  const safetyCases = useMemo(() => rows.filter((r) => r.safety_level !== "normal"), [rows]);
  const normalCases = useMemo(() => rows.filter((r) => r.safety_level === "normal"), [rows]);

  // === DataGrid columns（時間軸 tab）===
  const tlColumns: DataGridColumn<FollowupCaseWithRo>[] = [
    {
      id: "case_no",
      header: "案件號",
      width: 130,
      hideable: false,
      cell: (r) => <span className="font-mono font-semibold text-[#1A3A5C]">{r.case_no}</span>,
      exportValue: (r) => r.case_no,
      sortValue: (r) => r.case_no,
    },
    {
      id: "created_at",
      header: "建立日",
      width: 80,
      cell: (r) => <span className="font-mono text-[12px]">{fmtDate(r.created_at)}</span>,
      exportValue: (r) => r.created_at ?? "",
      sortValue: (r) => r.created_at ?? "",
    },
    {
      id: "customer",
      header: "車主 / 車型",
      width: 180,
      cell: (r) => (
        <div>
          <div className="text-[12.5px] font-medium">{r.customer_name ?? "—"}</div>
          <div className="text-[11px] text-[#9A9890]">{r.vehicle_model ?? r.vehicle_license_plate ?? ""}</div>
        </div>
      ),
      exportValue: (r) => `${r.customer_name ?? ""} / ${r.vehicle_model ?? ""}`,
      sortValue: (r) => r.customer_name ?? "",
    },
    {
      id: "title",
      header: "項目",
      cell: (r) => r.title,
      exportValue: (r) => r.title,
    },
    {
      id: "estimated_fee",
      header: "金額",
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="font-semibold text-[#1A3A5C]">{fmtMoney(Number(r.estimated_fee))}</span>
      ),
      exportValue: (r) => Number(r.estimated_fee),
      sortValue: (r) => Number(r.estimated_fee),
    },
    {
      id: "safety_level",
      header: "安全",
      width: 100,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${safetyChip[r.safety_level]}`}
        >
          {safetyLabel[r.safety_level]}
        </span>
      ),
      exportValue: (r) => safetyLabel[r.safety_level],
      sortValue: (r) => r.safety_level,
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChip[r.status]}`}
        >
          {statusLabel[r.status]}
        </span>
      ),
      exportValue: (r) => statusLabel[r.status],
      sortValue: (r) => r.status,
    },
    {
      id: "sa",
      header: "SA",
      width: 80,
      cell: (r) => r.sa_name ?? "—",
      exportValue: (r) => r.sa_name ?? "",
      sortValue: (r) => r.sa_name ?? "",
    },
  ];

  // helper：渲染 case card（tab 1 看板用）
  const renderCaseCard = (r: FollowupCaseWithRo) => {
    const days = dayDiff(r.created_at);
    const isCritical = r.safety_level === "safety_critical";
    const dayBadge = (() => {
      if (r.status === "closed_won") return { text: "已閉環", color: "text-[#0F6E56]" };
      if (r.status === "closed_lost") return { text: "已結案", color: "text-[#1A3A5C]" };
      if (r.status === "long_term") return { text: "長期追蹤", color: "text-[#6B6A68]" };
      if (r.status === "escalated")
        return { text: `D+${days ?? 0} ⚠ 主管介入`, color: "text-[#CC0000] font-semibold" };
      if (days !== null && days >= 7)
        return { text: `D+${days} 待二次聯繫`, color: "text-[#854F0B] font-semibold" };
      if (days !== null && days <= 3)
        return { text: `D+${days} 即將提醒`, color: "text-[#854F0B] font-semibold" };
      return { text: `D+${days ?? 0}`, color: "text-[#5A5955]" };
    })();

    return (
      <Link
        key={r.id}
        href={`/parts/aftersales/followups/${r.id}`}
        className={`block bg-white border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${
          isCritical ? "border-l-[3px] border-l-[#CC0000] border-[#EEECE6]" : "border-[#EEECE6]"
        }`}
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <span className="text-[18px]">
            {isCritical ? "🔴" : r.safety_level === "safety_related" ? "🟠" : "🟡"}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold text-[#2C2C2A]">{r.title}</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5 truncate">
              {r.customer_name} · {r.vehicle_model} · {r.vehicle_license_plate ?? "—"} · {r.ro?.ro_code ?? ""} · SA：{r.sa_name ?? "—"}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-[14px] font-bold text-[#1A3A5C]">
              {fmtMoney(Number(r.estimated_fee))}
            </div>
            <div className={`text-[11px] mt-0.5 ${dayBadge.color}`}>{dayBadge.text}</div>
          </div>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChip[r.status]}`}>
            {statusLabel[r.status]}
          </span>
        </div>
      </Link>
    );
  };

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">增項閉環管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後 Sprint 5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          客戶暫緩 / 拒絕的增項追蹤閉環，支援安全等級主管介入與長期追蹤
        </span>
      </header>

      {/* 跨模組串接橫幅：快速跳轉相關作業頁面 */}
      <div className="bg-[#EAF4FB] border border-[#C8DFFB] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-[12px] font-semibold text-[#185FA5] shrink-0">跨模組快捷</span>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/parts/issue/repair-pick"
            className="h-[26px] px-3 rounded text-[11.5px] inline-flex items-center gap-1 bg-white border border-[#C8DFFB] text-[#185FA5] hover:border-[#185FA5] font-medium"
          >
            → 維修領料出庫
          </Link>
          <Link
            href="/parts/inventory"
            className="h-[26px] px-3 rounded text-[11.5px] inline-flex items-center gap-1 bg-white border border-[#C8DFFB] text-[#185FA5] hover:border-[#185FA5] font-medium"
          >
            → 庫存查詢
          </Link>
          <Link
            href="/parts/alerts/work-order-loop"
            className="h-[26px] px-3 rounded text-[11.5px] inline-flex items-center gap-1 bg-white border border-[#C8DFFB] text-[#185FA5] hover:border-[#185FA5] font-medium"
          >
            → 缺料告警
          </Link>
        </div>
      </div>

      {/* 安全等級警示橫幅 */}
      {summary.pendingSafety > 0 && (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-2.5 flex items-center gap-2.5">
          <span className="text-[18px]">🔴</span>
          <div className="flex-1">
            <div className="text-[13px] font-semibold text-[#CC0000]">
              {summary.pendingSafety} 個安全等級項目待主管介入
            </div>
            <div className="text-[11.5px] text-[#CC0000] opacity-80 mt-0.5">
              主管須親自聯繫並存檔
            </div>
          </div>
          <button
            onClick={() => {
              setSafetyLocal("safety_critical");
              setStatusLocal("escalated");
              startTransition(() =>
                router.push(`/parts/aftersales/followups?safety=safety_critical&status=escalated`),
              );
            }}
            className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
          >
            立即處理
          </button>
        </div>
      )}

      {/* Tab Bar */}
      <div className="flex border-b-2 border-[#EEECE6]">
        {(
          [
            { id: "pending", label: "待追蹤看板", count: summary.pending },
            { id: "timeline", label: "追蹤時間軸", count: summary.totalLostCount },
            { id: "stats", label: "整店統計", count: null as number | null },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-5 py-2.5 text-[13px] font-medium -mb-[2px] border-b-2 ${
              tab === t.id
                ? "text-[#1A3A5C] border-[#1A3A5C]"
                : "text-[#9A9890] border-transparent hover:text-[#5A5955]"
            }`}
          >
            {t.label}
            {t.count !== null && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-[#FDECEA] text-[#CC0000]">
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 1: 待追蹤看板 */}
      {tab === "pending" && (
        <div className="space-y-3">
          {/* Filter Bar */}
          <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">SA</label>
                <select
                  value={saLocal}
                  onChange={(e) => setSaLocal(e.target.value)}
                  disabled={isPending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
                >
                  <option value="">全店</option>
                  {saNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">安全等級</label>
                <select
                  value={safetyLocal ?? "all"}
                  onChange={(e) => setSafetyLocal(e.target.value as CaseSafetyLevel | "all")}
                  disabled={isPending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
                >
                  <option value="all">全部</option>
                  <option value="safety_critical">🔴 安全警示</option>
                  <option value="safety_related">⚠️ 安全相關</option>
                  <option value="normal">一般</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">追蹤狀態</label>
                <select
                  value={statusLocal ?? "open"}
                  onChange={(e) =>
                    setStatusLocal(e.target.value as NonNullable<CasesListFilter["status"]>)
                  }
                  disabled={isPending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
                >
                  <option value="open">未結案（追蹤+介入+長期）</option>
                  <option value="all">全部</option>
                  <option value="tracking">追蹤中</option>
                  <option value="escalated">主管介入</option>
                  <option value="long_term">長期追蹤</option>
                  <option value="closed_won">已閉環</option>
                  <option value="closed_lost">已結案（未修）</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 min-w-[180px]">
                <label className="text-[11px] text-[#9A9890] font-medium">關鍵字</label>
                <input
                  value={qLocal}
                  onChange={(e) => setQLocal(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitFilter()}
                  disabled={isPending}
                  placeholder="車主 / 案號 / 項目"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
                />
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  onClick={submitFilter}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                >
                  {isPending ? "查詢中⋯" : "查詢"}
                </button>
                <button
                  onClick={resetFilter}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
                >
                  重置
                </button>
              </div>
            </div>
          </section>

          {/* 安全等級分組 */}
          {safetyCases.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-[#CC0000] tracking-wide">
                🔴 安全等級（主管必須介入）· {safetyCases.length} 件
              </div>
              <div className="space-y-2">{safetyCases.map(renderCaseCard)}</div>
            </>
          )}

          {normalCases.length > 0 && (
            <>
              <div className="text-[11px] font-semibold text-[#5A5955] tracking-wide mt-3">
                一般項目（{normalCases.length} 件）
              </div>
              <div className="space-y-2">{normalCases.map(renderCaseCard)}</div>
            </>
          )}

          {rows.length === 0 && (
            <div className="bg-white border border-[#EEECE6] rounded-lg py-12 text-center text-[13px] text-[#9A9890]">
              沒有符合條件的追蹤案件
            </div>
          )}
        </div>
      )}

      {/* Tab 2: 追蹤時間軸（DataGrid） */}
      {tab === "timeline" && (
        <DataGrid
          columns={tlColumns}
          data={rows}
          rowKey={(r) => r.id}
          persistKey="parts/aftersales/followups/timeline"
          exportFileName="followup-cases"
          emptyMessage="沒有符合條件的案件"
          disabled={isPending}
          rowActionsWidth={90}
          rowActions={(r) => (
            <Link
              href={`/parts/aftersales/followups/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              詳情
            </Link>
          )}
        />
      )}

      {/* Tab 3: 整店統計 */}
      {tab === "stats" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
            <KpiCard
              label="本月失銷金額"
              value={fmtMoney(summary.totalLost)}
              sub={`共 ${summary.totalLostCount} 件`}
              color="#CC0000"
            />
            <KpiCard
              label="已閉環回收"
              value={fmtMoney(summary.recovered)}
              sub={`${summary.recoveredCount} 件 · 閉環率 ${summary.closureRate}%`}
              color="#0F6E56"
            />
            <KpiCard
              label="待追蹤"
              value={`${summary.pending} 件`}
              sub={`含 ${summary.pendingSafety} 件安全等級`}
              color="#854F0B"
            />
            <KpiCard
              label="長期追蹤"
              value={`${summary.longTerm} 件`}
              sub={`${fmtMoney(summary.longTermPotential)} 潛在收益`}
              color="#5A5955"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">最常失銷項目 Top 5</span>
              </header>
              <div className="px-4 py-3 space-y-2">
                {ranks.length === 0 && (
                  <div className="text-[12px] text-[#9A9890] py-4 text-center">尚無資料</div>
                )}
                {ranks.map((r, i) => {
                  const max = ranks[0]?.cnt || 1;
                  const pct = Math.round((r.cnt / max) * 100);
                  return (
                    <div key={r.name} className="flex items-center gap-2.5 py-1">
                      <span className="text-[11.5px] text-[#9A9890] min-w-[14px]">{i + 1}</span>
                      <span className="text-[12.5px] flex-1">{r.name}</span>
                      <div className="flex-1 bg-[#F2F2F2] rounded-sm h-[8px] overflow-hidden">
                        <div
                          className="h-full bg-[#CC0000] opacity-60 rounded-sm"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[12px] font-semibold min-w-[60px] text-right">
                        {r.cnt} 件 · {fmtMoney(r.amt)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">SA 個人閉環績效</span>
              </header>
              <div className="px-4 py-3 space-y-1">
                {saPerformance.length === 0 && (
                  <div className="text-[12px] text-[#9A9890] py-4 text-center">尚無資料</div>
                )}
                {saPerformance.map((s) => {
                  const col =
                    s.rate >= 40 ? "#0F6E56" : s.rate >= 30 ? "#854F0B" : "#CC0000";
                  return (
                    <div
                      key={s.sa_name}
                      className="flex items-center justify-between py-2 border-b border-[#F2F2F2] last:border-b-0"
                    >
                      <span className="text-[12.5px] font-medium">{s.sa_name}</span>
                      <span className="text-[11.5px] text-[#9A9890]">
                        {s.closed}/{s.total} 件
                      </span>
                      <span className="text-[16px] font-bold" style={{ color: col }}>
                        {s.rate}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {/* B-24：增項拒絕原因分布 + SA 個人增項轉化率 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* 拒絕原因分布圓餅圖 */}
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">本月增項拒絕原因分布</span>
              </header>
              <div className="px-4 py-3">
                {rejectionTotalCount === 0 ? (
                  <div className="text-[12px] text-[#9A9890] py-8 text-center">
                    尚無拒絕原因資料（拒絕增項時選擇原因後即會統計）
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-4"
                    data-testid="rejection-pie-chart"
                  >
                    <div className="w-[160px] shrink-0">
                      <DonutChart
                        data={rejectionPie}
                        size="sm"
                        centerLabel={`${rejectionTotalCount}`}
                        centerCaption="拒絕件數"
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      {rejectionStats
                        .filter((r) => r.count > 0)
                        .map((r) => {
                          const pct = Math.round((r.count / rejectionTotalCount) * 100);
                          return (
                            <div
                              key={r.reason}
                              data-testid="pie-slice"
                              className="flex items-center gap-2 text-[12px]"
                            >
                              <span
                                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                                style={{ backgroundColor: r.color }}
                              />
                              <span className="flex-1 text-[#5A5955] truncate">{r.label}</span>
                              <span className="font-semibold text-[#2C2C2A]">{pct}%</span>
                              <span className="text-[#9A9890] min-w-[80px] text-right">
                                {r.count} 件 · {fmtMoney(r.amount)}
                              </span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* SA 個人增項轉化率 */}
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">SA 個人增項轉化率</span>
                <span className="text-[10.5px] text-[#9A9890]">健康線 ≥35%🟢 / 20–34%🟡 / &lt;20%🔴</span>
              </header>
              <div className="px-4 py-3" data-testid="sa-conversion-table">
                {saConversion.length === 0 ? (
                  <div className="text-[12px] text-[#9A9890] py-8 text-center">尚無增項決策資料</div>
                ) : (
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-[#EEECE6] text-[11px] text-[#9A9890]">
                        <th className="text-left py-1.5 font-medium">SA</th>
                        <th className="text-right py-1.5 font-medium">提案</th>
                        <th className="text-right py-1.5 font-medium">接受</th>
                        <th className="text-right py-1.5 font-medium">接受率</th>
                        <th className="text-left py-1.5 font-medium pl-3">主要拒絕原因</th>
                      </tr>
                    </thead>
                    <tbody>
                      {saConversion.map((s) => (
                        <tr
                          key={s.sa_name}
                          data-testid={s.rate < 20 ? "sa-row-low" : "sa-row"}
                          className={`border-b border-[#F2F2F2] last:border-b-0 ${
                            s.rate < 20 ? "red bg-[#FDECEA]/40" : ""
                          }`}
                        >
                          <td className="py-2 text-[12.5px] font-medium">{s.sa_name}</td>
                          <td className="py-2 text-[12px] text-[#5A5955] text-right">{s.total}</td>
                          <td className="py-2 text-[12px] text-[#5A5955] text-right">{s.accepted}</td>
                          <td className="py-2 text-right">
                            <span
                              className="text-[15px] font-bold"
                              style={{ color: saConversionColor(s.rate) }}
                            >
                              {s.rate}%
                            </span>
                          </td>
                          <td className="py-2 text-[11.5px] text-[#9A9890] pl-3">
                            {s.top_reason ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* canEdit 提示（demo） */}
      {!canEdit && (
        <div className="text-[11px] text-[#9A9890] text-center mt-2">
          目前角色僅檢視；在詳情頁進行聯繫紀錄、主管介入、結案需 RO 編輯權限
        </div>
      )}
    </main>
  );
}

function KpiCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub: string;
  color: string;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="text-[20px] font-bold mt-1" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[#9A9890] mt-0.5">{sub}</div>
    </div>
  );
}
