"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  SERVICE_TYPES,
  APPOINTMENT_STATUSES,
  statusChipClass,
  serviceTypeLabel,
  TECH_LOAD_MAX,
} from "@/domain/appointments.constants";
import {
  setAppointmentStatusAction,
  deleteAppointmentAction,
} from "@/lib/aftersales/appointment-actions";
import type {
  AppointmentListRow,
  AppointmentListFilters,
  AppointmentsListPageData,
} from "@/domain/appointments";

type Banner = { ok: boolean; msg: string } | null;

export function AppointmentsBoard({
  data,
  filters,
  canEdit,
}: {
  data: AppointmentsListPageData;
  filters: AppointmentListFilters;
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: "預約管理看板",
    breadcrumb: [{ label: "售後工單" }, { label: "預約管理看板" }],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [draftFilters, setDraftFilters] = useState<AppointmentListFilters>(filters);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
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
      router.push(`/parts/aftersales/appointments?${params.toString()}`);
    });
  };

  const handleQuickStatus = (id: string, status: string) => {
    startTransition(async () => {
      const res = await setAppointmentStatusAction(id, status);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已切到「${status}」` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
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
      exportValue: (r) => `${r.vehicle_model_name ?? ""} / ${r.vehicle_license_plate ?? ""}`,
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
      exportValue: (r) => serviceTypeLabel(r.service_type) + (r.service_subtype ? `-${r.service_subtype}` : ""),
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
      exportValue: (r) => (r.estimated_hours ? Number(r.estimated_hours).toFixed(1) + "h" : ""),
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
    data.rows.length > 0 ? `今日 ${data.kpis.total} 台 · 已到廠 ${data.kpis.arrived} 台` : "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">預約管理看板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後 Phase 1
        </span>
        <span className="text-[12px] text-[#9A9890]">{sprintCaption || "整條售後 pipeline 的入口"}</span>
      </header>

      {/* KPI Row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <KpiCard label="今日預約" value={`${data.kpis.total} 台`} sub={`已到廠 ${data.kpis.arrived} 台`} color="#1A3A5C" />
        <KpiCard
          label="等待中"
          value={`${data.kpis.waiting} 台`}
          sub={data.kpis.waiting_overdue > 0 ? `超時 ${data.kpis.waiting_overdue} 台` : "無超時"}
          color="#854F0B"
        />
        <KpiCard
          label="維修中"
          value={`${data.kpis.in_progress} 台`}
          sub={
            data.kpis.in_progress > 0
              ? `平均工時 ${data.kpis.in_progress_avg_hours}h`
              : "無進行中"
          }
          color="#185FA5"
        />
        <KpiCard
          label="已完成"
          value={`${data.kpis.completed} 台`}
          sub={`等待取車 ${data.kpis.pending_pickup} 台`}
          color="#3B6D11"
        />
      </section>

      {/* Schedule + TechLoad */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">📅 今日排程（{today}）</span>
            <Link
              href={`/parts/aftersales/appointments/new${today ? `?date=${today}` : ""}`}
              className="h-[26px] px-3 inline-flex items-center rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
            >
              ＋ 新增預約
            </Link>
          </header>
          <div className="px-4 py-3 max-h-[280px] overflow-y-auto">
            {data.schedule.length === 0 ? (
              <p className="text-[12px] text-[#9A9890]">今日無排程</p>
            ) : (
              <ul className="space-y-1.5">
                {data.schedule.map((s, i) => (
                  <li
                    key={`${s.bucket}-${i}`}
                    className="flex items-start gap-2 py-1 border-b border-[#F8F7F4] last:border-b-0"
                  >
                    <span className="text-[11px] font-mono text-[#9A9890] min-w-[100px]">
                      {s.bucket}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {s.items.map((it, j) => (
                        <span key={j} className="text-[12px] text-[#2C2C2A]">
                          {it.customer_name ?? "—"} {it.service_label}
                          {it.technician_short ? ` (${it.technician_short})` : ""}
                          {it.status === "已完成" ? " ✅" : ""}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">👨‍🔧 技師工作負載</span>
          </header>
          <div className="px-4 py-3 max-h-[280px] overflow-y-auto space-y-2">
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
              onChange={(e) => setDraftFilters({ ...draftFilters, date: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>狀態</label>
            <select
              className={inputCls}
              value={draftFilters.status || "all"}
              onChange={(e) => setDraftFilters({ ...draftFilters, status: e.target.value })}
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
              onChange={(e) => setDraftFilters({ ...draftFilters, service_type: e.target.value })}
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
              onClick={() => applyFilters({ date: "", status: "all", service_type: "all", technician_id: "all" })}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <Link
                href={`/parts/aftersales/appointments/new${today ? `?date=${today}` : ""}`}
                className="h-[30px] px-3 inline-flex items-center rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                ＋ 新增預約
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 4. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{data.totalCount}</b> 筆預約
          {today ? `（${today}）` : ""}
        </span>
      </div>

      {/* 5. Table */}
      <DataGrid
        columns={columns}
        data={data.rows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/appointments"
        exportFileName="appointments"
        emptyMessage="當天沒有預約資料"
        disabled={isPending}
        rowActionsWidth={canEdit ? 280 : 110}
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
            <button
              type="button"
              disabled
              title="預檢模組待開發"
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white opacity-40 cursor-not-allowed"
            >
              預檢
            </button>
            <Link
              href={`/parts/aftersales/appointments/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </Link>
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  handleDelete(r.id, `${(r.appointment_time as string).slice(0, 5)} ${r.customer_name ?? ""}`)
                }
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
              >
                刪除
              </button>
            )}
          </div>
        )}
      />

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
        TECH_LOAD_MAX = {TECH_LOAD_MAX} · 「預檢」按鈕待 pre_inspections 模組開發後啟用
      </p>
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
      <div className="text-[22px] font-bold mt-1" style={{ color }}>
        {value}
      </div>
      <div className="text-[11px] text-[#9A9890]">{sub}</div>
    </div>
  );
}
