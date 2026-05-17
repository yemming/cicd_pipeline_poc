"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createAppointmentAction,
  deleteAppointmentAction,
  updateAppointmentAction,
  type AppointmentInput,
} from "@/lib/master-data/appointment-actions";
import type { AppointmentFieldKey } from "@/lib/master-data/appointment-form-types";
import type { ServiceAppointment } from "@/lib/parts/types";

export type CustomerRef = { id: string; code: string | null; name: string; phone?: string | null };
export type VehicleRef = { id: string; license_plate: string | null; vin: string | null };
export type AdvisorRef = { id: string; emp_code?: string | null; name: string; position?: string | null };

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "schedule" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "schedule", label: "服務細節" },
  { key: "audit", label: "稽核資訊" },
];

const STATUS_OPTIONS = [
  { value: "booked", label: "已預約" },
  { value: "checked_in", label: "已報到" },
  { value: "in_progress", label: "施工中" },
  { value: "done", label: "已完成" },
  { value: "cancelled", label: "已取消" },
  { value: "no_show", label: "未到場" },
] as const;

const SERVICE_TYPE_OPTIONS = [
  { value: "general", label: "一般保養" },
  { value: "scheduled_maintenance", label: "定期保養" },
  { value: "repair", label: "維修" },
  { value: "pdi", label: "PDI 交車前檢驗" },
  { value: "other", label: "其他" },
] as const;

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label]));
const SERVICE_TYPE_LABEL = Object.fromEntries(SERVICE_TYPE_OPTIONS.map((o) => [o.value, o.label]));

function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const taipei = new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Taipei" });
  return taipei.replace(" ", "T").slice(0, 16);
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return "—";
  }
}

const blankInput = (): AppointmentInput => ({
  customer_id: "",
  vehicle_id: null,
  appt_no: null,
  scheduled_at: "",
  duration_minutes: 60,
  service_type: "general",
  mileage_at_appointment: null,
  status: "booked",
  advisor_id: null,
  notes: null,
});

const fromRow = (r: ServiceAppointment): AppointmentInput => ({
  customer_id: r.customer_id,
  vehicle_id: r.vehicle_id,
  appt_no: r.appt_no,
  scheduled_at: isoToLocal(r.scheduled_at),
  duration_minutes: r.duration_minutes,
  service_type: r.service_type as AppointmentInput["service_type"],
  mileage_at_appointment: r.mileage_at_appointment,
  status: r.status as AppointmentInput["status"],
  advisor_id: r.advisor_id,
  notes: r.notes,
});

