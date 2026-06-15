"use client";

/**
 * 預約管理看板 — A 級（M03-2 / 第十輪 BDN）
 *
 * 升級點：
 *  1. 4 顆標準 <KpiCard tone delta>（本日預約 / 入廠率 / 未到 / 取消）
 *  2. <HeatMap> 週×時段（08-19）預約熱點
 *  3. <DonutChart> 狀態分佈
 *  4. 視圖切換：list（DataGrid）/ kanban（拖曳改狀態樂觀更新）/ schedule（時段條列）
 *  5. 樂觀更新 + pending 鎖 UI
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useMemo, useOptimistic } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  KpiCard,
  KanbanBoard,
  type KanbanCard,
  type KanbanColumn,
} from "@/components/visualization";
import { HeatMap, DonutChart, type DonutDatum, type HeatMapDatum } from "@/components/charts";
import {
  SERVICE_TYPES,
  APPOINTMENT_STATUSES,
  APPOINTMENT_KANBAN_COLUMNS,
  DAY_OF_WEEK_LABELS,
  statusChipClass,
  statusToKanbanColumn,
  serviceTypeLabel,
  TECH_LOAD_MAX,
} from "@/domain/appointments.constants";
import {
  setAppointmentStatusAction,
  deleteAppointmentAction,
  lookupVehicleForWalkInAction,
  createWalkInAppointmentAction,
} from "@/lib/aftersales/appointment-actions";
import type {
  AppointmentListRow,
  AppointmentListFilters,
  AppointmentsListPageData,
} from "@/domain/appointments";

type Banner = { ok: boolean; msg: string } | null;
type ViewMode = "list" | "kanban" | "schedule";

/** Walk-in 橫幅的互動狀態 */
type WalkInState =
  | { phase: "idle" }
  | { phase: "searching" }
  | { phase: "found"; vehicle_id: string; customer_id: string | null; vehicle_model_name: string | null; customer_name: string | null }
  | { phase: "not_found" }
  | { phase: "creating" };

export type AppointmentsBoardPageHeader = {
  title: string;
  breadcrumb: { label: string; href?: string }[];
  sprintChip?: string;
};

