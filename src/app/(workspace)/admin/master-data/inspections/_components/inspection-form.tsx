"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createInspectionAction,
  updateInspectionAction,
  type InspectionInput,
} from "@/lib/master-data/inspection-actions";
import {
  EMPTY_FINDING_DRAFT,
  type InspectionFieldKey,
  type InspectionFindingDraft,
} from "@/lib/master-data/inspection-form-types";
import type {
  CustomerVehicle,
  Employee,
  InspectionFinding,
  InspectionRecord,
  ServiceAppointment,
  WorkOrder,
} from "@/lib/parts/types";

const KIND_OPTIONS = [
  { value: "PI", label: "PI（進廠檢驗）" },
  { value: "PDI", label: "PDI（交車前檢驗）" },
];

const OVERALL_OPTIONS = [
  { value: "pending", label: "待檢" },
  { value: "pass", label: "通過" },
  { value: "fail", label: "未通過" },
  { value: "conditional", label: "有條件通過" },
];

const FINDING_STATUS_OPTIONS = [
  { value: "ok", label: "正常" },
  { value: "needs_attention", label: "需注意" },
  { value: "critical", label: "急修" },
  { value: "na", label: "不適用" },
];

const FINDING_STATUS_COLOR: Record<string, string> = {
  ok: "bg-[#E3FCEF] text-[#006644]",
  needs_attention: "bg-[#FFF7E6] text-[#974F00]",
  critical: "bg-[#FFEBE6] text-[#BF2600]",
  na: "bg-[#DFE1E6] text-[#42526E]",
};

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s.length === 0) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function utcToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const tw = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return tw.toISOString().slice(0, 16);
}