export function AppointmentDetailView({
  appointment,
  customers,
  vehicles,
  advisors,
  canEdit,
  canCreateRO,
  initialMode = "view",
}: {
  appointment: ServiceAppointment | null;
  customers: CustomerRef[];
  vehicles: VehicleRef[];
  advisors: AdvisorRef[];
  canEdit: boolean;
  canCreateRO: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("schedule");

  const [draft, setDraft] = useState<AppointmentInput>(
    appointment ? fromRow(appointment) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<AppointmentInput>(blankInput());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<AppointmentFieldKey, string>>>({});

  const showInputs = editing || creating;
  const formDraft: AppointmentInput = creating ? createDraft : draft;
  const setFormDraft = (next: AppointmentInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const advisorMap = useMemo(() => new Map(advisors.map((a) => [a.id, a])), [advisors]);

  const customer = appointment ? customerMap.get(appointment.customer_id) ?? null : null;
  const vehicle = appointment?.vehicle_id ? vehicleMap.get(appointment.vehicle_id) ?? null : null;
  const advisor = appointment?.advisor_id ? advisorMap.get(appointment.advisor_id) ?? null : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!appointment) return;
    startTransition(async () => {
      setFieldErrors({});
      const res = await updateAppointmentAction(appointment.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const cancelEdit = () => {
    if (appointment) setDraft(fromRow(appointment));
    setFieldErrors({});
    setEditing(false);
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput());
    setFieldErrors({});
    setCreating(true);
  };

  const cancelCreate = () => {
    setFieldErrors({});
    if (initialMode === "create") router.push("/admin/master-data/appointments");
    else setCreating(false);
  };

  const submitCreate = () => {
    startTransition(async () => {
      setFieldErrors({});
      const res = await createAppointmentAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立預約，跳轉中…" });
        setCreating(false);
        router.push(`/admin/master-data/appointments/${res.data.id}`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!appointment) return;
    if (!confirm(`確定刪除預約「${appointment.appt_no}」？\n建議改用「已取消」狀態保留歷史。`)) return;
    startTransition(async () => {
      const res = await deleteAppointmentAction(appointment.id);
      if (res.ok) {
        router.push("/admin/master-data/appointments");
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const toggleActive = () => {
    if (!appointment) return;
    const next = appointment.status === "cancelled" ? "booked" : "cancelled";
    startTransition(async () => {
      const res = await updateAppointmentAction(appointment.id, {
        ...fromRow(appointment),
        status: next,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: next === "cancelled" ? "✓ 已取消預約" : "✓ 已恢復預約" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const sectionCard = (title: string, body: React.ReactNode) => (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{body}</div>
    </section>
  );

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const headlineLabel = creating
    ? "（未命名預約）"
    : appointment
      ? appointment.appt_no
      : "（資料缺失）";

  const newRoUrl = appointment
    ? `/admin/master-data/work-orders/new?customer=${appointment.customer_id}&vehicle=${appointment.vehicle_id ?? ""}&appointment=${appointment.id}`
    : "#";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/appointments" className="hover:text-[#185FA5]">
            維修預約
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增預約" : appointment?.appt_no ?? "—"}
          </span>
          {editing ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          ) : creating ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]"
              >
                取消
              </button>
            </>
          ) : creating ? (
            <>
              <button
                type="button"
                onClick={cancelCreate}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/admin/master-data/appointments"
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                disabled={!canEdit}
                onClick={openCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                disabled={!canEdit || !appointment}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !appointment}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit || !appointment}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {appointment?.status === "cancelled" ? "恢復" : "取消預約"}
              </button>
            </>
          )}
        </div>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">維修預約</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {headlineLabel}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <>
                    <span className="text-[#9A9890]">—</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                      尚未建立
                    </span>
                  </>
                ) : appointment ? (
                  <>
                    <span className="font-mono text-[#5A5955]">{appointment.appt_no}</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                      {STATUS_LABEL[appointment.status] ?? appointment.status}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                      {SERVICE_TYPE_LABEL[appointment.service_type] ?? appointment.service_type}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            {!creating && appointment && canCreateRO ? (
              <div className="flex items-center gap-1.5">
                <Link
                  href={newRoUrl}
                  className="h-[26px] inline-flex items-center px-3 rounded-full text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                  title="開新工單、預填此預約資料"
                >
                  建立工單
                </Link>
              </div>
            ) : null}
          </div>
          <div className="shrink-0">
            <div
              className={`w-[260px] h-[120px] rounded-lg flex flex-col items-center justify-center text-[12px] ${
                creating
                  ? "border-2 border-dashed border-[#D5D3CB] bg-[#F8F7F4] text-[#9A9890]"
                  : "border border-[#EEECE6] bg-[#F8F7F4]"
              }`}
            >
              {creating ? (
                <span>建立後顯示時間總覽</span>
              ) : appointment ? (
                <>
                  <div className="text-[11px] text-[#9A9890]">預約時間</div>
                  <div className="text-[15px] font-semibold text-[#2C2C2A] font-mono mt-0.5 text-center">
                    {fmtDateTime(appointment.scheduled_at)}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">
                    時長 {appointment.duration_minutes} 分鐘
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="車主（客戶）*"
            value={
              showInputs ? (
                <select
                  value={formDraft.customer_id}
                  onChange={(e) => setFormDraft({ ...formDraft, customer_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">— 選擇客戶 —</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{`${c.name}${c.code ? ` (${c.code})` : ""}`}</option>
                  ))}
                </select>
              ) : customer ? (
                <div>
                  <div className="font-medium">{customer.name}</div>
                  {customer.code ? (
                    <div className="font-mono text-[11px] text-[#9A9890]">{customer.code}</div>
                  ) : null}
                </div>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="車輛"
            value={
              showInputs ? (
                <select
                  value={formDraft.vehicle_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, vehicle_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">— 不指定 —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.license_plate ?? v.vin ?? v.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              ) : vehicle ? (
                <div className="font-mono">{vehicle.license_plate ?? vehicle.vin ?? "—"}</div>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="預約單號"
            value={
              showInputs ? (
                <input
                  value={formDraft.appt_no ?? ""}
                  onChange={(e) => setFormDraft({ ...formDraft, appt_no: e.target.value || null })}
                  placeholder="留空自動產生"
                  className={inputClass}
                />
              ) : appointment ? (
                <span className="font-mono">{appointment.appt_no}</span>
              ) : (
                "—"
              )
            }
          />
        </div>
        {Object.values(fieldErrors).some(Boolean) ? (
          <div className="px-4 pb-3 text-[11.5px] text-[#CC0000]">
            {Object.entries(fieldErrors)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </div>
        ) : null}
      </section>

      {/* 時間與服務 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 時間與服務</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="預約時間*"
            value={
              showInputs ? (
                <input
                  type="datetime-local"
                  value={formDraft.scheduled_at}
                  onChange={(e) => setFormDraft({ ...formDraft, scheduled_at: e.target.value })}
                  className={inputClass}
                />
              ) : appointment ? (
                fmtDateTime(appointment.scheduled_at)
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="預估時長（分鐘）"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={formDraft.duration_minutes ?? 60}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      duration_minutes: e.target.value ? Number(e.target.value) : 60,
                    })
                  }
                  className={inputClass}
                />
              ) : appointment ? (
                `${appointment.duration_minutes} 分鐘`
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="服務類型*"
            value={
              showInputs ? (
                <select
                  value={formDraft.service_type ?? "general"}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      service_type: e.target.value as AppointmentInput["service_type"],
                    })
                  }
                  className={inputClass}
                >
                  {SERVICE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : appointment ? (
                SERVICE_TYPE_LABEL[appointment.service_type] ?? appointment.service_type
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="預約當下里程（km）"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={formDraft.mileage_at_appointment ?? ""}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      mileage_at_appointment: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className={inputClass}
                />
              ) : appointment?.mileage_at_appointment != null ? (
                <span className="font-mono">{Number(appointment.mileage_at_appointment).toLocaleString("en-US")} km</span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="狀態*"
            value={
              showInputs ? (
                <select
                  value={formDraft.status ?? "booked"}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, status: e.target.value as AppointmentInput["status"] })
                  }
                  className={inputClass}
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : appointment ? (
                STATUS_LABEL[appointment.status] ?? appointment.status
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="服務顧問"
            value={
              showInputs ? (
                <select
                  value={formDraft.advisor_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, advisor_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">— 不指定 —</option>
                  {advisors.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.emp_code ? ` (${a.emp_code})` : ""}
                    </option>
                  ))}
                </select>
              ) : advisor ? (
                <div>
                  <div className="font-medium">{advisor.name}</div>
                  {advisor.emp_code ? (
                    <div className="font-mono text-[11px] text-[#9A9890]">{advisor.emp_code}</div>
                  ) : null}
                </div>
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      {/* 備註 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 備註</span>
        </header>
        <div className="px-4 py-4">
          {showInputs ? (
            <textarea
              rows={3}
              value={formDraft.notes ?? ""}
              onChange={(e) => setFormDraft({ ...formDraft, notes: e.target.value || null })}
              placeholder="客戶要求、特殊狀況…"
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
            />
          ) : (
            <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap min-h-[2.5em]">
              {appointment?.notes || <span className="text-[#9A9890]">—</span>}
            </div>
          )}
        </div>
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該預約的詳情頁，可進一步調整狀態、加備註與建立工單。
        </p>
      ) : null}

      {/* Tabs */}
      {!creating && appointment ? (
        <>
          <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto" id="tab-content">
            <div className="flex border-b border-[#EEECE6]">
              {TABS.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                      active
                        ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                        : "text-[#5A5955] hover:bg-[#F8F7F4]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {activeTab === "schedule" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionCard(
                  "服務概要",
                  <>
                    <Kv label="服務類型" value={SERVICE_TYPE_LABEL[appointment.service_type] ?? appointment.service_type} small />
                    <Kv label="目前狀態" value={STATUS_LABEL[appointment.status] ?? appointment.status} small />
                    <Kv label="預計時長" value={`${appointment.duration_minutes} 分鐘`} mono small />
                  </>,
                )}
                {sectionCard(
                  "工單關聯",
                  appointment.work_order_id ? (
                    <Kv
                      label="已關聯工單"
                      value={
                        <Link
                          href={`/admin/master-data/work-orders/${appointment.work_order_id}`}
                          className="text-[#185FA5] hover:underline font-mono"
                        >
                          開啟工單
                        </Link>
                      }
                      small
                    />
                  ) : (
                    <Kv label="尚未開立工單" value="—" small />
                  ),
                )}
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sectionCard(
                  "識別碼",
                  <>
                    <Kv label="系統識別碼" value={<span className="font-mono">{appointment.id}</span>} small />
                    <Kv label="品牌" value={appointment.brand_id} mono small />
                  </>,
                )}
                {sectionCard("建立", <Kv label="建立時間" value={fmtDateTime(appointment.created_at)} mono small />)}
                {sectionCard("更新", <Kv label="最後更新" value={fmtDateTime(appointment.updated_at)} mono small />)}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

function Kv({
  label,
  value,
  bold,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
