"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createInspectionAction,
  deleteInspectionAction,
  updateInspectionAction,
  type InspectionInput,
} from "@/lib/master-data/inspection-actions";
import type {
  InspectionFieldKey,
  InspectionFindingDraft,
} from "@/lib/master-data/inspection-form-types";
import type {
  CustomerVehicle,
  Employee,
  InspectionFinding,
  InspectionKind,
  InspectionOverallStatus,
  InspectionRecord,
  ServiceAppointment,
  WorkOrder,
} from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "findings" | "linked" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "findings", label: "檢驗結果" },
  { key: "linked", label: "相關單據" },
  { key: "audit", label: "稽核資訊" },
];

const KIND_OPTIONS: { value: InspectionKind; label: string }[] = [
  { value: "PI", label: "PI（進廠檢驗）" },
  { value: "PDI", label: "PDI（交車前檢驗）" },
];

const OVERALL_OPTIONS: { value: InspectionOverallStatus; label: string }[] = [
  { value: "pending", label: "待判定" },
  { value: "pass", label: "通過" },
  { value: "fail", label: "未通過" },
  { value: "conditional", label: "有條件通過" },
];

const KIND_LABEL = new Map(KIND_OPTIONS.map((o) => [o.value, o.label]));
const OVERALL_LABEL = new Map(OVERALL_OPTIONS.map((o) => [o.value, o.label]));

const FINDING_STATUS_LABEL: Record<InspectionFindingDraft["status"], string> = {
  ok: "正常",
  needs_attention: "需注意",
  critical: "嚴重",
  na: "不適用",
};

const FINDING_STATUS_CLS: Record<InspectionFindingDraft["status"], string> = {
  ok: "bg-[#EAF3DE] text-[#3B6D11]",
  needs_attention: "bg-[#FDF3E3] text-[#854F0B]",
  critical: "bg-[#FDECEA] text-[#CC0000]",
  na: "bg-[#F2F2F2] text-[#6B6A68]",
};

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return "—";
  }
}

function utcToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    // YYYY-MM-DDTHH:mm in Taipei
    const taipei = new Date(d.getTime() + (8 * 60 - d.getTimezoneOffset()) * 60_000);
    return taipei.toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

const blankInput = (): InspectionInput => ({
  kind: "PI",
  vehicle_id: "",
  work_order_id: null,
  appointment_id: null,
  inspector_id: null,
  inspected_at: null,
  mileage_at_inspection: null,
  overall_status: "pending",
  customer_signature_url: null,
  notes: null,
  findings: [],
});

const fromRow = (
  r: InspectionRecord,
  findings: InspectionFinding[],
): InspectionInput => ({
  kind: (r.kind as InspectionKind) ?? "PI",
  vehicle_id: r.vehicle_id,
  work_order_id: r.work_order_id,
  appointment_id: r.appointment_id,
  inspector_id: r.inspector_id,
  inspected_at: utcToLocalInput(r.inspected_at) || null,
  mileage_at_inspection: r.mileage_at_inspection,
  overall_status: (r.overall_status as InspectionOverallStatus) ?? "pending",
  customer_signature_url: r.customer_signature_url,
  notes: r.notes,
  findings: findings.map((f) => ({
    id: f.id,
    category: f.category,
    item_label: f.item_label,
    status: f.status as InspectionFindingDraft["status"],
    measurement: f.measurement,
    notes: f.notes,
    photo_url: f.photo_url,
  })),
});

