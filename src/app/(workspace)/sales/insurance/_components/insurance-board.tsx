"use client";

/**
 * Insurance Board — A 級版（2026-05-20）
 *
 * 完全走 DB（@/domain/sales-insurance + @/lib/sales/insurance-actions）。
 * 視覺：KpiCard 頂列 / DonutChart 險種分佈 / DataGrid 即將到期清單 / pending kanban。
 */

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { KpiCard } from "@/components/visualization/KpiCard";
import { DonutChart } from "@/components/charts/DonutChart";
import { BarChart } from "@/components/charts/BarChart";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  POLICY_STATUS_LABEL,
  POLICY_STATUS_CHIP,
  POLICY_TYPE_LABEL,
  RENEWAL_TYPE_LABEL,
  type CreatePolicyInput,
  type InsuranceFilters,
  type InsuranceKpis,
  type InsuranceLookups,
  type InsurancePolicyRow,
  type InsuranceTypeBreakdown,
  type PolicyStatus,
  type PolicyType,
  type RenewalDueBucket,
  type RenewalType,
} from "@/domain/sales-insurance.constants";
import {
  createPolicyAction,
  markCancelledAction,
  markRenewedAction,
} from "@/lib/sales/insurance-actions";

type Props = {
  rows: InsurancePolicyRow[];
  totalCount: number;
  page: number;
  pageSize: number;
  kpis: InsuranceKpis;
  dueBuckets: RenewalDueBucket[];
  byType: InsuranceTypeBreakdown[];
  lookups: InsuranceLookups;
  filters: Required<InsuranceFilters> & { status: PolicyStatus | "all" };
  lostReasons: { code: string; label: string }[];
  canEdit: boolean;
};

const inputCls =
  "w-full h-[30px] px-2 text-[12.5px] border border-[#D5D3CB] rounded outline-none focus:border-[#185FA5] bg-white";
const labelCls = "text-[11px] text-[#9A9890] font-medium";

const DONUT_TONE_BY_TYPE: Record<PolicyType, string> = {
  compulsory: "#1A3A5C",
  voluntary: "#0F6E56",
  theft: "#B45309",
  other: "#6B7280",
};

