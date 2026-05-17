"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setAftersalesCustomerActiveAction,
  deleteAftersalesCustomerAction,
} from "@/lib/aftersales/customer-base-actions";
import {
  SERVICE_STATUS_LABEL,
  type AftersalesCustomerBaseFilters,
  type AftersalesServiceStatus,
  type AftersalesCustomerCrmFilters,
  type AftersalesCustomerCrmKpi,
  type AftersalesCustomerCrmRow,
} from "@/domain/aftersales-customer-base.constants";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  CrmCustomerCard,
  CrmKpiCard,
  CrmQuickFilterBar,
  CrmSidebar,
  type CrmCustomerCardChip,
  type CrmCustomerCardField,
  type CrmQuickFilterChip,
  type CrmSidebarGroup,
} from "@/components/crm";

export type AftersalesCustomerBaseRow = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  phone: string | null;
  email: string | null;
  is_active: boolean;
  primary_license_plate: string | null;
  primary_mileage: number | null;
  vehicle_count: number;
  visit_count: number;
  last_visit_at: string | null;
  last_ro_no: string | null;
  next_due_date: string | null;
  service_status: AftersalesServiceStatus;
};

type Banner = { ok: boolean; msg: string } | null;
type ViewMode = "card" | "table";

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}

function ServiceStatusChip({ status }: { status: AftersalesServiceStatus }) {
  const cls: Record<AftersalesServiceStatus, string> = {
    active_service: "bg-[#EAF3DE] text-[#3B6D11]",
    at_risk: "bg-[#FDF3E3] text-[#854F0B]",
    dormant: "bg-[#FDECEA] text-[#CC0000]",
    unknown: "bg-[#F2F2F2] text-[#6B6A68]",
  };
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${cls[status]}`}
    >
      {SERVICE_STATUS_LABEL[status]}
    </span>
  );
}

function buildQs(
  base: Record<string, string | undefined>,
  patch: Record<string, string | null>,
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v && v !== "all") next.set(k, v);
  }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "" || v === "all") next.delete(k);
    else next.set(k, v);
  }
  const s = next.toString();
  return s ? `?${s}` : "";
}

export function AftersalesCustomerBaseBoard({
  rows,
  totalCount,
  canEdit,
  filters,
  crmRows,
  crmKpi,
  crmFilters,
  view,
}: {
  rows: AftersalesCustomerBaseRow[];
  totalCount: number;
  canEdit: boolean;
  filters: AftersalesCustomerBaseFilters;
  crmRows: AftersalesCustomerCrmRow[];
  crmKpi: AftersalesCustomerCrmKpi;
  crmFilters: AftersalesCustomerCrmFilters;
  view: ViewMode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [actionPendingId, setActionPendingId] = useState<string | null>(null);
  const [banner, setBanner] = useState<Banner>(null);

  // Table-view filters
  const [fServiceStatus, setFServiceStatus] = useState(filters.service_status);
  const [fType, setFType] = useState(filters.type);
  const [fQ, setFQ] = useState(view === "card" ? crmFilters.q : filters.q);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // 共用：URL 推送 helper（保留當前 view）
  const pushUrl = (patch: Record<string, string | null>) => {
    const base: Record<string, string | undefined> = {
      view: view === "card" ? undefined : "table",
      ...(view === "card"
        ? {
            quick: crmFilters.quick,
            source: crmFilters.source,
            status: crmFilters.status,
            q: crmFilters.q,
          }
        : {
            service_status: filters.service_status,
            type: filters.type,
            q: filters.q,
          }),
    };
    const qs = buildQs(base, patch);
    startTransition(() => {
      router.push(`/crm/aftersales/customer-base${qs}`);
    });
  };

  // Table-view 操作（保留既有行為）
  const submitFilters = () => {
    if (view === "card") {
      pushUrl({ q: fQ.trim() || null });
      return;
    }
    pushUrl({
      service_status: fServiceStatus === "all" ? null : fServiceStatus,
      type: fType === "all" ? null : fType,
      q: fQ.trim() || null,
    });
  };
  const resetFilters = () => {
    setFServiceStatus("all");
    setFType("all");
    setFQ("");
    startTransition(() =>
      router.push(
        view === "card"
          ? "/crm/aftersales/customer-base"
          : "/crm/aftersales/customer-base?view=table",
      ),
    );
  };

  const toggleActive = (r: { id: string; is_active: boolean }) => {
    setActionPendingId(r.id);
    startTransition(async () => {
      const res = await setAftersalesCustomerActiveAction(r.id, !r.is_active);
      setActionPendingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: { id: string; code: string; name: string }) => {
    if (
      !confirm(
        `確定刪除「${r.code} ${r.name}」？\n此動作不可復原；若有歷史工單／預約／車輛將會失敗，建議改用「停用」保留歷史。`,
      )
    )
      return;
    setActionPendingId(r.id);
    startTransition(async () => {
      const res = await deleteAftersalesCustomerAction(r.id);
      setActionPendingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除客戶" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  // ── Card view helpers ──────────────────────────────────────────────
  const sidebarCounts = {
    all: crmRows.length,
    overdue: crmRows.filter((r) => r.traffic === "red").length,
    due_soon: crmRows.filter(
      (r) =>
        r.days_until_next_due != null &&
        r.days_until_next_due >= 0 &&
        r.days_until_next_due <= 30,
    ).length,
    ok: crmRows.filter((r) => r.traffic === "green").length,
    warranty_soon: crmRows.filter(
      (r) =>
        r.warranty_days_left != null &&
        r.warranty_days_left >= 0 &&
        r.warranty_days_left <= 60,
    ).length,
    desmo_soon: crmRows.filter(
      (r) => r.days_until_desmo != null && r.days_until_desmo <= 30,
    ).length,
    rs05: crmRows.filter((r) => r.source_badge === "rs05").length,
  };

  const sidebarGroups: CrmSidebarGroup[] = [
    {
      key: "return-status",
      title: "回廠狀態",
      items: [
        {
          key: "all",
          label: "全部客戶",
          count: sidebarCounts.all,
          active: crmFilters.quick === "all",
          onClick: () => pushUrl({ quick: null }),
        },
        {
          key: "overdue",
          label: "逾期未回廠",
          count: sidebarCounts.overdue,
          active: crmFilters.quick === "overdue",
          onClick: () => pushUrl({ quick: "overdue" }),
        },
        {
          key: "due_soon",
          label: "30 天內到期",
          count: sidebarCounts.due_soon,
          active: crmFilters.quick === "due_soon",
          onClick: () => pushUrl({ quick: "due_soon" }),
        },
        {
          key: "ok",
          label: "正常",
          count: sidebarCounts.ok,
        },
      ],
    },
    {
      key: "warranty",
      title: "保固・保險",
      items: [
        {
          key: "warranty_soon",
          label: "保固即將到期",
          count: sidebarCounts.warranty_soon,
          active: crmFilters.quick === "warranty_soon",
          onClick: () => pushUrl({ quick: "warranty_soon" }),
        },
        {
          key: "desmo_soon",
          label: "Desmo 到期提醒",
          count: sidebarCounts.desmo_soon,
          active: crmFilters.quick === "desmo_soon",
          onClick: () => pushUrl({ quick: "desmo_soon" }),
        },
      ],
    },
  ];

  const quickChips: CrmQuickFilterChip[] = [
    {
      key: "all",
      label: "全部",
      active: crmFilters.quick === "all",
      onClick: () => pushUrl({ quick: null }),
    },
    {
      key: "overdue",
      label: "🔴 逾期未回廠",
      count: sidebarCounts.overdue,
      active: crmFilters.quick === "overdue",
      onClick: () => pushUrl({ quick: "overdue" }),
    },
    {
      key: "due_soon",
      label: "⏰ 30 天內保養",
      count: sidebarCounts.due_soon,
      active: crmFilters.quick === "due_soon",
      onClick: () => pushUrl({ quick: "due_soon" }),
    },
    {
      key: "warranty_soon",
      label: "🛡️ 保固即將到期",
      count: sidebarCounts.warranty_soon,
      active: crmFilters.quick === "warranty_soon",
      onClick: () => pushUrl({ quick: "warranty_soon" }),
    },
    {
      key: "desmo_soon",
      label: "⚙️ Desmo 到期",
      count: sidebarCounts.desmo_soon,
      active: crmFilters.quick === "desmo_soon",
      onClick: () => pushUrl({ quick: "desmo_soon" }),
    },
    {
      key: "high_spend",
      label: "💰 高消費客戶",
      active: crmFilters.quick === "high_spend",
      onClick: () => pushUrl({ quick: "high_spend" }),
    },
    {
      key: "rs05",
      label: "🔗 RS05 交車同步",
      count: sidebarCounts.rs05,
      active: crmFilters.quick === "rs05",
      onClick: () => pushUrl({ quick: "rs05" }),
    },
    {
      key: "new",
      label: "✨ 新客戶",
      active: crmFilters.status === "new",
      onClick: () =>
        pushUrl({ status: crmFilters.status === "new" ? null : "new" }),
    },
  ];

  // ── Table-view columns（保留既有） ────────────────────────────────
  const columns: DataGridColumn<AftersalesCustomerBaseRow>[] = [
    {
      id: "code",
      header: "客戶代碼",
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/crm/aftersales/customer-base/${r.id}`}
          className="font-mono text-[12px] text-[#185FA5] hover:underline"
        >
          {r.code}
        </Link>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "客戶名稱",
      cell: (r) => (
        <div>
          <Link
            href={`/crm/aftersales/customer-base/${r.id}`}
            className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
          >
            {r.name}
          </Link>
          <div className="text-[11px] text-[#9A9890]">
            {r.type === "corporate" ? "公司戶" : "個人戶"}
            {r.phone ? ` ・ ${r.phone}` : ""}
          </div>
        </div>
      ),
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "primary_vehicle",
      header: "主車輛",
      width: 140,
      cell: (r) =>
        r.primary_license_plate ? (
          <div>
            <div className="font-mono font-semibold text-[12.5px] text-[#1A3A5C]">
              {r.primary_license_plate}
            </div>
            {r.vehicle_count > 1 ? (
              <div className="text-[11px] text-[#9A9890]">
                共 {r.vehicle_count} 台
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.primary_license_plate ?? "",
      sortValue: (r) => r.primary_license_plate ?? "",
    },
    {
      id: "primary_mileage",
      header: "目前里程",
      width: 100,
      align: "right",
      cell: (r) =>
        r.primary_mileage != null ? (
          <span className="font-mono text-[12px]">
            {Number(r.primary_mileage).toLocaleString("en-US")} km
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.primary_mileage ?? "",
      sortValue: (r) => r.primary_mileage ?? -1,
    },
    {
      id: "visit_count",
      header: "入廠次數",
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {r.visit_count}
        </span>
      ),
      exportValue: (r) => r.visit_count,
      sortValue: (r) => r.visit_count,
    },
    {
      id: "last_visit",
      header: "上次入廠",
      width: 130,
      cell: (r) =>
        r.last_visit_at ? (
          <div>
            <div className="font-mono text-[11.5px]">
              {fmtDate(r.last_visit_at)}
            </div>
            {r.last_ro_no ? (
              <div className="font-mono text-[10.5px] text-[#9A9890]">
                {r.last_ro_no}
              </div>
            ) : null}
          </div>
        ) : (
          <span className="text-[#9A9890] text-[12px]">未進廠</span>
        ),
      exportValue: (r) => r.last_visit_at ?? "",
      sortValue: (r) => r.last_visit_at ?? "",
    },
    {
      id: "next_due",
      header: "下次預定保養",
      width: 120,
      cell: (r) =>
        r.next_due_date ? (
          <span className="font-mono text-[11.5px]">
            {fmtDate(r.next_due_date)}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.next_due_date ?? "",
      sortValue: (r) => r.next_due_date ?? "",
    },
    {
      id: "service_status",
      header: "服務狀態",
      width: 110,
      cell: (r) => <ServiceStatusChip status={r.service_status} />,
      exportValue: (r) => SERVICE_STATUS_LABEL[r.service_status],
      sortValue: (r) => r.service_status,
    },
    {
      id: "email",
      header: "Email",
      defaultHidden: true,
      cell: (r) =>
        r.email ? (
          <span className="text-[11.5px]">{r.email}</span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.email ?? "",
      sortValue: (r) => r.email ?? "",
    },
    {
      id: "is_active",
      header: "往來",
      width: 70,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            r.is_active
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.is_active ? "往來中" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.is_active ? "往來中" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  // ── Render ────────────────────────────────────────────────────────
  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          售後客戶基盤
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後 CRM
        </span>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#F0EFFE] text-[#534AB7] font-semibold">
          ★5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          服務廠視角・累積入廠・上次保養・回廠提醒
        </span>
        <div className="ml-auto flex items-center gap-1 bg-[#F2F2F2] rounded-full p-0.5">
          <button
            type="button"
            onClick={() => pushUrl({ view: null })}
            aria-pressed={view === "card"}
            className={`h-[26px] px-3 rounded-full text-[11.5px] font-medium transition-colors ${
              view === "card"
                ? "bg-white text-[#1A3A5C] shadow-sm"
                : "text-[#5A5955] hover:text-[#2C2C2A]"
            }`}
          >
            卡片
          </button>
          <button
            type="button"
            onClick={() => pushUrl({ view: "table" })}
            aria-pressed={view === "table"}
            className={`h-[26px] px-3 rounded-full text-[11.5px] font-medium transition-colors ${
              view === "table"
                ? "bg-white text-[#1A3A5C] shadow-sm"
                : "text-[#5A5955] hover:text-[#2C2C2A]"
            }`}
          >
            列表
          </button>
        </div>
      </header>

      {/* ★5 跨模組 banner */}
      <section className="bg-[#F0EFFE] border border-[#C4BEF0] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-[#534AB7] font-semibold">
          ★5 跨模組
        </span>
        <span className="text-[12px] text-[#26215C]">
          本頁是 <strong>CRM 視角</strong>（NPS / 預約 / 行銷標籤）；同一批客戶在
          <strong>售後接待視角</strong>強調進廠 / 保固 / 主車輛維修履歷。
        </span>
        <Link
          href="/parts/aftersales/customers"
          className="ml-auto h-[26px] px-3 rounded-full text-[11.5px] inline-flex items-center bg-[#534AB7] text-white hover:bg-[#3F3793] font-medium"
        >
          切換到售後接待視角 →
        </Link>
      </section>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {view === "card" ? (
        <>
          {/* KPI 列 5 卡 */}
          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
            <CrmKpiCard
              icon="groups"
              label="售後客戶總數"
              value={crmKpi.total.toLocaleString("en-US")}
              sub={`本月進廠 ${crmKpi.this_month_visits} 次`}
              accent="navy"
            />
            <CrmKpiCard
              icon="error"
              label="逾期未回廠"
              value={crmKpi.overdue}
              sub={crmKpi.overdue > 0 ? "需立即聯繫" : "無逾期"}
              accent="red"
              active={crmFilters.quick === "overdue"}
              onClick={() =>
                pushUrl({
                  quick: crmFilters.quick === "overdue" ? null : "overdue",
                })
              }
            />
            <CrmKpiCard
              icon="schedule"
              label="30 天內到期"
              value={crmKpi.due_soon}
              sub="建議主動提醒"
              accent="amber"
              active={crmFilters.quick === "due_soon"}
              onClick={() =>
                pushUrl({
                  quick: crmFilters.quick === "due_soon" ? null : "due_soon",
                })
              }
            />
            <CrmKpiCard
              icon="check_circle"
              label="本月進廠台次"
              value={crmKpi.this_month_visits}
              sub="工單建立數"
              accent="teal"
            />
            <CrmKpiCard
              icon="sync"
              label="RS05 交車同步"
              value={crmKpi.rs05_synced}
              sub="尚未串 D+3 回訪（v1）"
              accent="blue"
              active={crmFilters.quick === "rs05"}
              onClick={() =>
                pushUrl({
                  quick: crmFilters.quick === "rs05" ? null : "rs05",
                })
              }
            />
          </section>

          {/* 雙欄：sidebar + main */}
          <div className="flex gap-3 items-start">
            <CrmSidebar
              groups={sidebarGroups}
              quickTools={[
                {
                  key: "calls",
                  label: "電訪工作台",
                  href: "/crm/aftersales/call-tasks",
                  icon: "phone_in_talk",
                },
                {
                  key: "ros",
                  label: "售後工單系統",
                  href: "/aftersales/repair-orders",
                  icon: "build",
                },
                {
                  key: "nps",
                  label: "NPS 滿意度",
                  href: "/crm/aftersales/nps",
                  icon: "thumb_up",
                },
              ]}
            />

            <div className="flex-1 min-w-0 space-y-3">
              {/* Quick filter + 搜尋 */}
              <section
                className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 space-y-2 ${isPending ? "pointer-events-none opacity-60" : ""}`}
              >
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
                    <label className={labelClass}>
                      代碼 / 名稱 / 電話 / 車牌
                    </label>
                    <input
                      type="text"
                      value={fQ}
                      onChange={(e) => setFQ(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && submitFilters()
                      }
                      placeholder="輸入關鍵字..."
                      className={`${inputClass} w-full`}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className={labelClass}>客戶來源</label>
                    <select
                      value={crmFilters.source}
                      onChange={(e) =>
                        pushUrl({
                          source:
                            e.target.value === "all" ? null : e.target.value,
                        })
                      }
                      className={`${inputClass} w-[120px]`}
                    >
                      <option value="all">所有來源</option>
                      <option value="rs05">RS05 同步</option>
                      <option value="walk">自行進廠</option>
                      <option value="sa">SA 自建</option>
                    </select>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={submitFilters}
                      disabled={isPending}
                      className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                    >
                      {isPending ? "查詢中…" : "查詢"}
                    </button>
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    >
                      重置
                    </button>
                    <Link
                      href="/crm/aftersales/customer-base/new"
                      aria-disabled={!canEdit}
                      data-testid="aftersales-customer-base-create-link"
                      className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
                    >
                      ＋ 新增客戶
                    </Link>
                  </div>
                </div>

                <CrmQuickFilterBar chips={quickChips} disabled={isPending} />
              </section>

              {/* 卡片 list */}
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#9A9890]">
                  共{" "}
                  <b className="text-[#2C2C2A]">
                    {crmKpi.total.toLocaleString("en-US")}
                  </b>{" "}
                  筆客戶（顯示{" "}
                  <b className="text-[#2C2C2A]">
                    {crmRows.length.toLocaleString("en-US")}
                  </b>{" "}
                  筆）
                </span>
              </div>

              {crmRows.length === 0 ? (
                <div className="bg-white border border-[#EEECE6] rounded-lg px-6 py-12 text-center text-[12.5px] text-[#9A9890]">
                  無符合條件的客戶，請調整篩選或快篩條件
                </div>
              ) : (
                <div className="space-y-2">
                  {crmRows.map((r) => {
                    const chips: CrmCustomerCardChip[] = [];
                    chips.push({
                      key: "source",
                      label: r.source_label,
                      color:
                        r.source_badge === "rs05"
                          ? "teal"
                          : r.source_badge === "walk"
                            ? "blue"
                            : "gray",
                    });
                    if (r.assigned_sa_name) {
                      chips.push({
                        key: "sa",
                        label: `SA: ${r.assigned_sa_name}`,
                        color: "navy",
                      });
                    }
                    if (!r.is_active) {
                      chips.push({
                        key: "off",
                        label: "停用",
                        color: "gray",
                      });
                    }

                    const fields: CrmCustomerCardField[] = [
                      {
                        label: "🏍️ 車款",
                        value: r.primary_model_name
                          ? `${r.primary_model_name}${r.primary_year ? ` (${r.primary_year})` : ""}`
                          : "—",
                      },
                      {
                        label: "📊 里程",
                        value:
                          r.primary_mileage != null
                            ? `${Number(r.primary_mileage).toLocaleString("en-US")} km`
                            : "—",
                      },
                      {
                        label: "🛡️ 保固",
                        value: r.warranty_until
                          ? `${fmtDate(r.warranty_until)}${
                              r.warranty_days_left != null
                                ? r.warranty_days_left < 0
                                  ? " (已過期)"
                                  : r.warranty_days_left <= 60
                                    ? ` (剩 ${r.warranty_days_left} 天)`
                                    : ""
                                : ""
                            }`
                          : "—",
                        tone:
                          r.warranty_days_left != null
                            ? r.warranty_days_left < 0
                              ? "warn"
                              : r.warranty_days_left <= 60
                                ? "soon"
                                : "default"
                            : "default",
                      },
                      {
                        label: "⚙️ Desmo 到期",
                        value: r.desmo_due_date
                          ? `${fmtDate(r.desmo_due_date)}${
                              r.days_until_desmo != null
                                ? r.days_until_desmo < 0
                                  ? ` (逾期 ${Math.abs(r.days_until_desmo)} 天)`
                                  : r.days_until_desmo <= 30
                                    ? ` (剩 ${r.days_until_desmo} 天)`
                                    : ""
                                : ""
                            }`
                          : "—",
                        tone:
                          r.days_until_desmo != null
                            ? r.days_until_desmo < 0
                              ? "warn"
                              : r.days_until_desmo <= 30
                                ? "soon"
                                : "default"
                            : "default",
                      },
                    ];

                    const isThisPending = actionPendingId === r.id;
                    const cardActions = (
                      <>
                        <button
                          type="button"
                          disabled={isThisPending || isPending}
                          onClick={() => {
                            setActionPendingId(r.id);
                            startTransition(() => {
                              router.push(
                                `/crm/aftersales/call-tasks?customer_id=${r.id}`,
                              );
                            });
                          }}
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#185FA5] hover:border-[#185FA5] disabled:opacity-50"
                        >
                          {isThisPending ? "前往中…" : "📞 電訪"}
                        </button>
                        <Link
                          href={`/aftersales/repair-orders?customer_id=${r.id}`}
                          className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                        >
                          🔧 工單
                        </Link>
                        <Link
                          href={`/crm/aftersales/customer-base/${r.id}`}
                          className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                        >
                          詳情 →
                        </Link>
                      </>
                    );

                    // 卡片左下 「逾期 N 天」/「剩 N 天」 — 放到 note 區塊更省欄位
                    const noteParts: string[] = [];
                    if (r.traffic === "red") {
                      if (
                        r.days_until_next_due != null &&
                        r.days_until_next_due < 0
                      )
                        noteParts.push(
                          `下次保養逾期 ${Math.abs(r.days_until_next_due)} 天`,
                        );
                      else if (
                        r.days_until_desmo != null &&
                        r.days_until_desmo < 0
                      )
                        noteParts.push(
                          `Desmo 逾期 ${Math.abs(r.days_until_desmo)} 天`,
                        );
                    } else if (r.traffic === "amber") {
                      if (
                        r.days_until_next_due != null &&
                        r.days_until_next_due >= 0
                      )
                        noteParts.push(`保養剩 ${r.days_until_next_due} 天`);
                      else if (
                        r.days_until_desmo != null &&
                        r.days_until_desmo >= 0
                      )
                        noteParts.push(`Desmo 剩 ${r.days_until_desmo} 天`);
                    }
                    if (r.last_visit_at)
                      noteParts.push(
                        `上次入廠 ${fmtDate(r.last_visit_at)}${r.last_ro_no ? ` · ${r.last_ro_no}` : ""}`,
                      );

                    return (
                      <CrmCustomerCard
                        key={r.id}
                        traffic={r.traffic}
                        name={r.name}
                        code={`${r.code}${r.phone ? ` · ${r.phone}` : ""}${r.primary_license_plate ? ` · ${r.primary_license_plate}` : ""}`}
                        chips={chips}
                        fields={fields}
                        note={noteParts.join(" ・ ") || null}
                        actions={cardActions}
                        disabled={isThisPending}
                        onClick={() =>
                          router.push(
                            `/crm/aftersales/customer-base/${r.id}`,
                          )
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Filter Bar (table) */}
          <section
            className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
          >
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex flex-col gap-1">
                <label className={labelClass}>服務狀態</label>
                <select
                  value={fServiceStatus}
                  onChange={(e) => setFServiceStatus(e.target.value)}
                  className={`${inputClass} w-[120px]`}
                >
                  <option value="all">全部</option>
                  <option value="active_service">服務中</option>
                  <option value="at_risk">待回廠</option>
                  <option value="dormant">流失邊緣</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>類型</label>
                <select
                  value={fType}
                  onChange={(e) => setFType(e.target.value)}
                  className={`${inputClass} w-[100px]`}
                >
                  <option value="all">全部</option>
                  <option value="individual">個人</option>
                  <option value="corporate">公司</option>
                </select>
              </div>
              <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
                <label className={labelClass}>
                  代碼 / 名稱 / 電話 / 統編 / 車牌
                </label>
                <input
                  type="text"
                  value={fQ}
                  onChange={(e) => setFQ(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitFilters()}
                  placeholder="輸入關鍵字..."
                  className={`${inputClass} w-full`}
                />
              </div>
              <div className="flex gap-2 ml-auto">
                <button
                  type="button"
                  onClick={submitFilters}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                >
                  {isPending ? "查詢中…" : "查詢"}
                </button>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  重置
                </button>
                <Link
                  href="/crm/aftersales/customer-base/new"
                  aria-disabled={!canEdit}
                  className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
                >
                  ＋ 新增客戶
                </Link>
              </div>
            </div>
          </section>

          {/* Toolbar */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#9A9890]">
              共{" "}
              <b className="text-[#2C2C2A]">
                {totalCount.toLocaleString("en-US")}
              </b>{" "}
              筆客戶（顯示{" "}
              <b className="text-[#2C2C2A]">
                {rows.length.toLocaleString("en-US")}
              </b>{" "}
              筆）
            </span>
          </div>

          {/* Table */}
          <DataGrid
            columns={columns}
            data={rows}
            rowKey={(r) => r.id}
            persistKey="aftersales/crm/customer-base"
            exportFileName={`aftersales-customer-base-${new Date().toISOString().slice(0, 10)}`}
            disabled={isPending}
            emptyMessage={
              filters.q ||
              filters.type !== "all" ||
              filters.service_status !== "all"
                ? "無符合條件的客戶，請調整篩選條件"
                : "尚無客戶資料"
            }
            rowActionsWidth={210}
            rowActions={(r) => (
              <>
                <Link
                  href={`/crm/aftersales/customer-base/${r.id}`}
                  className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  編輯
                </Link>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleActive(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  {r.is_active ? "停用" : "啟用"}
                </button>
                <button
                  type="button"
                  disabled={!canEdit}
                  onClick={() => removeRow(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  刪除
                </button>
              </>
            )}
          />
        </>
      )}
    </main>
  );
}