export function InspectionDetailView({
  inspection,
  findings,
  vehicles,
  workOrders,
  appointments,
  employees,
  canEdit,
  initialMode = "view",
}: {
  inspection: InspectionRecord | null;
  findings: InspectionFinding[];
  vehicles: CustomerVehicle[];
  workOrders: WorkOrder[];
  appointments: ServiceAppointment[];
  employees: Employee[];
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("findings");
  const [draft, setDraft] = useState<InspectionInput>(
    inspection ? fromRow(inspection, findings) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<InspectionInput>(blankInput());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<InspectionFieldKey, string>>>({});

  const showInputs = editing || creating;
  const formDraft: InspectionInput = creating ? createDraft : draft;
  const setFormDraft = (next: InspectionInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const vehicleMap = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);
  const workOrderMap = useMemo(() => new Map(workOrders.map((w) => [w.id, w])), [workOrders]);
  const appointmentMap = useMemo(
    () => new Map(appointments.map((a) => [a.id, a])),
    [appointments],
  );
  const employeeMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const vehicle = inspection?.vehicle_id ? vehicleMap.get(inspection.vehicle_id) ?? null : null;
  const workOrder = inspection?.work_order_id
    ? workOrderMap.get(inspection.work_order_id) ?? null
    : null;
  const appointment = inspection?.appointment_id
    ? appointmentMap.get(inspection.appointment_id) ?? null
    : null;
  const inspector = inspection?.inspector_id
    ? employeeMap.get(inspection.inspector_id) ?? null
    : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!inspection) return;
    startTransition(async () => {
      setFieldErrors({});
      const res = await updateInspectionAction(inspection.id, draft);
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
    if (inspection) setDraft(fromRow(inspection, findings));
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
    if (initialMode === "create") router.push("/admin/master-data/inspections");
    else setCreating(false);
  };

  const submitCreate = () => {
    startTransition(async () => {
      setFieldErrors({});
      const res = await createInspectionAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立檢驗紀錄，跳轉中…" });
        setCreating(false);
        router.push(`/admin/master-data/inspections/${res.data.id}`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!inspection) return;
    if (
      !confirm(
        `確定刪除此 ${inspection.kind} 檢驗紀錄？\n所有 findings 將一起刪除（CASCADE），歷史將無法復原。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteInspectionAction(inspection.id);
      if (res.ok) {
        router.push("/admin/master-data/inspections");
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

  const headlineKind = creating
    ? "新增檢驗"
    : inspection
      ? `${inspection.kind}`
      : "—";
  const headlinePlate = vehicle?.license_plate ?? vehicle?.vin ?? inspection?.vehicle_id.slice(0, 8) ?? "";
  const headlineLabel = creating ? "（未建檢驗）" : `${headlineKind} ・ ${headlinePlate}`;

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/inspections" className="hover:text-[#185FA5]">
            PI / PDI 檢驗
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增檢驗" : headlineKind}
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
                href="/admin/master-data/inspections"
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
                disabled={!canEdit || !inspection}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !inspection}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
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
              <div className="text-[11px] tracking-wider text-[#9A9890]">PI / PDI 檢驗</div>
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
                ) : inspection ? (
                  <>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                      {KIND_LABEL.get(inspection.kind as InspectionKind) ?? inspection.kind}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        inspection.overall_status === "pass"
                          ? "bg-[#EAF3DE] text-[#3B6D11]"
                          : inspection.overall_status === "fail"
                            ? "bg-[#FDECEA] text-[#CC0000]"
                            : inspection.overall_status === "conditional"
                              ? "bg-[#FDF3E3] text-[#854F0B]"
                              : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {OVERALL_LABEL.get(inspection.overall_status as InspectionOverallStatus) ??
                        inspection.overall_status}
                    </span>
                    {inspector ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955]">
                        檢驗 {inspector.name}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
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
                <span>建立後顯示檢驗統計</span>
              ) : (
                <>
                  <div className="text-[11px] text-[#9A9890]">檢驗項目</div>
                  <div className="text-[26px] font-semibold text-[#2C2C2A] font-mono">
                    {findings.length}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">項</div>
                </>
              )}
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
            label="檢驗類型*"
            value={
              showInputs ? (
                <select
                  value={formDraft.kind ?? "PI"}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, kind: e.target.value as InspectionKind })
                  }
                  className={inputClass}
                >
                  {KIND_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                KIND_LABEL.get(inspection?.kind as InspectionKind) ?? inspection?.kind ?? "—"
              )
            }
          />
          <Kv
            label="車輛*"
            value={
              showInputs ? (
                <select
                  value={formDraft.vehicle_id}
                  onChange={(e) => setFormDraft({ ...formDraft, vehicle_id: e.target.value })}
                  className={inputClass}
                >
                  <option value="">— 請選擇 —</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {`${v.license_plate ?? "—"} / ${v.vin ?? "—"}`}
                    </option>
                  ))}
                </select>
              ) : vehicle ? (
                <div>
                  <div className="font-mono">{vehicle.license_plate ?? "—"}</div>
                  <div className="text-[11px] text-[#9A9890] font-mono">{vehicle.vin ?? "—"}</div>
                </div>
              ) : (
                <span className="text-[#9A9890]">未指定</span>
              )
            }
          />
          <Kv
            label="總體狀態"
            value={
              showInputs ? (
                <select
                  value={formDraft.overall_status ?? "pending"}
                  onChange={(e) =>
                    setFormDraft({
                      ...formDraft,
                      overall_status: e.target.value as InspectionOverallStatus,
                    })
                  }
                  className={inputClass}
                >
                  {OVERALL_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                OVERALL_LABEL.get(inspection?.overall_status as InspectionOverallStatus) ??
                inspection?.overall_status ?? "—"
              )
            }
          />
          <Kv
            label="檢驗員"
            value={
              showInputs ? (
                <select
                  value={formDraft.inspector_id ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, inspector_id: e.target.value || null })
                  }
                  className={inputClass}
                >
                  <option value="">— 未指定 —</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{`${e.name} (${e.emp_code})`}</option>
                  ))}
                </select>
              ) : inspector ? (
                <div>
                  <div className="font-medium">{inspector.name}</div>
                  <div className="font-mono text-[11px] text-[#9A9890]">{inspector.emp_code}</div>
                </div>
              ) : (
                <span className="text-[#9A9890]">未指定</span>
              )
            }
          />
          <Kv
            label="檢驗時間"
            value={
              showInputs ? (
                <input
                  type="datetime-local"
                  value={formDraft.inspected_at ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, inspected_at: e.target.value || null })
                  }
                  className={inputClass}
                />
              ) : (
                fmtDateTime(inspection?.inspected_at)
              )
            }
          />
          <Kv
            label="檢驗里程"
            value={
              showInputs ? (
                <input
                  type="number"
                  inputMode="numeric"
                  value={formDraft.mileage_at_inspection ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setFormDraft({
                      ...formDraft,
                      mileage_at_inspection: v === "" ? null : Number(v),
                    });
                  }}
                  className={inputClass}
                />
              ) : inspection?.mileage_at_inspection != null ? (
                <span className="font-mono">{inspection.mileage_at_inspection} km</span>
              ) : (
                <span className="text-[#9A9890]">—</span>
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

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後跳轉到該檢驗紀錄的詳情頁，可以新增 / 編輯各項檢驗結果（findings）。
        </p>
      ) : null}

      {/* Tabs */}
      {!creating && inspection ? (
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
                    {t.label} {t.key === "findings" ? `(${findings.length})` : ""}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {activeTab === "findings" ? (
              <div className="space-y-3">
                {sectionCard(
                  "檢驗結果",
                  findings.length === 0 ? (
                    <div className="text-[12px] text-[#9A9890]">尚無檢驗項目</div>
                  ) : (
                    <ul className="space-y-2">
                      {findings.map((f) => (
                        <li
                          key={f.id}
                          className="border border-[#EEECE6] rounded p-2.5 text-[12.5px]"
                        >
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[#9A9890]">{f.category}</span>
                            <span className="text-[#2C2C2A] font-medium">{f.item_label}</span>
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                                FINDING_STATUS_CLS[
                                  f.status as InspectionFindingDraft["status"]
                                ] ?? "bg-[#F2F2F2] text-[#6B6A68]"
                              }`}
                            >
                              {FINDING_STATUS_LABEL[
                                f.status as InspectionFindingDraft["status"]
                              ] ?? f.status}
                            </span>
                          </div>
                          {f.measurement || f.notes ? (
                            <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-2 text-[11.5px] text-[#5A5955]">
                              {f.measurement ? (
                                <div>
                                  <span className="text-[#9A9890]">量測：</span>
                                  <span className="font-mono">{f.measurement}</span>
                                </div>
                              ) : null}
                              {f.notes ? (
                                <div>
                                  <span className="text-[#9A9890]">備註：</span>
                                  {f.notes}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ),
                )}
                {editing ? (
                  <div className="text-[11.5px] text-[#854F0B] bg-[#FDF3E3] border border-[#F5E0B0] rounded p-2.5">
                    ⚠️ 在本頁編輯只更新基本資料與備註；要新增 / 修改檢驗項目（findings）請日後擴充本頁或先用舊表單。儲存時會保留現有 findings 不變。
                  </div>
                ) : null}
              </div>
            ) : null}

            {activeTab === "linked" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionCard(
                  "相關工單 / 預約",
                  <div className="space-y-2 text-[12.5px]">
                    <Kv
                      label="工單"
                      value={
                        workOrder ? (
                          <Link
                            href={`/admin/master-data/work-orders/${workOrder.id}`}
                            className="text-[#185FA5] hover:underline"
                          >
                            {workOrder.ro_no ?? workOrder.id.slice(0, 8)} →
                          </Link>
                        ) : (
                          <span className="text-[#9A9890]">未關聯</span>
                        )
                      }
                      small
                    />
                    <Kv
                      label="預約"
                      value={
                        appointment ? (
                          <Link
                            href={`/admin/master-data/appointments/${appointment.id}`}
                            className="text-[#185FA5] hover:underline"
                          >
                            {appointment.appt_no ?? appointment.id.slice(0, 8)} →
                          </Link>
                        ) : (
                          <span className="text-[#9A9890]">未關聯</span>
                        )
                      }
                      small
                    />
                  </div>,
                )}
                {sectionCard(
                  "備註與簽名",
                  <div className="space-y-2 text-[12.5px]">
                    <Kv
                      label="客戶簽名 URL"
                      value={
                        inspection.customer_signature_url ? (
                          <a
                            href={inspection.customer_signature_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[#185FA5] hover:underline break-all"
                          >
                            {inspection.customer_signature_url} ↗
                          </a>
                        ) : (
                          <span className="text-[#9A9890]">未提供</span>
                        )
                      }
                      small
                    />
                    <Kv
                      label="備註"
                      value={
                        inspection.notes ? (
                          <div className="whitespace-pre-wrap">{inspection.notes}</div>
                        ) : (
                          <span className="text-[#9A9890]">—</span>
                        )
                      }
                      small
                    />
                  </div>,
                )}
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sectionCard(
                  "識別碼",
                  <>
                    <Kv label="系統識別碼" value={<span className="font-mono">{inspection.id}</span>} small />
                    <Kv label="品牌" value={inspection.brand_id} mono small />
                  </>,
                )}
                {sectionCard("建立", <Kv label="建立時間" value={fmtDateTime(inspection.created_at)} mono small />)}
                {sectionCard("更新", <Kv label="最後更新" value={fmtDateTime(inspection.updated_at)} mono small />)}
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
