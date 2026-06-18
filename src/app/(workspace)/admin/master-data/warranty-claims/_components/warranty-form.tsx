"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createWarrantyClaimAction,
  updateWarrantyClaimAction,
  type WarrantyClaimInput,
} from "@/lib/master-data/warranty-actions";
import {
  EMPTY_LINE_DRAFT,
  type WarrantyFieldKey,
  type WarrantyLineDraft,
} from "@/lib/master-data/warranty-form-types";
import type {
  Customer,
  Item,
  VehicleModel,
  WarrantyClaim,
  WarrantyClaimLine,
} from "@/lib/parts/types";

type RepairOrderLite = { id: string; ro_code: string; lines_total: number | null };

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

const NT = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;

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

export function WarrantyForm({
  mode,
  claim,
  initialLines,
  customers,
  models,
  repairOrders,
  items,
}: {
  mode: "create" | "edit";
  claim?: WarrantyClaim | null;
  initialLines?: WarrantyClaimLine[];
  customers: Customer[];
  models: VehicleModel[];
  repairOrders: RepairOrderLite[];
  items: Item[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<WarrantyFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

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

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const submitIdle = mode === "create" ? "建立索賠單" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";

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

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: WarrantyClaimInput = {
      cl_no: strOrNull(fd.get("cl_no")),
      claim_type: (strOrNull(fd.get("claim_type")) ?? "oem_warranty") as WarrantyClaimInput["claim_type"],
      claim_date: strOrNull(fd.get("claim_date")),
      ro_id: strOrNull(fd.get("ro_id")),
      vin: strOrNull(fd.get("vin")),
      customer_id: strOrNull(fd.get("customer_id")),
      vehicle_model_id: strOrNull(fd.get("vehicle_model_id")),
      status: (strOrNull(fd.get("status")) ?? "draft") as WarrantyClaimInput["status"],
      applied_amount: numOrNull(fd.get("applied_amount")) ?? 0,
      approved_amount: numOrNull(fd.get("approved_amount")),
      parts_cost: numOrNull(fd.get("parts_cost")) ?? 0,
      labor_cost: numOrNull(fd.get("labor_cost")) ?? 0,
      forecast_receipt_date: strOrNull(fd.get("forecast_receipt_date")),
      actual_receipt_date: strOrNull(fd.get("actual_receipt_date")),
      oem_reference_no: strOrNull(fd.get("oem_reference_no")),
      notes: strOrNull(fd.get("notes")),
      lines,
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createWarrantyClaimAction(input)
          : await updateWarrantyClaimAction(claim!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立索賠單" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/warranty-claims");
      } else {
        router.refresh();
      }
    });
  };

  const fe = fieldErrors;

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
              label="關聯維修工單（RO）"
              placeholder="搜尋 RO 編號…"
              defaultValue={claim?.ro_id ?? ""}
              options={repairOrders.map((r) => ({
                value: r.id,
                label: r.ro_code,
                hint: `總額 NT$ ${Math.round(Number(r.lines_total ?? 0)).toLocaleString()}`,
              }))}
              hint="與某張維修工單對應；可空白"
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
          <SubmitButton
            idleLabel={submitIdle}
            pendingLabel={submitPending}
            pending={isPending}
          />
          <Link
            href="/admin/master-data/warranty-claims"
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