export function InspectionForm({
  mode,
  inspection,
  initialFindings,
  vehicles,
  workOrders,
  appointments,
  employees,
}: {
  mode: "create" | "edit";
  inspection?: InspectionRecord | null;
  initialFindings?: InspectionFinding[];
  vehicles: CustomerVehicle[];
  workOrders: WorkOrder[];
  appointments: ServiceAppointment[];
  employees: Employee[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<InspectionFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  const [findings, setFindings] = useState<InspectionFindingDraft[]>(() => {
    if (!initialFindings) return [];
    return initialFindings.map((f) => ({
      id: f.id,
      category: f.category,
      item_label: f.item_label,
      status: f.status as InspectionFindingDraft["status"],
      measurement: f.measurement,
      notes: f.notes,
      photo_url: f.photo_url,
    }));
  });

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const submitIdle = mode === "create" ? "建立檢驗紀錄" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fe = fieldErrors;

  function addFinding() {
    setFindings((prev) => [...prev, { ...EMPTY_FINDING_DRAFT }]);
  }

  function removeFinding(idx: number) {
    setFindings((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateFinding<K extends keyof InspectionFindingDraft>(
    idx: number,
    key: K,
    val: InspectionFindingDraft[K],
  ) {
    setFindings((prev) => prev.map((f, i) => (i === idx ? { ...f, [key]: val } : f)));
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: InspectionInput = {
      kind: (strOrNull(fd.get("kind")) ?? "PI") as InspectionInput["kind"],
      vehicle_id: String(fd.get("vehicle_id") ?? "").trim(),
      work_order_id: strOrNull(fd.get("work_order_id")),
      appointment_id: strOrNull(fd.get("appointment_id")),
      inspector_id: strOrNull(fd.get("inspector_id")),
      inspected_at: strOrNull(fd.get("inspected_at")),
      mileage_at_inspection: numOrNull(fd.get("mileage_at_inspection")),
      overall_status: (strOrNull(fd.get("overall_status")) ?? "pending") as InspectionInput["overall_status"],
      customer_signature_url: strOrNull(fd.get("customer_signature_url")),
      notes: strOrNull(fd.get("notes")),
      findings,
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createInspectionAction(input)
          : await updateInspectionAction(inspection!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立檢驗紀錄" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/inspections");
      } else {
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{error}</strong>
          {Object.keys(fe).length > 0 && (
            <span className="ml-2 text-[12px] text-[#BF2600]/80">
              請查看下方紅字欄位
            </span>
          )}
        </div>
      )}

      <fieldset
        disabled={isPending}
        className={isPending ? "pointer-events-none opacity-60 space-y-6" : "space-y-6"}
      >
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            基本資料
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              name="kind"
              label="檢驗類型"
              required
              defaultValue={inspection?.kind ?? "PI"}
              options={KIND_OPTIONS}
              error={fe.kind}
            />
            <SelectField
              name="overall_status"
              label="整體判定"
              required
              defaultValue={inspection?.overall_status ?? "pending"}
              options={OVERALL_OPTIONS}
              error={fe.overall_status}
            />
            <Combobox
              name="vehicle_id"
              label="檢驗車輛"
              required
              placeholder="搜尋車牌 / VIN…"
              defaultValue={inspection?.vehicle_id ?? ""}
              options={vehicles.map((v) => ({
                value: v.id,
                label: v.license_plate || v.vin || v.id.slice(0, 8),
                hint: [v.vin, v.engine_no].filter(Boolean).join(" · "),
              }))}
              error={fe.vehicle_id}
            />
            <Combobox
              name="inspector_id"
              label="檢驗員"
              placeholder="搜尋員工…"
              defaultValue={inspection?.inspector_id ?? ""}
              options={employees.map((e) => ({
                value: e.id,
                label: e.name,
                hint: [e.emp_code, e.position].filter(Boolean).join(" · "),
              }))}
              error={fe.inspector_id}
            />
            <FormField
              name="inspected_at"
              label="檢驗時間"
              type="datetime-local"
              defaultValue={utcToLocalInput(inspection?.inspected_at)}
              hint="台北時間，留空使用現在"
              error={fe.inspected_at}
            />
            <FormField
              name="mileage_at_inspection"
              label="檢驗里程"
              type="number"
              inputMode="decimal"
              defaultValue={inspection?.mileage_at_inspection ?? ""}
              suffix="km"
              error={fe.mileage_at_inspection}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            關聯單據（非必填）
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <Combobox
              name="work_order_id"
              label="關聯工單"
              placeholder="搜尋 RO 編號…"
              defaultValue={inspection?.work_order_id ?? ""}
              options={workOrders.map((w) => ({
                value: w.id,
                label: w.ro_no,
                hint: `總額 NT$ ${Math.round(Number(w.total_amount ?? 0)).toLocaleString()}`,
              }))}
              hint="進廠檢驗常會關聯工單"
              error={fe.work_order_id}
            />
            <Combobox
              name="appointment_id"
              label="關聯預約"
              placeholder="搜尋預約單號…"
              defaultValue={inspection?.appointment_id ?? ""}
              options={appointments.map((a) => ({
                value: a.id,
                label: a.appt_no,
                hint: a.scheduled_at
                  ? new Date(a.scheduled_at).toLocaleString("zh-TW", {
                      timeZone: "Asia/Taipei",
                    })
                  : undefined,
              }))}
              error={fe.appointment_id}
            />
          </div>
        </section>

        <section className="space-y-3">
          <header className="flex items-center justify-between">
            <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
              檢驗項目（{findings.length}）
            </h3>
            <button
              type="button"
              onClick={addFinding}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded border border-[#0052CC] text-[#0052CC] hover:bg-[#DEEBFF]"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              新增項目
            </button>
          </header>

          {findings.length === 0 ? (
            <p className="text-[13px] text-[#6B778C] py-3">
              尚無檢驗項目 — 點上方「新增項目」開始
            </p>
          ) : (
            <div className="space-y-2">
              {findings.map((f, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 gap-2 items-start p-3 border border-[#DFE1E6] rounded-md bg-[#FAFBFC]"
                >
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={f.category}
                      onChange={(e) =>
                        updateFinding(idx, "category", e.target.value)
                      }
                      placeholder="類別"
                      className="w-full px-2 py-1.5 border border-[#DFE1E6] rounded text-[13px] focus:outline-none focus:border-[#0052CC]"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="text"
                      value={f.item_label}
                      onChange={(e) =>
                        updateFinding(idx, "item_label", e.target.value)
                      }
                      placeholder="檢驗項目"
                      className="w-full px-2 py-1.5 border border-[#DFE1E6] rounded text-[13px] focus:outline-none focus:border-[#0052CC]"
                    />
                  </div>
                  <div className="col-span-2">
                    <select
                      value={f.status}
                      onChange={(e) =>
                        updateFinding(
                          idx,
                          "status",
                          e.target.value as InspectionFindingDraft["status"],
                        )
                      }
                      className={`w-full px-2 py-1.5 border border-[#DFE1E6] rounded text-[12px] font-medium ${FINDING_STATUS_COLOR[f.status] ?? ""}`}
                    >
                      {FINDING_STATUS_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={f.measurement ?? ""}
                      onChange={(e) =>
                        updateFinding(
                          idx,
                          "measurement",
                          e.target.value || null,
                        )
                      }
                      placeholder="測量值"
                      className="w-full px-2 py-1.5 border border-[#DFE1E6] rounded text-[13px] focus:outline-none focus:border-[#0052CC]"
                    />
                  </div>
                  <div className="col-span-2">
                    <input
                      type="text"
                      value={f.notes ?? ""}
                      onChange={(e) =>
                        updateFinding(idx, "notes", e.target.value || null)
                      }
                      placeholder="備註"
                      className="w-full px-2 py-1.5 border border-[#DFE1E6] rounded text-[13px] focus:outline-none focus:border-[#0052CC]"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeFinding(idx)}
                      className="p-1.5 text-[#6B778C] hover:text-[#BF2600] hover:bg-[#FFEBE6] rounded"
                      aria-label="移除"
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        delete
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <FormField
          name="customer_signature_url"
          label="客戶簽名檔案 URL"
          defaultValue={inspection?.customer_signature_url ?? ""}
          placeholder="非必填；交車檢驗才會用到"
          error={fe.customer_signature_url}
        />

        <FormField
          name="notes"
          label="備註"
          multiline
          rows={3}
          defaultValue={inspection?.notes ?? ""}
          placeholder="整體建議 / 後續追蹤 / 客戶反映…"
        />

        <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
          <SubmitButton
            idleLabel={submitIdle}
            pendingLabel={submitPending}
            pending={isPending}
          />
          <Link
            href="/admin/master-data/inspections"
            className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
          >
            取消
          </Link>
        </div>
      </fieldset>

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
    </form>
  );
}
