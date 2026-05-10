"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  EMPTY_LINE_DRAFT,
  EMPTY_WARRANTY_FORM_STATE,
  type WarrantyFormState,
  type WarrantyLineDraft,
} from "@/lib/master-data/warranty-form-types";
import type {
  Customer,
  Item,
  VehicleModel,
  WarrantyClaim,
  WarrantyClaimLine,
  WorkOrder,
} from "@/lib/parts/types";

const CLAIM_TYPE_OPTIONS = [
  { value: "oem_warranty", label: "OEM 原廠保固" },
  { value: "extended_warranty", label: "延長保固" },
  { value: "tsb", label: "TSB 技術通報" },
  { value: "pdi", label: "PDI 交車檢驗" },
  { value: "goodwill", label: "Goodwill 善意保固" },
];

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "submitted", label: "已送件" },
  { value: "under_review", label: "審查中" },
  { value: "approved", label: "已核准" },
  { value: "partial_approved", label: "部分核准" },
  { value: "rejected", label: "拒絕" },
  { value: "received", label: "已收款" },
  { value: "cancelled", label: "已取消" },
];

type Action = (
  prev: WarrantyFormState,
  fd: FormData,
) => Promise<WarrantyFormState>;

const NT = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;

export function WarrantyForm({
  mode,
  action,
  claim,
  initialLines,
  customers,
  models,
  workOrders,
  items,
}: {
  mode: "create" | "edit";
  action: Action;
  claim?: WarrantyClaim | null;
  initialLines?: WarrantyClaimLine[];
  customers: Customer[];
  models: VehicleModel[];
  workOrders: WorkOrder[];
  items: Item[];
}) {
  const [state, formAction] = useActionState<WarrantyFormState, FormData>(
    action,
    EMPTY_WARRANTY_FORM_STATE,
  );

  const [lines, setLines] = useState<WarrantyLineDraft[]>(() => {
    if (!initialLines) return [];
    return initialLines.map((l) => ({
      id: l.id,
      line_no: l.line_no,
      item_id: l.item_id,
      serial_no: l.serial_no,
      qty: Number(l.qty),
      parts_cost: Number(l.parts_cost),
      labor_cost: Number(l.labor_cost),
      applied_amount: Number(l.applied_amount),
      approved_amount: l.approved_amount != null ? Number(l.approved_amount) : null,
      notes: l.notes,
    }));
  });

  const submitIdle = mode === "create" ? "建立索賠單" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fe = state.fieldErrors ?? {};

  const linesJson = useMemo(() => JSON.stringify(lines), [lines]);

  const totals = useMemo(
    () =>
      lines.reduce(
        (acc, l) => ({
          parts: acc.parts + (Number.isFinite(l.parts_cost) ? l.parts_cost : 0),
          labor: acc.labor + (Number.isFinite(l.labor_cost) ? l.labor_cost : 0),
          applied:
            acc.applied + (Number.isFinite(l.applied_amount) ? l.applied_amount : 0),
        }),
        { parts: 0, labor: 0, applied: 0 },
      ),
    [lines],
  );

  function addLine() {
    setLines((prev) => [
      ...prev,
      { ...EMPTY_LINE_DRAFT, line_no: prev.length + 1 },
    ]);
  }

  function removeLine(idx: number) {
    setLines((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((l, i) => ({ ...l, line_no: i + 1 })),
    );
  }

  function updateLine<K extends keyof WarrantyLineDraft>(
    idx: number,
    key: K,
    val: WarrantyLineDraft[K],
  ) {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, [key]: val };
        // Auto-fill applied_amount when parts/labor changes
        if (key === "parts_cost" || key === "labor_cost") {
          next.applied_amount = (next.parts_cost ?? 0) + (next.labor_cost ?? 0);
        }
        return next;
      }),
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {claim && <input type="hidden" name="id" value={claim.id} />}
      <input type="hidden" name="lines_json" value={linesJson} />

      {state.error && (
        <div
          role="alert"
          className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-3 text-[13px] text-[#BF2600]"
        >
          <strong className="font-semibold">{state.error}</strong>
          {state.fieldErrors && Object.keys(state.fieldErrors).length > 0 && (
            <span className="ml-2 text-[12px] text-[#BF2600]/80">
              請查看下方紅字欄位
            </span>
          )}
        </div>
      )}

      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          基本資料
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="cl_no"
            label="索賠單號"
            defaultValue={claim?.cl_no ?? ""}
            required={mode === "edit"}
            placeholder={mode === "create" ? "留空自動產生 WC-{YYYYMMDD}-{6 碼}" : ""}
            hint="同 brand 內 cl_no 唯一"
            error={fe.cl_no}
          />
          <FormField
            name="claim_date"
            label="索賠日期"
            type="date"
            required
            defaultValue={claim?.claim_date ?? new Date().toISOString().slice(0, 10)}
            error={fe.claim_date}
          />
          <SelectField
            name="claim_type"
            label="索賠類型"
            required
            defaultValue={claim?.claim_type ?? "oem_warranty"}
            options={CLAIM_TYPE_OPTIONS}
            error={fe.claim_type}
          />
          <SelectField
            name="status"
            label="狀態"
            required
            defaultValue={claim?.status ?? "draft"}
            options={STATUS_OPTIONS}
            error={fe.status}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          關聯車輛 / 工單（任選）
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <Combobox
            name="ro_id"
            label="關聯工單"
            placeholder="搜尋 RO 編號…"
            defaultValue={claim?.ro_id ?? ""}
            options={workOrders.map((w) => ({
              value: w.id,
              label: w.ro_no,
              hint: `總額 NT$ ${Math.round(Number(w.total_amount ?? 0)).toLocaleString()}`,
            }))}
            hint="與某張工單對應；可空白"
            error={fe.ro_id}
          />
          <Combobox
            name="customer_id"
            label="客戶"
            placeholder="搜尋姓名 / 代碼…"
            defaultValue={claim?.customer_id ?? ""}
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              hint: c.code,
            }))}
            error={fe.customer_id}
          />
          <Combobox
            name="vehicle_model_id"
            label="車型"
            placeholder="搜尋車系…"
            defaultValue={claim?.vehicle_model_id ?? ""}
            options={models.map((m) => ({
              value: m.id,
              label: m.display_name,
              hint: m.series,
            }))}
            error={fe.vehicle_model_id}
          />
          <FormField
            name="vin"
            label="VIN"
            defaultValue={claim?.vin ?? ""}
            placeholder="若無工單可手填"
            error={fe.vin}
          />
        </div>
      </section>

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            索賠明細（{lines.length}）
          </h3>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-[12px] font-semibold rounded border border-[#0052CC] text-[#0052CC] hover:bg-[#DEEBFF]"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            新增料號
          </button>
        </header>

        {lines.length === 0 ? (
          <p className="text-[13px] text-[#6B778C] py-3">
            尚無索賠料號 — 點上方「新增料號」開始
          </p>
        ) : (
          <div className="space-y-2">
            {lines.map((l, idx) => (
              <div
                key={idx}
                className="grid grid-cols-12 gap-2 items-start p-3 border border-[#DFE1E6] rounded-md bg-[#FAFBFC]"
              >
                <div className="col-span-3">
                  <select
                    value={l.item_id}
                    onChange={(e) => updateLine(idx, "item_id", e.target.value)}
                    className="w-full px-2 py-2 border border-[#DFE1E6] rounded text-[13px] focus:outline-none focus:border-[#0052CC]"
                  >
                    <option value="">— 選料號 —</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} · {i.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <input
                    type="text"
                    value={l.serial_no ?? ""}
                    onChange={(e) =>
                      updateLine(idx, "serial_no", e.target.value || null)
                    }
                    placeholder="序號"
                    className="w-full px-2 py-2 border border-[#DFE1E6] rounded text-[13px] focus:outline-none focus:border-[#0052CC]"
                  />
                </div>
                <div className="col-span-1">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.qty}
                    onChange={(e) =>
                      updateLine(idx, "qty", Number(e.target.value) || 0)
                    }
                    placeholder="數量"
                    className="w-full px-2 py-2 border border-[#DFE1E6] rounded text-[13px] text-right focus:outline-none focus:border-[#0052CC]"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.parts_cost}
                    onChange={(e) =>
                      updateLine(idx, "parts_cost", Number(e.target.value) || 0)
                    }
                    placeholder="料錢"
                    className="w-full px-2 py-2 border border-[#DFE1E6] rounded text-[13px] text-right focus:outline-none focus:border-[#0052CC]"
                  />
                </div>
                <div className="col-span-2">
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={l.labor_cost}
                    onChange={(e) =>
                      updateLine(idx, "labor_cost", Number(e.target.value) || 0)
                    }
                    placeholder="工錢"
                    className="w-full px-2 py-2 border border-[#DFE1E6] rounded text-[13px] text-right focus:outline-none focus:border-[#0052CC]"
                  />
                </div>
                <div className="col-span-1 text-right py-2 text-[13px] font-mono text-[#172B4D]">
                  {NT(l.applied_amount)}
                </div>
                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={() => removeLine(idx)}
                    className="p-1.5 text-[#6B778C] hover:text-[#BF2600] hover:bg-[#FFEBE6] rounded"
                    aria-label="移除"
                  >
                    <span className="material-symbols-outlined text-[18px]">
                      delete
                    </span>
                  </button>
                </div>
                <div className="col-span-12 grid grid-cols-12 gap-2 pt-1 border-t border-[#DFE1E6]">
                  <div className="col-span-3 text-[11px] text-[#6B778C]">
                    核准金額
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={l.approved_amount ?? ""}
                      onChange={(e) =>
                        updateLine(
                          idx,
                          "approved_amount",
                          e.target.value === "" ? null : Number(e.target.value),
                        )
                      }
                      placeholder="未審核留空"
                      className="w-full px-2 py-1 border border-[#DFE1E6] rounded text-[12px] text-right focus:outline-none focus:border-[#0052CC]"
                    />
                  </div>
                  <div className="col-span-6">
                    <input
                      type="text"
                      value={l.notes ?? ""}
                      onChange={(e) =>
                        updateLine(idx, "notes", e.target.value || null)
                      }
                      placeholder="備註"
                      className="w-full px-2 py-1 border border-[#DFE1E6] rounded text-[12px] focus:outline-none focus:border-[#0052CC]"
                    />
                  </div>
                </div>
              </div>
            ))}

            <div className="flex justify-end gap-6 pt-2 border-t border-[#DFE1E6] text-[13px]">
              <span>
                <span className="text-[#6B778C]">料</span>{" "}
                <span className="font-mono">{NT(totals.parts)}</span>
              </span>
              <span>
                <span className="text-[#6B778C]">工</span>{" "}
                <span className="font-mono">{NT(totals.labor)}</span>
              </span>
              <span className="font-bold">
                <span className="text-[#6B778C] font-normal">申請</span>{" "}
                <span className="font-mono">{NT(totals.applied)}</span>
              </span>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          原廠回應
        </h3>
        <div className="grid grid-cols-3 gap-4">
          <FormField
            name="oem_reference_no"
            label="原廠參考號"
            defaultValue={claim?.oem_reference_no ?? ""}
            error={fe.oem_reference_no}
          />
          <FormField
            name="forecast_receipt_date"
            label="預估收款日"
            type="date"
            defaultValue={claim?.forecast_receipt_date ?? ""}
            error={fe.forecast_receipt_date}
          />
          <FormField
            name="actual_receipt_date"
            label="實際收款日"
            type="date"
            defaultValue={claim?.actual_receipt_date ?? ""}
            error={fe.actual_receipt_date}
          />
        </div>
      </section>

      <FormField
        name="notes"
        label="備註"
        multiline
        rows={3}
        defaultValue={claim?.notes ?? ""}
        placeholder="原廠審核意見 / 客戶反映 / 後續追蹤…"
      />

      <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
        <SubmitButton idleLabel={submitIdle} pendingLabel={submitPending} />
        <Link
          href="/admin/master-data/warranty-claims"
          className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
        >
          取消
        </Link>
      </div>
    </form>
  );
}