export function AppointmentsBoard({
  data,
  filters,
  canEdit,
  basePath = "/parts/aftersales/appointments",
  pageHeader = {
    title: "預約管理看板",
    breadcrumb: [{ label: "售後修護" }, { label: "預約管理看板" }],
    sprintChip: "M03-2 · A 級",
  },
}: {
  data: AppointmentsListPageData;
  filters: AppointmentListFilters;
  canEdit: boolean;
  basePath?: string;
  pageHeader?: AppointmentsBoardPageHeader;
}) {
  useSetPageHeader({
    title: pageHeader.title,
    breadcrumb: pageHeader.breadcrumb,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [draftFilters, setDraftFilters] = useState<AppointmentListFilters>(filters);
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Walk-in 臨時插單狀態
  const [walkInPlate, setWalkInPlate] = useState("");
  const [walkInState, setWalkInState] = useState<WalkInState>({ phase: "idle" });

  // 樂觀更新 status — 拖曳 Kanban / 快速切狀態用
  const [optimisticRows, applyOptimistic] = useOptimistic(
    data.rows,
    (state, action: { id: string; status: string }) =>
      state.map((r) => (r.id === action.id ? { ...r, status: action.status } : r)),
  );

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  /** Walk-in：以車牌查詢，結果帶入後續操作 */
  const handleWalkInLookup = () => {
    const plate = walkInPlate.trim();
    if (!plate) return;
    setWalkInState({ phase: "searching" });
    startTransition(async () => {
      const res = await lookupVehicleForWalkInAction(plate);
      if (!res.ok) {
        showBanner({ ok: false, msg: res.error });
        setWalkInState({ phase: "idle" });
        return;
      }
      if (res.data.found && res.data.vehicle_id) {
        setWalkInState({
          phase: "found",
          vehicle_id: res.data.vehicle_id,
          customer_id: res.data.customer_id,
          vehicle_model_name: res.data.vehicle_model_name,
          customer_name: res.data.customer_name,
        });
      } else {
        setWalkInState({ phase: "not_found" });
      }
    });
  };

  /** Walk-in：建立臨時進廠預約後導向預檢單新建頁 */
  const handleWalkInCreate = (
    vehicleId: string | null,
    customerId: string | null,
  ) => {
    setWalkInState({ phase: "creating" });
    startTransition(async () => {
      const res = await createWalkInAppointmentAction({
        plate: walkInPlate.trim(),
        vehicle_id: vehicleId,
        customer_id: customerId,
        service_type: "OT",
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 臨時進廠已建立，跳轉到預檢單" });
        router.push(
          `/parts/aftersales/pre-inspections/new?appointment_id=${res.data.id}`,
        );
      } else {
        showBanner({ ok: false, msg: res.error });
        setWalkInState({ phase: "idle" });
      }
    });
  };

  const applyFilters = (next: AppointmentListFilters) => {
    const params = new URLSearchParams();
    if (next.date) params.set("date", next.date);
    if (next.status && next.status !== "all") params.set("status", next.status);
    if (next.service_type && next.service_type !== "all")
      params.set("service_type", next.service_type);
    if (next.technician_id && next.technician_id !== "all")
      params.set("technician_id", next.technician_id);
    startTransition(() => {
      router.push(`${basePath}?${params.toString()}`);
    });
  };

  const handleQuickStatus = (id: string, status: string) => {
    startTransition(async () => {
      applyOptimistic({ id, status });
      const res = await setAppointmentStatusAction(id, status);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已切到「${status}」` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
        router.refresh(); // rollback 樂觀
      }
    });
  };

  const handleKanbanMove = (
    cardId: string,
    fromColumn: string,
    toColumn: string,
  ) => {
    if (fromColumn === toColumn) return;
    if (!canEdit) {
      showBanner({ ok: false, msg: "無編輯權限" });
      return;
    }
    // toColumn id 就是目標 status（"待到廠/已到廠/維修中/已完成"）
    handleQuickStatus(cardId, toColumn);
  };

  const handleDelete = (id: string, label: string) => {
    if (!confirm(`確定要刪除預約「${label}」？此操作不可復原。`)) return;
    startTransition(async () => {
      const res = await deleteAppointmentAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputCls =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white";
  const labelCls = "text-[11px] text-[#9A9890] font-medium";

  const today = filters.date || data.rows[0]?.appointment_date || "";

  // ── HeatMap data：把 server 回的 cells 轉成 HeatMapDatum[]
  const heatmapData = useMemo<HeatMapDatum[]>(() => {
    return data.heatmap.map((c) => ({
      x: `${String(c.hour).padStart(2, "0")}`,
      y: DAY_OF_WEEK_LABELS[c.day_of_week] ?? String(c.day_of_week),
      value: c.count,
    }));
  }, [data.heatmap]);

  // ── DonutChart：當前 row 的狀態分佈（用 optimistic）
  const statusDistribution = useMemo<DonutDatum[]>(() => {
    const palette: Record<string, string> = {
      待到廠: "#9A9890",
      已到廠: "#185FA5",
      等待中: "#854F0B",
      維修中: "#1A3A5C",
      待取車: "#0F6E56",
      已完成: "#3B6D11",
      已取消: "#CC0000",
    };
    const counts = new Map<string, number>();
    for (const r of optimisticRows) {
      counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
    }
    const out: DonutDatum[] = [];
    for (const s of APPOINTMENT_STATUSES) {
      const v = counts.get(s) ?? 0;
      if (v > 0) out.push({ name: s, value: v, color: palette[s] });
    }
    return out;
  }, [optimisticRows]);

  // ── Kanban cards
  const kanbanCards = useMemo<KanbanCard[]>(() => {
    return optimisticRows.map((r) => ({
      id: r.id,
      columnId: statusToKanbanColumn(r.status),
      content: <KanbanCardBody row={r} basePath={basePath} />,
    }));
  }, [optimisticRows, basePath]);

  const kanbanColumns = useMemo<KanbanColumn[]>(() => {
    return APPOINTMENT_KANBAN_COLUMNS.map((c) => ({
      id: c.id,
      title: c.title,
      tone: c.tone,
    }));
  }, []);

  const columns: DataGridColumn<AppointmentListRow>[] = [
    {
      id: "time",
      header: "預約時段",
      width: 90,
      cell: (r) => (
        <span className="font-mono text-[#1A3A5C] font-semibold">
          {(r.appointment_time as string).slice(0, 5)}
        </span>
      ),
      exportValue: (r) => (r.appointment_time as string).slice(0, 5),
      sortValue: (r) => r.appointment_time as string,
    },
    {
      id: "customer",
      header: "車主姓名",
      width: 140,
      cell: (r) => (
        <span className="font-medium text-[#2C2C2A]">{r.customer_name ?? "—"}</span>
      ),
      exportValue: (r) => r.customer_name ?? "",
    },
    {
      id: "vehicle",
      header: "車型 / 車牌",
      width: 200,
      cell: (r) => (
        <div className="flex flex-col leading-tight">
          <span className="text-[12px]">{r.vehicle_model_name ?? "（無車型）"}</span>
          <span className="text-[11px] text-[#9A9890] font-mono">
            {r.vehicle_license_plate ?? "—"}
          </span>
        </div>
      ),
      exportValue: (r) =>
        `${r.vehicle_model_name ?? ""} / ${r.vehicle_license_plate ?? ""}`,
    },
    {
      id: "service_type",
      header: "業務類型",
      width: 100,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EBF3FF] text-[#1A3A5C] text-[11px]">
          {serviceTypeLabel(r.service_type)}
          {r.service_subtype ? `-${r.service_subtype}` : ""}
        </span>
      ),
      exportValue: (r) =>
        serviceTypeLabel(r.service_type) +
        (r.service_subtype ? `-${r.service_subtype}` : ""),
      sortValue: (r) => r.service_type ?? "",
    },
    {
      id: "estimated_hours",
      header: "預估工時",
      width: 80,
      align: "right",
      cell: (r) => (
        <span className="text-[12px]">
          {r.estimated_hours ? `${Number(r.estimated_hours).toFixed(1)}h` : "—"}
        </span>
      ),
      exportValue: (r) =>
        r.estimated_hours ? Number(r.estimated_hours).toFixed(1) + "h" : "",
      sortValue: (r) => Number(r.estimated_hours ?? 0),
    },
    {
      id: "technician",
      header: "指派技師",
      width: 110,
      cell: (r) => <span>{r.technician_name ?? "—"}</span>,
      exportValue: (r) => r.technician_name ?? "",
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChipClass(r.status)}`}
        >
          {r.status}
        </span>
      ),
      exportValue: (r) => r.status,
    },
  ];

  const sprintCaption =
    data.rows.length > 0
      ? `今日 ${data.kpis.total} 台 · 已到廠 ${data.kpis.arrived} 台`
      : "整條售後 pipeline 的入口";

  const stats = data.stats;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{pageHeader.title}</h1>
        {pageHeader.sprintChip && (
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
            {pageHeader.sprintChip}
          </span>
        )}
        <span className="text-[12px] text-[#9A9890]">{sprintCaption}</span>
      </header>

      {/* Walk-in 臨時插單橫幅（B1-01：設計稿 amber 插單入口） */}
      {canEdit && (
        <section className="bg-[#FDF3E3] border border-[#E8C97A] rounded-lg px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="material-symbols-outlined text-[#854F0B] text-[18px]">directions_walk</span>
            <span className="text-[13px] font-semibold text-[#854F0B]">Walk-in 臨時插單</span>
            <span className="text-[11px] text-[#854F0B] opacity-80">— 輸入車牌立即查詢客戶/車輛，建立臨時進廠並啟動預檢</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              placeholder="車牌號碼（如：ABC-1234）"
              value={walkInPlate}
              onChange={(e) => {
                setWalkInPlate(e.target.value.toUpperCase());
                // 重新輸入時清除查詢結果
                if (walkInState.phase !== "idle") setWalkInState({ phase: "idle" });
              }}
              onKeyDown={(e) => { if (e.key === "Enter") handleWalkInLookup(); }}
              disabled={isPending}
              className="h-[30px] border border-[#E8C97A] rounded px-2 text-[12.5px] bg-white focus:border-[#854F0B] focus:outline-none w-[180px] disabled:opacity-60"
            />
            <button
              type="button"
              onClick={handleWalkInLookup}
              disabled={isPending || !walkInPlate.trim() || walkInState.phase === "searching"}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
            >
              {walkInState.phase === "searching" ? "查詢中⋯" : "查詢車牌"}
            </button>

            {/* 查到車輛：顯示資料並提供「建立臨時進廠」按鈕 */}
            {walkInState.phase === "found" && (() => {
              const s = walkInState;
              return (
                <>
                  <span className="text-[12px] text-[#2C2C2A]">
                    找到：
                    <b>{s.customer_name ?? "（未知車主）"}</b>
                    {s.vehicle_model_name ? `・${s.vehicle_model_name}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleWalkInCreate(s.vehicle_id, s.customer_id)}
                    disabled={isPending}
                    className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    {isPending ? "建立中⋯" : "建立臨時進廠"}
                  </button>
                </>
              );
            })()}

            {/* 查無車輛：引導建立人車檔案 */}
            {walkInState.phase === "not_found" && (
              <>
                <span className="text-[12px] text-[#CC0000]">查無車牌「{walkInPlate}」，請先建立人車檔案</span>
                <button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/parts/aftersales/customers/new?plate=${encodeURIComponent(walkInPlate)}`,
                    )
                  }
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  ＋ 建立人車檔案
                </button>
                {/* 仍可直接插單（不綁車輛） */}
                <button
                  type="button"
                  onClick={() => handleWalkInCreate(null, null)}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                >
                  {isPending ? "建立中⋯" : "直接插單"}
                </button>
              </>
            )}
          </div>
        </section>
      )}

      {/* 當日即時狀態 KPI 列（B1-02：設計稿「今日即時狀態分布」） */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {(
          [
            { label: "待到廠", value: data.todayStatusKpis.pending_arrival, color: "#6B6A68", bg: "#F2F2F2" },
            { label: "維修中", value: data.todayStatusKpis.in_repair, color: "#185FA5", bg: "#EAF4FB" },
            { label: "已完成", value: data.todayStatusKpis.completed, color: "#3B6D11", bg: "#EAF3DE" },
            { label: "取車中", value: data.todayStatusKpis.pending_pickup, color: "#854F0B", bg: "#FDF3E3" },
          ] as const
        ).map(({ label, value, color, bg }) => (
          <div
            key={label}
            className="rounded-lg border border-[#EEECE6] px-4 py-2.5 flex items-center gap-3"
            style={{ background: bg }}
          >
            <span className="text-[22px] font-bold" style={{ color }}>{value}</span>
            <div className="flex flex-col">
              <span className="text-[11px] font-medium" style={{ color }}>{label}</span>
              <span className="text-[10px] text-[#9A9890]">當日即時</span>
            </div>
          </div>
        ))}
      </section>

      {/* KPI Row — 4 顆標準 KpiCard with tone + delta */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard
          label="本日預約"
          value={`${stats.today_total} 台`}
          tone="blue"
          layout="vertical"
          icon={<span className="material-symbols-outlined text-[18px]">event</span>}
          delta={
            stats.delta_today_total !== 0
              ? {
                  value: Math.round(stats.delta_today_total),
                  tone: stats.delta_today_total > 0 ? "positive" : "negative",
                }
              : undefined
          }
        />
        <KpiCard
          label="入廠率（30 天）"
          value={`${stats.checked_in_rate.toFixed(1)}%`}
          tone="teal"
          layout="vertical"
          icon={
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
          }
          delta={
            stats.delta_checked_in_rate !== 0
              ? {
                  value: Math.round(stats.delta_checked_in_rate * 10) / 10,
                  tone:
                    stats.delta_checked_in_rate > 0 ? "positive" : "negative",
                }
              : undefined
          }
        />
        <KpiCard
          label="未到率（30 天）"
          value={`${stats.no_show_rate.toFixed(1)}%`}
          tone="amber"
          layout="vertical"
          icon={
            <span className="material-symbols-outlined text-[18px]">
              do_not_disturb_on
            </span>
          }
          delta={
            stats.delta_no_show_rate !== 0
              ? {
                  value: Math.round(stats.delta_no_show_rate * 10) / 10,
                  // no-show 下降是好事
                  tone: stats.delta_no_show_rate < 0 ? "positive" : "negative",
                }
              : undefined
          }
        />
        <KpiCard
          label="取消率（30 天）"
          value={`${stats.cancel_rate.toFixed(1)}%`}
          tone="red"
          layout="vertical"
          icon={
            <span className="material-symbols-outlined text-[18px]">cancel</span>
          }
          delta={
            stats.delta_cancel_rate !== 0
              ? {
                  value: Math.round(stats.delta_cancel_rate * 10) / 10,
                  tone: stats.delta_cancel_rate < 0 ? "positive" : "negative",
                }
              : undefined
          }
        />
      </section>

      {/* Heatmap + Status Donut + Tech Load 三欄 */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden md:col-span-2">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              週×時段預約熱點（近 60 天）
            </span>
            <span className="text-[11px] text-[#9A9890]">08:00 – 19:59</span>
          </header>
          <div className="px-4 py-3">
            <HeatMap data={heatmapData} tone="blue" size="md" showValues={false} />
          </div>
        </div>

        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              當前狀態分佈
            </span>
          </header>
          <div className="px-4 py-3">
            {statusDistribution.length === 0 ? (
              <p className="text-[12px] text-[#9A9890] py-12 text-center">
                當天無預約資料
              </p>
            ) : (
              <DonutChart
                data={statusDistribution}
                size="sm"
                showLegend
                centerLabel={`${optimisticRows.length}`}
                centerCaption="預約"
              />
            )}
          </div>
        </div>
      </section>

      {/* 技師工作負載 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">技師工作負載</span>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 max-h-[180px] overflow-y-auto">
          {data.techLoad.length === 0 ? (
            <p className="text-[12px] text-[#9A9890]">無技師資料</p>
          ) : (
            data.techLoad.map((t) => {
              const pct = Math.min(100, Math.round((t.load / t.max) * 100));
              const barColor = pct >= 75 ? "#854F0B" : "#3B6D11";
              return (
                <div key={t.id} className="flex items-center gap-2.5">
                  <div className="text-[12.5px] font-medium text-[#2C2C2A] min-w-[64px]">
                    {t.name}
                  </div>
                  <div className="flex-1">
                    <div className="bg-[#F2F2F2] rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, background: barColor }}
                      />
                    </div>
                    <div className="text-[10.5px] text-[#9A9890] mt-0.5">
                      {t.load}/{t.max} 台 · {t.status}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* 3. Filter Bar */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "opacity-60 pointer-events-none" : ""}`}
      >
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelCls}>預約日期</label>
            <input
              type="date"
              className={inputCls}
              value={draftFilters.date || ""}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, date: e.target.value })
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>狀態</label>
            <select
              className={inputCls}
              value={draftFilters.status || "all"}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, status: e.target.value })
              }
            >
              <option value="all">全部</option>
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>業務類型</label>
            <select
              className={inputCls}
              value={draftFilters.service_type || "all"}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, service_type: e.target.value })
              }
            >
              <option value="all">全部</option>
              {SERVICE_TYPES.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>指派技師</label>
            <select
              className={inputCls}
              value={draftFilters.technician_id || "all"}
              onChange={(e) =>
                setDraftFilters({ ...draftFilters, technician_id: e.target.value })
              }
            >
              <option value="all">全部技師</option>
              {data.lookups.technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              disabled={isPending}
              onClick={() => applyFilters(draftFilters)}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                applyFilters({
                  date: "",
                  status: "all",
                  service_type: "all",
                  technician_id: "all",
                })
              }
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <Link
                href={`${basePath}/new${today ? `?date=${today}` : ""}`}
                className="h-[30px] px-3 inline-flex items-center rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                ＋ 新增預約
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 4. Toolbar + 視圖切換 */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{data.totalCount}</b> 筆預約
          {today ? `（${today}）` : ""}
        </span>
        <div className="ml-auto inline-flex bg-[#F2F2F2] rounded-lg p-0.5">
          <ViewTab active={viewMode === "list"} onClick={() => setViewMode("list")}>
            清單
          </ViewTab>
          <ViewTab
            active={viewMode === "kanban"}
            onClick={() => setViewMode("kanban")}
          >
            看板
          </ViewTab>
          <ViewTab
            active={viewMode === "schedule"}
            onClick={() => setViewMode("schedule")}
          >
            排程
          </ViewTab>
        </div>
      </div>

      {/* 5. 視圖內容 */}
      {viewMode === "list" && (
        <DataGrid
          columns={columns}
          data={optimisticRows}
          rowKey={(r) => r.id}
          persistKey="parts/aftersales/appointments"
          exportFileName="appointments"
          emptyMessage="當天沒有預約資料"
          disabled={isPending}
          rowActionsWidth={canEdit ? 340 : 150}
          rowActions={(r) => (
            <div className="flex gap-1.5">
              {canEdit && r.status === "待到廠" && (
                <button
                  type="button"
                  onClick={() => handleQuickStatus(r.id, "已到廠")}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EBF3FF] border border-[#85B7EB] text-[#1A3A5C] hover:bg-[#dde9f8]"
                >
                  到廠
                </button>
              )}
              {/* 預檢按鈕：導向預檢單新建頁並帶入 appointment_id（設計稿 B1-03） */}
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/parts/aftersales/pre-inspections/new?appointment_id=${r.id}`,
                  )
                }
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
              >
                預檢
              </button>
              <Link
                href={`${basePath}/${r.id}`}
                className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                編輯
              </Link>
              {canEdit && (
                <button
                  type="button"
                  onClick={() =>
                    handleDelete(
                      r.id,
                      `${(r.appointment_time as string).slice(0, 5)} ${r.customer_name ?? ""}`,
                    )
                  }
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                >
                  刪除
                </button>
              )}
            </div>
          )}
        />
      )}

      {viewMode === "kanban" && (
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg p-3 ${isPending ? "opacity-60 pointer-events-none" : ""}`}
        >
          {optimisticRows.length === 0 ? (
            <p className="text-[12px] text-[#9A9890] text-center py-8">
              當天沒有預約資料
            </p>
          ) : (
            <>
              <p className="text-[11px] text-[#9A9890] mb-2">
                拖曳卡片到目標欄位即可切換狀態（樂觀更新）— 「等待中」併入「已到廠 /
                等待」、「待取車」併入「已完成 / 取車」
              </p>
              <KanbanBoard
                columns={kanbanColumns}
                cards={kanbanCards}
                onMove={canEdit ? handleKanbanMove : undefined}
              />
            </>
          )}
        </section>
      )}

      {viewMode === "schedule" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              今日排程（{today || "—"}）
            </span>
            {canEdit && (
              <Link
                href={`${basePath}/new${today ? `?date=${today}` : ""}`}
                className="h-[26px] px-3 inline-flex items-center rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
              >
                ＋ 新增預約
              </Link>
            )}
          </header>
          <div className="px-4 py-3 max-h-[420px] overflow-y-auto">
            {data.schedule.length === 0 ? (
              <p className="text-[12px] text-[#9A9890] py-6 text-center">今日無排程</p>
            ) : (
              <ul className="space-y-1.5">
                {data.schedule.map((s, i) => (
                  <li
                    key={`${s.bucket}-${i}`}
                    className="flex items-start gap-2 py-1 border-b border-[#F8F7F4] last:border-b-0"
                  >
                    <span className="text-[11px] font-mono text-[#9A9890] min-w-[110px]">
                      {s.bucket}
                    </span>
                    <div className="flex flex-col gap-0.5 flex-1">
                      {s.items.map((it, j) => (
                        <span key={j} className="text-[12px] text-[#2C2C2A]">
                          {it.customer_name ?? "—"} {it.service_label}
                          {it.technician_short ? ` (${it.technician_short})` : ""}
                          <span
                            className={`ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] ${statusChipClass(it.status)}`}
                          >
                            {it.status}
                          </span>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* 6. Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50
          ${banner.ok ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]" : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"}`}
        >
          {banner.msg}
        </div>
      )}

      {/* footer hint */}
      <p className="text-[10.5px] text-[#9A9890] mt-4">
        TECH_LOAD_MAX = {TECH_LOAD_MAX} · 「未到率」= 已過日期但仍為「待到廠」/
        總預約；「入廠率」= 已到廠以上 / 非取消預約
      </p>
    </main>
  );
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[26px] px-3 rounded-md text-[11.5px] font-medium transition-all ${
        active
          ? "bg-white text-[#1A3A5C] shadow-sm"
          : "text-[#5A5955] hover:text-[#1A3A5C]"
      }`}
    >
      {children}
    </button>
  );
}

function KanbanCardBody({
  row,
  basePath,
}: {
  row: AppointmentListRow;
  basePath: string;
}) {
  return (
    <Link
      href={`${basePath}/${row.id}`}
      className="block -m-3 px-3 py-2 hover:bg-[#F8F7F4]"
    >
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[11.5px] font-semibold text-[#1A3A5C]">
          {(row.appointment_time as string).slice(0, 5)}
        </span>
        <span className="text-[12px] font-medium text-[#2C2C2A] truncate">
          {row.customer_name ?? "（未指定）"}
        </span>
      </div>
      <div className="text-[11px] text-[#9A9890] mt-0.5 truncate font-mono">
        {row.vehicle_license_plate ?? "—"}
        {row.vehicle_model_name ? ` · ${row.vehicle_model_name}` : ""}
      </div>
      <div className="flex items-center gap-1 mt-1 flex-wrap">
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-[#EBF3FF] text-[#1A3A5C] text-[10.5px]">
          {serviceTypeLabel(row.service_type)}
          {row.service_subtype ? `-${row.service_subtype}` : ""}
        </span>
        {row.technician_name && (
          <span className="text-[10.5px] text-[#5A5955]">
            👨‍🔧 {row.technician_name}
          </span>
        )}
        {row.estimated_hours && (
          <span className="text-[10.5px] text-[#9A9890]">
            {Number(row.estimated_hours).toFixed(1)}h
          </span>
        )}
      </div>
    </Link>
  );
}
