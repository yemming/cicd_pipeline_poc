"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, useMemo } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { Timeline, type TimelineEvent } from "@/components/visualization";
import {
  APPOINTMENT_STATUSES,
  SERVICE_TYPES,
  SERVICE_SUBTYPES,
  APPOINTMENT_SOURCES,
  statusChipClass,
  serviceTypeLabel,
  serviceSubtypeLabel,
} from "@/domain/appointments.constants";
import {
  createAppointmentAction,
  updateAppointmentAction,
  setAppointmentStatusAction,
  cancelAppointmentAction,
  deleteAppointmentAction,
  type AppointmentInput,
} from "@/lib/aftersales/appointment-actions";
import type { AppointmentListRow, AppointmentLookups } from "@/domain/appointments";

type Mode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;

const LIST_HREF = "/parts/aftersales/appointments";

export function AppointmentDetailView({
  appointment,
  lookups,
  canEdit,
  initialMode,
  initialDate,
  initialCustomerId,
  initialVehicleId,
}: {
  appointment: AppointmentListRow | null;
  lookups: AppointmentLookups;
  canEdit: boolean;
  initialMode: Mode;
  initialDate?: string;
  /** 從別處（譬如車辨）帶入預填的 customer / vehicle */
  initialCustomerId?: string | null;
  initialVehicleId?: string | null;
}) {
  useSetPageHeader({
    title: appointment ? `預約 ${(appointment.appointment_time as string).slice(0, 5)} ${appointment.customer_name ?? ""}` : "新增預約",
    breadcrumb: [
      { label: "售後工單" },
      { label: "預約管理看板", href: LIST_HREF },
      { label: appointment ? "預約詳情" : "新增預約" },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [mode, setMode] = useState<Mode>(initialMode);
  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildInitialForm = (): AppointmentInput => {
    if (appointment) {
      const meta = (appointment.metadata ?? {}) as Record<string, unknown>;
      return {
        appointment_date: appointment.appointment_date,
        appointment_time: (appointment.appointment_time as string).slice(0, 5),
        customer_id: appointment.customer_id,
        vehicle_id: appointment.vehicle_id,
        service_type: appointment.service_type,
        service_subtype: appointment.service_subtype,
        estimated_hours: appointment.estimated_hours
          ? Number(appointment.estimated_hours)
          : null,
        assigned_technician_id: appointment.assigned_technician_id,
        status: appointment.status,
        notes: appointment.notes,
        source: (meta.source as string) ?? "",
      };
    }
    return {
      appointment_date: initialDate || todayLocal(),
      appointment_time: "09:00",
      customer_id: initialCustomerId ?? null,
      vehicle_id: initialVehicleId ?? null,
      service_type: "MN",
      service_subtype: "CP",
      estimated_hours: 1.5,
      assigned_technician_id: null,
      status: "待到廠",
      notes: "",
      source: "電話",
    };
  };

  const [form, setForm] = useState<AppointmentInput>(buildInitialForm);
  const filteredVehicles = useMemo(() => {
    if (!form.customer_id) return lookups.vehicles;
    return lookups.vehicles.filter((v) => v.customer_id === form.customer_id);
  }, [form.customer_id, lookups.vehicles]);

  const inputCls =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white w-full disabled:bg-[#F8F7F4]";
  const labelCls = "text-[11px] text-[#9A9890] font-medium";

  const editing = mode === "edit" || mode === "create";

  const submitCreate = () => {
    startTransition(async () => {
      const res = await createAppointmentAction(form);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立" });
        router.push(`${LIST_HREF}/${res.data.id}`);
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const submitUpdate = () => {
    if (!appointment) return;
    startTransition(async () => {
      const res = await updateAppointmentAction(appointment.id, form);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const handleStatus = (status: string) => {
    if (!appointment) return;
    startTransition(async () => {
      const res = await setAppointmentStatusAction(appointment.id, status);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已切到「${status}」` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const handleCancel = () => {
    if (!appointment) return;
    const reason = prompt("取消原因（可選）") ?? "";
    if (!confirm(`確定取消預約「${appointment.customer_name ?? ""}」？`)) return;
    startTransition(async () => {
      const res = await cancelAppointmentAction(appointment.id, reason);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已取消" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const handleDelete = () => {
    if (!appointment) return;
    if (!confirm("確定刪除此預約？此操作不可復原。")) return;
    startTransition(async () => {
      const res = await deleteAppointmentAction(appointment.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push(LIST_HREF);
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const pillBase =
    "h-[30px] px-4 rounded-full text-[12px] inline-flex items-center justify-center shadow-sm disabled:opacity-50";

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={LIST_HREF} className="hover:text-[#185FA5]">
            預約管理看板
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">
            {appointment
              ? `${(appointment.appointment_time as string).slice(0, 5)} ${appointment.customer_name ?? ""}`
              : "新增預約"}
          </span>
          {mode === "edit" && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          )}
          {mode === "create" && (
            <span className="ml-1 px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && appointment && (
            <>
              <Link
                href={LIST_HREF}
                className={`${pillBase} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
              >
                返回列表
              </Link>
              {canEdit && (
                <Link
                  href={`${LIST_HREF}/new?date=${appointment.appointment_date}`}
                  className={`${pillBase} font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
                >
                  新增
                </Link>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setMode("edit")}
                  className={`${pillBase} font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]`}
                >
                  修改
                </button>
              )}
              {canEdit && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className={`${pillBase} bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]`}
                >
                  刪除
                </button>
              )}
              {canEdit && appointment.status !== "已取消" && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className={`${pillBase} bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]`}
                >
                  取消預約
                </button>
              )}
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={() => {
                  setForm(buildInitialForm());
                  setMode("view");
                }}
                className={`${pillBase} bg-white border border-[#D5D3CB] text-[#5A5955]`}
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitUpdate}
                disabled={isPending}
                className={`${pillBase} font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
          {mode === "create" && (
            <>
              <Link
                href={LIST_HREF}
                className={`${pillBase} bg-white border border-[#D5D3CB] text-[#5A5955]`}
              >
                取消
              </Link>
              <button
                type="button"
                onClick={submitCreate}
                disabled={isPending}
                className={`${pillBase} font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]`}
              >
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">售後預約</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {appointment
                  ? `${(appointment.appointment_time as string).slice(0, 5)} · ${appointment.customer_name ?? "（未指定客戶）"}`
                  : "（新預約）"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {appointment ? (
                  <>
                    <span className="font-mono text-[#5A5955]">
                      {appointment.appointment_date}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md text-[11px] ${statusChipClass(appointment.status)}`}
                    >
                      {appointment.status}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-md bg-[#EBF3FF] text-[#1A3A5C] text-[11px]">
                      {serviceTypeLabel(appointment.service_type)}
                      {appointment.service_subtype
                        ? ` · ${serviceSubtypeLabel(appointment.service_subtype)}`
                        : ""}
                    </span>
                  </>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
                    尚未建立
                  </span>
                )}
              </div>
            </div>
            {appointment && mode === "view" && canEdit && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-[#9A9890]">快速切換：</span>
                {APPOINTMENT_STATUSES.filter((s) => s !== appointment.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleStatus(s)}
                    className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#185FA5]"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 3. 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div>
            <label className={labelCls}>預約日期</label>
            <input
              type="date"
              className={inputCls}
              disabled={!editing}
              value={form.appointment_date}
              onChange={(e) => setForm({ ...form, appointment_date: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>預約時段</label>
            <input
              type="time"
              step={1800}
              className={inputCls}
              disabled={!editing}
              value={form.appointment_time}
              onChange={(e) => setForm({ ...form, appointment_time: e.target.value })}
            />
          </div>
          <div>
            <label className={labelCls}>狀態</label>
            <select
              className={inputCls}
              disabled={!editing}
              value={form.status || "待到廠"}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
            >
              {APPOINTMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>客戶</label>
            <select
              className={inputCls}
              disabled={!editing}
              value={form.customer_id || ""}
              onChange={(e) => setForm({ ...form, customer_id: e.target.value || null, vehicle_id: null })}
            >
              <option value="">— 請選擇 —</option>
              {lookups.customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` (${c.phone})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>車輛</label>
            <select
              className={inputCls}
              disabled={!editing}
              value={form.vehicle_id || ""}
              onChange={(e) => setForm({ ...form, vehicle_id: e.target.value || null })}
            >
              <option value="">— 請選擇 —</option>
              {filteredVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.license_plate}
                  {v.model_name ? ` · ${v.model_name}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>預約來源</label>
            <select
              className={inputCls}
              disabled={!editing}
              value={form.source || ""}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            >
              <option value="">—</option>
              {APPOINTMENT_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 4. 業務內容 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 業務內容</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div>
            <label className={labelCls}>業務類型</label>
            <select
              className={inputCls}
              disabled={!editing}
              value={form.service_type || "MN"}
              onChange={(e) => setForm({ ...form, service_type: e.target.value })}
            >
              {SERVICE_TYPES.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>業務子類</label>
            <select
              className={inputCls}
              disabled={!editing}
              value={form.service_subtype || ""}
              onChange={(e) => setForm({ ...form, service_subtype: e.target.value || null })}
            >
              <option value="">—</option>
              {SERVICE_SUBTYPES.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.code} {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>預估工時（h）</label>
            <input
              type="number"
              step="0.5"
              min="0"
              className={inputCls}
              disabled={!editing}
              value={form.estimated_hours ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  estimated_hours: e.target.value === "" ? null : Number(e.target.value),
                })
              }
            />
          </div>
          <div>
            <label className={labelCls}>指派技師</label>
            <select
              className={inputCls}
              disabled={!editing}
              value={form.assigned_technician_id || ""}
              onChange={(e) =>
                setForm({ ...form, assigned_technician_id: e.target.value || null })
              }
            >
              <option value="">— 未指派 —</option>
              {lookups.technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>備註</label>
            <textarea
              className="w-full border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] focus:border-[#185FA5] focus:outline-none bg-white disabled:bg-[#F8F7F4]"
              rows={3}
              disabled={!editing}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
      </section>

      {/* 5. 時程記錄 — Timeline 視覺化 */}
      {appointment && mode !== "create" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 時程記錄</span>
          </header>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div>
              <Timeline
                events={buildTimelineEvents(appointment)}
                variant="vertical"
              />
            </div>
            <div className="grid grid-cols-1 gap-y-2.5 content-start">
              <Kv label="建立時間" value={appointment.created_at ?? "—"} mono />
              <Kv label="最後更新" value={appointment.updated_at ?? "—"} mono />
            </div>
          </div>
        </section>
      )}

      {mode === "create" && (
        <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 text-[12px] text-[#9A9890]">
          建立後將跳轉到該預約的詳情頁，可進一步維護時程、切換狀態、發動預檢⋯
        </section>
      )}

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50
          ${banner.ok ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]" : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"}`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span
        className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function fmtTime(t: string | null | undefined): string {
  if (!t) return "—";
  try {
    return new Date(t).toLocaleString("zh-TW", {
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return t;
  }
}

function buildTimelineEvents(a: AppointmentListRow): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  events.push({
    id: "booked",
    time: a.created_at ?? "—",
    title: "預約建立",
    description: `${a.appointment_date} ${(a.appointment_time as string).slice(0, 5)} · 來源 ${
      ((a.metadata ?? {}) as Record<string, unknown>).source ?? "—"
    }`,
    tone: "gray",
  });
  if (a.arrived_at) {
    events.push({
      id: "arrived",
      time: fmtTime(a.arrived_at),
      title: "到廠 / Check-in",
      description: "客戶報到、車輛入場",
      tone: "blue",
    });
  }
  if (a.started_at) {
    events.push({
      id: "started",
      time: fmtTime(a.started_at),
      title: "進車間 / 開始維修",
      description: a.technician_name ? `技師：${a.technician_name}` : undefined,
      tone: "amber",
    });
  }
  if (a.completed_at) {
    events.push({
      id: "completed",
      time: fmtTime(a.completed_at),
      title: "維修完工",
      description: "等待客戶取車",
      tone: "green",
    });
  }
  const meta = (a.metadata ?? {}) as Record<string, unknown>;
  if (meta.canceled_at) {
    events.push({
      id: "canceled",
      time: fmtTime(meta.canceled_at as string),
      title: "已取消",
      description: (meta.cancel_reason as string) ?? undefined,
      tone: "red",
    });
  }
  return events;
}

function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