export default function InsuranceBoard({
  rows,
  totalCount,
  page,
  pageSize,
  kpis,
  dueBuckets,
  byType,
  lookups,
  filters,
  canEdit,
}: Props) {
  useSetPageHeader({
    title: "保險招攬工作台",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/overview" },
      { label: "展廳接待" },
      { label: "保險招攬" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    if (ok) bannerTimer.current = setTimeout(() => setBanner(null), 2200);
  }

  // ── Filters → URL ─────────────────────────────────
  const [filterStatus, setFilterStatus] = useState<PolicyStatus | "all">(filters.status);
  const [filterType, setFilterType] = useState<PolicyType | "all">(filters.policy_type);
  const [filterExpiry, setFilterExpiry] = useState<"30" | "60" | "90" | "expired" | "all">(
    filters.expiry_window as "30" | "60" | "90" | "expired" | "all",
  );
  const [filterSearch, setFilterSearch] = useState(filters.search);
  const [filterAssigned, setFilterAssigned] = useState<string>(filters.assigned_to);

  function applyFilters() {
    const sp = new URLSearchParams();
    if (filterStatus !== "all") sp.set("status", filterStatus);
    if (filterType !== "all") sp.set("policy_type", filterType);
    if (filterExpiry !== "all") sp.set("expiry_window", filterExpiry);
    if (filterSearch.trim()) sp.set("search", filterSearch.trim());
    if (filterAssigned !== "all") sp.set("assigned_to", filterAssigned);
    startTransition(() => {
      router.push(`/sales/insurance${sp.toString() ? `?${sp.toString()}` : ""}`);
    });
  }
  function resetFilters() {
    setFilterStatus("all");
    setFilterType("all");
    setFilterExpiry("all");
    setFilterSearch("");
    setFilterAssigned("all");
    startTransition(() => router.push("/sales/insurance"));
  }

  function goToPage(next: number) {
    const sp = new URLSearchParams();
    if (filters.status !== "all") sp.set("status", filters.status);
    if (filters.policy_type !== "all") sp.set("policy_type", filters.policy_type);
    if (filters.expiry_window !== "all") sp.set("expiry_window", filters.expiry_window);
    if (filters.search) sp.set("search", filters.search);
    if (filters.assigned_to !== "all") sp.set("assigned_to", filters.assigned_to);
    if (next > 1) sp.set("page", String(next));
    startTransition(() => {
      router.push(`/sales/insurance${sp.toString() ? `?${sp.toString()}` : ""}`);
    });
  }

  // ── Pending kanban ────────────────────────────────
  const pendingRows = useMemo(() => rows.filter((r) => r.status === "pending"), [rows]);

  // ── Actions ───────────────────────────────────────
  function handleRenew(id: string) {
    startTransition(async () => {
      const res = await markRenewedAction(id);
      if (res.ok) {
        showBanner(true, "已標記為已續保");
        router.refresh();
      } else {
        showBanner(false, `續保失敗：${res.error}`);
      }
    });
  }
  function handleCancel(id: string) {
    startTransition(async () => {
      const res = await markCancelledAction(id);
      if (res.ok) {
        showBanner(true, "已標記為取消");
        router.refresh();
      } else {
        showBanner(false, `取消失敗：${res.error}`);
      }
    });
  }

  // ── Create modal ──────────────────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<CreatePolicyInput>({
    customer_id: null,
    vehicle_id: null,
    policy_no: "",
    insurer: "",
    policy_type: "compulsory",
    start_date: null,
    end_date: "",
    premium: null,
    status: "pending",
    renewal_type: "renew_to_renew",
    assigned_to: null,
    notes: "",
  });
  function resetDraft() {
    setDraft({
      customer_id: null,
      vehicle_id: null,
      policy_no: "",
      insurer: "",
      policy_type: "compulsory",
      start_date: null,
      end_date: "",
      premium: null,
      status: "pending",
      renewal_type: "renew_to_renew",
      assigned_to: null,
      notes: "",
    });
  }
  function submitDraft() {
    if (!draft.insurer.trim()) {
      showBanner(false, "請填寫保險公司");
      return;
    }
    if (!draft.end_date) {
      showBanner(false, "請填寫到期日");
      return;
    }
    startTransition(async () => {
      const res = await createPolicyAction(draft);
      if (res.ok) {
        showBanner(true, "已建立保險件");
        setModalOpen(false);
        resetDraft();
        router.refresh();
      } else {
        showBanner(false, `建立失敗：${res.error}`);
      }
    });
  }

  // ── Columns ───────────────────────────────────────
  const columns: DataGridColumn<InsurancePolicyRow>[] = [
    {
      id: "end_date",
      header: "到期日",
      width: 140,
      hideable: false,
      sortValue: (r) => r.end_date,
      exportValue: (r) => r.end_date,
      cell: (r) => {
        const d = r.days_to_expiry;
        const highlight =
          d < 0
            ? "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]"
            : d <= 30
              ? "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]"
              : d <= 60
                ? "bg-[#FDF3E3] text-[#854F0B] border-[#F0C97E]"
                : "bg-[#EAF4FB] text-[#185FA5] border-[#85B7EB]";
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-[12px]">{r.end_date}</span>
            <span className={`inline-flex w-fit items-center px-1.5 py-0.5 rounded-md border text-[10.5px] ${highlight}`}>
              {d < 0 ? `已逾期 ${-d} 天` : `${d} 天後到期`}
            </span>
          </div>
        );
      },
    },
    {
      id: "customer",
      header: "客戶 / 車牌",
      width: 180,
      sortValue: (r) => r.customer_name ?? "",
      exportValue: (r) =>
        `${r.customer_name ?? "—"}${r.vehicle_plate ? ` / ${r.vehicle_plate}` : ""}`,
      cell: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="text-[12.5px] font-semibold">{r.customer_name ?? "—"}</span>
          {r.vehicle_plate && (
            <span className="font-mono text-[11px] text-[#5A5955] bg-[#F2F2F2] px-1.5 py-0.5 rounded w-fit">
              {r.vehicle_plate}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "policy_no",
      header: "保單號 / 險種",
      width: 170,
      sortValue: (r) => r.policy_no ?? "",
      exportValue: (r) => `${r.policy_no ?? "—"} / ${POLICY_TYPE_LABEL[r.policy_type]}`,
      cell: (r) => (
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[11.5px] text-[#5A5955]">{r.policy_no ?? "—"}</span>
          <span className="inline-flex w-fit items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
            {POLICY_TYPE_LABEL[r.policy_type]}
          </span>
        </div>
      ),
    },
    {
      id: "insurer",
      header: "保險公司",
      width: 110,
      sortValue: (r) => r.insurer,
      exportValue: (r) => r.insurer,
      cell: (r) => <span className="text-[12.5px]">{r.insurer}</span>,
    },
    {
      id: "renewal_type",
      header: "招攬類型",
      width: 90,
      sortValue: (r) => r.renewal_type ?? "",
      exportValue: (r) => (r.renewal_type ? RENEWAL_TYPE_LABEL[r.renewal_type as RenewalType] : ""),
      cell: (r) =>
        r.renewal_type ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C] whitespace-nowrap">
            {RENEWAL_TYPE_LABEL[r.renewal_type as RenewalType]}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
    },
    {
      id: "premium",
      header: "保費",
      width: 90,
      align: "right",
      sortValue: (r) => r.premium ?? 0,
      exportValue: (r) => r.premium ?? 0,
      cell: (r) => (
        <span className="font-mono text-[12.5px]">
          {r.premium == null ? "—" : `$${Math.round(r.premium).toLocaleString()}`}
        </span>
      ),
    },
    {
      id: "assigned_to",
      header: "負責業務",
      width: 100,
      sortValue: (r) => r.assigned_to_name ?? "",
      exportValue: (r) => r.assigned_to_name ?? "",
      cell: (r) => <span className="text-[12.5px]">{r.assigned_to_name ?? "—"}</span>,
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      sortValue: (r) => r.status,
      exportValue: (r) => POLICY_STATUS_LABEL[r.status],
      cell: (r) => {
        const chip = POLICY_STATUS_CHIP[r.status];
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${chip.bg} ${chip.text}`}
          >
            {POLICY_STATUS_LABEL[r.status]}
          </span>
        );
      },
    },
    {
      id: "call_count",
      header: "電訪",
      width: 60,
      align: "right",
      sortValue: (r) => r.call_count,
      exportValue: (r) => r.call_count,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.call_count}</span>,
    },
  ];

  // ── KPIs / charts data ────────────────────────────
  const donutData = useMemo(
    () =>
      byType
        .filter((b) => b.count > 0)
        .map((b) => ({ name: b.label, value: b.count, color: DONUT_TONE_BY_TYPE[b.policy_type] })),
    [byType],
  );
  const barData = useMemo(
    () =>
      dueBuckets.map((b) => ({
        window: `${b.window} 天`,
        count: b.count,
      })),
    [dueBuckets],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">保險招攬工作台</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M01-10
        </span>
        <span className="text-[12px] text-[#9A9890]">
          續保到期清單 · 招攬中件數 · KPI · 險種分佈
        </span>
      </header>

      {/* KPI Row */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <KpiCard
          tone="amber"
          label="本月到期"
          value={kpis.expiring_this_month}
          layout="vertical"
        />
        <KpiCard
          tone="red"
          label="30 天內到期"
          value={kpis.expiring_30_days}
          layout="vertical"
        />
        <KpiCard tone="green" label="在保中" value={kpis.active_count} layout="vertical" />
        <KpiCard
          tone="gray"
          label="已過期未續"
          value={kpis.expired_unrenewed}
          layout="vertical"
        />
        <KpiCard
          tone="blue"
          label="本月續保率"
          value={`${kpis.renewal_rate_pct}%`}
          layout="vertical"
        />
      </section>

      {/* Charts Row */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg p-3 md:col-span-1">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-2">險種分佈</div>
          {donutData.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] py-8 text-center">尚無保單資料</div>
          ) : (
            <DonutChart
              data={donutData}
              showLegend
              size="sm"
              centerLabel={String(donutData.reduce((s, d) => s + d.value, 0))}
              centerCaption="總保單"
            />
          )}
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg p-3 md:col-span-2">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-2">即將到期分佈（90 天內）</div>
          {dueBuckets.every((b) => b.count === 0) ? (
            <div className="text-[12px] text-[#9A9890] py-8 text-center">
              90 天內無到期保單
            </div>
          ) : (
            <BarChart
              data={barData}
              categoryKey="window"
              valueKey="count"
              tone="amber"
              size="sm"
              rainbow
              showTooltip
            />
          )}
        </div>
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>狀態</label>
            <select
              className={inputCls}
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as PolicyStatus | "all")}
            >
              <option value="all">全部狀態</option>
              {(["active", "pending", "expired", "renewed", "cancelled"] as PolicyStatus[]).map(
                (s) => (
                  <option key={s} value={s}>
                    {POLICY_STATUS_LABEL[s]}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>險種</label>
            <select
              className={inputCls}
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as PolicyType | "all")}
            >
              <option value="all">全部險種</option>
              {(["compulsory", "voluntary", "theft", "other"] as PolicyType[]).map((t) => (
                <option key={t} value={t}>
                  {POLICY_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>到期區間</label>
            <select
              className={inputCls}
              value={filterExpiry}
              onChange={(e) =>
                setFilterExpiry(e.target.value as "30" | "60" | "90" | "expired" | "all")
              }
            >
              <option value="all">不限</option>
              <option value="30">未來 30 天</option>
              <option value="60">未來 60 天</option>
              <option value="90">未來 90 天</option>
              <option value="expired">已逾期</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>負責業務</label>
            <select
              className={inputCls}
              value={filterAssigned}
              onChange={(e) => setFilterAssigned(e.target.value)}
            >
              <option value="all">全部</option>
              {lookups.employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[180px]">
            <label className={labelCls}>搜尋（保單號 / 公司 / 備註）</label>
            <input
              className={inputCls}
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
              placeholder="輸入關鍵字..."
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              disabled={isPending}
              onClick={applyFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              disabled={isPending}
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            <button
              disabled={isPending || !canEdit}
              onClick={() => setModalOpen(true)}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              title={canEdit ? "" : "需要 sales.insurance.edit 權限"}
            >
              ＋ 新增保險件
            </button>
          </div>
        </div>
      </section>

      {/* Pending Kanban */}
      {pendingRows.length > 0 && (
        <section className="bg-white border border-[#EEECE6] rounded-lg">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 招攬中（pending） · {pendingRows.length} 件
            </span>
            <span className="text-[11px] text-[#9A9890]">點「續保」標記成交、「取消」標記放棄</span>
          </header>
          <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {pendingRows.slice(0, 12).map((r) => {
              const d = r.days_to_expiry;
              const tone =
                d < 0 || d <= 30
                  ? "border-l-[3px] border-l-[#CC0000]"
                  : d <= 60
                    ? "border-l-[3px] border-l-[#854F0B]"
                    : "border-l-[3px] border-l-[#185FA5]";
              return (
                <article
                  key={r.id}
                  className={`bg-[#FAFAF8] border border-[#EEECE6] rounded-md p-2.5 ${tone}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[12.5px] font-semibold truncate">
                        {r.customer_name ?? "—"}
                      </div>
                      <div className="text-[11px] text-[#5A5955] mt-0.5">
                        {r.vehicle_plate ?? "—"} · {POLICY_TYPE_LABEL[r.policy_type]} · {r.insurer}
                      </div>
                      <div className="text-[11px] text-[#9A9890] mt-0.5 font-mono">
                        到期 {r.end_date}（
                        {d < 0 ? `逾期 ${-d} 天` : `剩 ${d} 天`}）
                      </div>
                    </div>
                    {r.renewal_type && (
                      <span className="inline-flex shrink-0 items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#EBF3FF] text-[#1A3A5C] whitespace-nowrap">
                        {RENEWAL_TYPE_LABEL[r.renewal_type as RenewalType]}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    <button
                      disabled={isPending || !canEdit}
                      onClick={() => handleRenew(r.id)}
                      className="h-[24px] px-2 text-[11px] rounded bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                    >
                      ✓ 續保
                    </button>
                    <button
                      disabled={isPending || !canEdit}
                      onClick={() => handleCancel(r.id)}
                      className="h-[24px] px-2 text-[11px] rounded bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                    >
                      ✕ 取消
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
          {pendingRows.length > 12 && (
            <div className="px-4 py-2 text-[11px] text-[#9A9890] border-t border-[#EEECE6]">
              還有 {pendingRows.length - 12} 件招攬中保單未顯示，請用上方篩選器（狀態=招攬中）查看完整清單。
            </div>
          )}
        </section>
      )}

      {/* Data grid */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[12px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆保單（顯示 <b>{rows.length}</b> 筆）
          </span>
        </div>
        <DataGrid
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          persistKey="sales/insurance"
          exportFileName="insurance-policies"
          emptyMessage="沒有符合條件的保單"
          disabled={isPending}
          rowActionsWidth={170}
          rowActions={(r) =>
            r.status === "pending" || r.status === "active" ? (
              <div className="flex gap-1">
                <button
                  disabled={isPending || !canEdit}
                  onClick={() => handleRenew(r.id)}
                  className="h-[26px] px-2.5 text-[11.5px] rounded bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  title={canEdit ? "標記已續保" : "需要編輯權限"}
                >
                  續保
                </button>
                <button
                  disabled={isPending || !canEdit}
                  onClick={() => handleCancel(r.id)}
                  className="h-[26px] px-2.5 text-[11.5px] rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                  title={canEdit ? "標記取消" : "需要編輯權限"}
                >
                  取消
                </button>
              </div>
            ) : (
              <span className="text-[11px] text-[#9A9890]">—</span>
            )
          }
          pagination={{
            page,
            pageSize,
            totalCount,
            onPageChange: goToPage,
          }}
        />
      </section>

      {/* Create Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center"
          onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}
        >
          <div className="bg-white rounded-xl w-[540px] max-w-[92vw] shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#EEECE6] flex items-center justify-between">
              <div className="text-[14px] font-bold">＋ 新增保險件</div>
              <button
                className="text-[20px] text-[#9A9890] px-1.5"
                onClick={() => setModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 max-h-[64vh] overflow-y-auto grid grid-cols-2 gap-3">
              <div>
                <div className={labelCls}>客戶</div>
                <select
                  className={inputCls}
                  value={draft.customer_id ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, customer_id: e.target.value || null, vehicle_id: null })
                  }
                >
                  <option value="">— 請選擇 —</option>
                  {lookups.customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className={labelCls}>配車（依客戶過濾）</div>
                <select
                  className={inputCls}
                  value={draft.vehicle_id ?? ""}
                  onChange={(e) => setDraft({ ...draft, vehicle_id: e.target.value || null })}
                >
                  <option value="">— 不關聯 —</option>
                  {lookups.vehicles
                    .filter((v) =>
                      draft.customer_id ? v.customer_id === draft.customer_id : true,
                    )
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <div className={labelCls}>
                  保險公司 <span className="text-[#CC0000]">*</span>
                </div>
                <input
                  className={inputCls}
                  value={draft.insurer}
                  onChange={(e) => setDraft({ ...draft, insurer: e.target.value })}
                  placeholder="例：富邦產險"
                />
              </div>
              <div>
                <div className={labelCls}>保單號</div>
                <input
                  className={inputCls}
                  value={draft.policy_no ?? ""}
                  onChange={(e) => setDraft({ ...draft, policy_no: e.target.value })}
                />
              </div>
              <div>
                <div className={labelCls}>險種</div>
                <select
                  className={inputCls}
                  value={draft.policy_type}
                  onChange={(e) =>
                    setDraft({ ...draft, policy_type: e.target.value as PolicyType })
                  }
                >
                  {(["compulsory", "voluntary", "theft", "other"] as PolicyType[]).map((t) => (
                    <option key={t} value={t}>
                      {POLICY_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className={labelCls}>招攬類型</div>
                <select
                  className={inputCls}
                  value={draft.renewal_type ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, renewal_type: (e.target.value || null) as RenewalType | null })
                  }
                >
                  <option value="">— 不指定 —</option>
                  {(
                    [
                      "new_to_renew",
                      "renew_to_renew",
                      "lapsed_to_renew",
                      "external_to_renew",
                      "in_service_no_policy",
                    ] as RenewalType[]
                  ).map((t) => (
                    <option key={t} value={t}>
                      {RENEWAL_TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <div className={labelCls}>起始日</div>
                <input
                  type="date"
                  className={inputCls}
                  value={draft.start_date ?? ""}
                  onChange={(e) => setDraft({ ...draft, start_date: e.target.value || null })}
                />
              </div>
              <div>
                <div className={labelCls}>
                  到期日 <span className="text-[#CC0000]">*</span>
                </div>
                <input
                  type="date"
                  className={inputCls}
                  value={draft.end_date}
                  onChange={(e) => setDraft({ ...draft, end_date: e.target.value })}
                />
              </div>
              <div>
                <div className={labelCls}>保費（NTD）</div>
                <input
                  type="number"
                  className={inputCls}
                  value={draft.premium ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      premium: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div>
                <div className={labelCls}>負責業務</div>
                <select
                  className={inputCls}
                  value={draft.assigned_to ?? ""}
                  onChange={(e) => setDraft({ ...draft, assigned_to: e.target.value || null })}
                >
                  <option value="">— 未指派 —</option>
                  {lookups.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <div className={labelCls}>備註</div>
                <textarea
                  className="w-full px-2 py-1.5 text-[12.5px] border border-[#D5D3CB] rounded outline-none focus:border-[#185FA5] resize-y min-h-[56px] bg-white"
                  value={draft.notes ?? ""}
                  onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                />
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                disabled={isPending}
                onClick={() => setModalOpen(false)}
                className="px-4 h-[30px] text-[12.5px] rounded border border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                disabled={isPending}
                onClick={submitDraft}
                className="px-4 h-[30px] text-[12.5px] rounded bg-[#0F6E56] text-white hover:bg-[#0a5742] font-medium disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "✓ 建立"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* Empty state（DataGrid 已處理 empty rows，但 0 筆 + 沒任何篩選時補一個 hint） */}
      {totalCount === 0 &&
        filters.status === "all" &&
        filters.policy_type === "all" &&
        filters.expiry_window === "all" &&
        !filters.search && (
          <section className="bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-4 py-3 text-[12px] text-[#854F0B]">
            目前還沒有任何保單資料。點右上「＋ 新增保險件」開始建立，或從售後維修工單匯入續保提醒。
          </section>
        )}
    </main>
  );
}
