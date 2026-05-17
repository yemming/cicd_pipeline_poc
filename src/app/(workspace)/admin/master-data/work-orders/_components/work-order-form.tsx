"use client";

// TODO(2026-05-18 P0-#10 Batch 3): form 結構仍是 legacy 多表 wizard（528 行、含 line items 子表編輯器）。
// Actions 已升級成 ActionResult<T> + WorkOrderInput；form 改用 useTransition + onSubmit 串接，
// 但內部 line items 編輯 UI、CustomerWatcher polling、useState 結構保留不動。
// 完整 wizard 升級走 multi-step pattern（CLAUDE.md SOP §邊界），不適用標準 design pattern SOP。

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

import { Combobox } from "@/components/forms/combobox";
import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createWorkOrderAction,
  updateWorkOrderAction,
  type WorkOrderInput,
} from "@/lib/master-data/workorder-actions";
import {
  EMPTY_ITEM_DRAFT,
  type WorkOrderFieldKey,
  type WorkOrderItemDraft,
} from "@/lib/master-data/workorder-form-types";
import type {
  Customer,
  CustomerVehicle,
  Employee,
  Item,
  ServiceAppointment,
  WorkOrder,
  WorkOrderItem,
} from "@/lib/parts/types";

const STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "dispatched", label: "已派工" },
  { value: "in_progress", label: "施工中" },
  { value: "qc", label: "品檢" },
  { value: "done", label: "已完成" },
  { value: "closed", label: "已結案" },
  { value: "cancelled", label: "已取消" },
];

const KIND_OPTIONS = [
  { value: "parts", label: "料" },
  { value: "labor", label: "工" },
  { value: "external", label: "外包" },
  { value: "discount", label: "折扣" },
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

export function WorkOrderForm({
  mode,
  workOrder,
  initialItems,
  customers,
  vehicles,
  appointments,
  advisors,
  technicians,
  parts,
}: {
  mode: "create" | "edit";
  workOrder?: WorkOrder | null;
  initialItems?: WorkOrderItem[];
  customers: Customer[];
  vehicles: CustomerVehicle[];
  appointments: ServiceAppointment[];
  advisors: Employee[];
  technicians: Employee[];
  parts: Item[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<WorkOrderFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const [items, setItems] = useState<WorkOrderItemDraft[]>(() => {
    if (initialItems && initialItems.length > 0) {
      return initialItems
        .sort((a, b) => a.line_no - b.line_no)
        .map((it) => ({
          id: it.id,
          line_no: it.line_no,
          kind: it.kind as WorkOrderItemDraft["kind"],
          item_id: it.item_id,
          labor_code: it.labor_code,
          description: it.description,
          qty: Number(it.qty),
          unit_price: Number(it.unit_price),
          amount: Number(it.amount),
          technician_id: it.technician_id,
          labor_minutes: it.labor_minutes,
          is_warranty: it.is_warranty,
          notes: it.notes,
        }));
    }
    return [];
  });

  const itemsJson = useMemo(() => JSON.stringify(items), [items]);
  const partsTotal = items.filter((i) => i.kind === "parts").reduce((a, i) => a + i.amount, 0);
  const laborTotal = items.filter((i) => i.kind === "labor").reduce((a, i) => a + i.amount, 0);
  const externalTotal = items.filter((i) => i.kind === "external").reduce((a, i) => a + i.amount, 0);
  const discountTotal = items.filter((i) => i.kind === "discount").reduce((a, i) => a + i.amount, 0);
  const total = partsTotal + laborTotal + externalTotal + discountTotal;

  const updateItem = (idx: number, patch: Partial<WorkOrderItemDraft>) => {
    setItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const merged = { ...it, ...patch };
        if (merged.kind !== "discount") {
          const q = Number.isFinite(merged.qty) ? merged.qty : 0;
          const p = Number.isFinite(merged.unit_price) ? merged.unit_price : 0;
          merged.amount = q * p;
        }
        return merged;
      }),
    );
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { ...EMPTY_ITEM_DRAFT, line_no: prev.length + 1 },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((it, i) => ({ ...it, line_no: i + 1 })),
    );
  };

  const submitIdle = mode === "create" ? "建立工單" : "儲存變更";
  const submitPending = mode === "create" ? "建立中…" : "儲存中…";
  const fe = fieldErrors;

  // 客戶選擇後過濾車輛
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    workOrder?.customer_id ?? "",
  );
  const filteredVehicles = useMemo(
    () => (selectedCustomerId ? vehicles.filter((v) => v.customer_id === selectedCustomerId) : vehicles),
    [vehicles, selectedCustomerId],
  );

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: WorkOrderInput = {
      ro_no: strOrNull(fd.get("ro_no")),
      customer_id: String(fd.get("customer_id") ?? "").trim(),
      vehicle_id: String(fd.get("vehicle_id") ?? "").trim(),
      appointment_id: strOrNull(fd.get("appointment_id")),
      status: (strOrNull(fd.get("status")) ?? "draft") as WorkOrderInput["status"],
      advisor_id: strOrNull(fd.get("advisor_id")),
      lead_technician_id: strOrNull(fd.get("lead_technician_id")),
      mileage_in: numOrNull(fd.get("mileage_in")),
      mileage_out: numOrNull(fd.get("mileage_out")),
      customer_complaint: strOrNull(fd.get("customer_complaint")),
      diagnosis: strOrNull(fd.get("diagnosis")),
      work_summary: strOrNull(fd.get("work_summary")),
      notes: strOrNull(fd.get("notes")),
      items,
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createWorkOrderAction(input)
          : await updateWorkOrderAction(workOrder!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立工單" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/work-orders");
      } else {
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* itemsJson 不再用於 server action；保留 hidden input 避免測試或 DOM 觀察期外部依賴漂移 */}
      <input type="hidden" name="items_json" value={itemsJson} />

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

      {/* 主檔 */}
      <section className="space-y-3">
        <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
          工單主檔
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField
            name="ro_no"
            label="工單號"
            defaultValue={workOrder?.ro_no ?? ""}
            placeholder="留空自動產生"
            hint="同 brand 內唯一；可手動指定，留空走 RO-{YYYYMMDD}-{6 碼}"
            error={fe.ro_no}
          />
          <SelectField
            name="status"
            label="狀態"
            required
            defaultValue={workOrder?.status ?? "draft"}
            options={STATUS_OPTIONS}
          />
          <Combobox
            name="customer_id"
            label="車主"
            required
            placeholder="搜尋姓名 / 代碼 / 電話…"
            defaultValue={workOrder?.customer_id ?? ""}
            options={customers.map((c) => ({
              value: c.id,
              label: c.name,
              hint: [c.code, c.phone].filter(Boolean).join(" · "),
            }))}
            error={fe.customer_id}
          />
          <Combobox
            name="vehicle_id"
            label="車輛"
            required
            placeholder="搜尋車牌 / VIN…"
            defaultValue={workOrder?.vehicle_id ?? ""}
            options={filteredVehicles.map((v) => ({
              value: v.id,
              label: v.license_plate ?? v.vin ?? v.id.slice(0, 8),
              hint: [v.vin, v.color].filter(Boolean).join(" · "),
            }))}
            hint={
              selectedCustomerId
                ? `僅顯示該車主名下車輛（${filteredVehicles.length} 台）`
                : "選擇車主後會自動過濾"
            }
            error={fe.vehicle_id}
          />
          <SelectField
            name="appointment_id"
            label="關聯預約"
            defaultValue={workOrder?.appointment_id ?? ""}
            options={appointments.map((a) => ({
              value: a.id,
              label: a.appt_no,
              // 用 sv-SE 取 'YYYY-MM-DD HH:mm:ss' 跨平台穩定，
              // 避免 zh-TW locale 在 SSR/CSR 不同 ICU 版本下空白寬度不一致觸發 hydration mismatch。
              hint: new Date(a.scheduled_at)
                .toLocaleString("sv-SE", { timeZone: "Asia/Taipei" })
                .slice(0, 16),
            }))}
            hint="若由預約轉工單可選"
          />
          <SelectField
            name="advisor_id"
            label="服務顧問"
            defaultValue={workOrder?.advisor_id ?? ""}
            options={advisors.map((a) => ({
              value: a.id,
              label: a.name,
              hint: [a.emp_code, a.position].filter(Boolean).join(" · "),
            }))}
          />
          <SelectField
            name="lead_technician_id"
            label="主責技師"
            defaultValue={workOrder?.lead_technician_id ?? ""}
            options={technicians.map((t) => ({
              value: t.id,
              label: t.name,
              hint: [t.emp_code, t.position].filter(Boolean).join(" · "),
            }))}
          />
          <FormField
            name="mileage_in"
            label="進廠里程"
            type="number"
            inputMode="decimal"
            defaultValue={workOrder?.mileage_in ?? ""}
            suffix="km"
          />
          <FormField
            name="mileage_out"
            label="出廠里程"
            type="number"
            inputMode="decimal"
            defaultValue={workOrder?.mileage_out ?? ""}
            suffix="km"
          />
        </div>

        {/* select 客戶後讓 vehicle filter 即時更新：純 client 監聽 hidden input */}
        <CustomerWatcher onChange={setSelectedCustomerId} />
      </section>

      {/* 客訴 / 診斷 / 工作摘要 */}
      <section className="grid grid-cols-1 gap-4">
        <FormField
          name="customer_complaint"
          label="客戶反映"
          multiline
          rows={2}
          defaultValue={workOrder?.customer_complaint ?? ""}
          placeholder="例：怠速時引擎熄火、煞車異音..."
        />
        <FormField
          name="diagnosis"
          label="技師診斷"
          multiline
          rows={2}
          defaultValue={workOrder?.diagnosis ?? ""}
          placeholder="例：火星塞老化、煞車片磨損低於下限..."
        />
        <FormField
          name="work_summary"
          label="施作摘要"
          multiline
          rows={2}
          defaultValue={workOrder?.work_summary ?? ""}
          placeholder="例：更換 4 顆火星塞、前後煞車片更換..."
        />
      </section>

      {/* 項目（料 + 工 + 外包 + 折扣） */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            工單項目（{items.length} 行）
          </h3>
          <button
            type="button"
            onClick={addItem}
            className="text-[13px] font-semibold text-[#0052CC] hover:text-[#0747A6]"
          >
            + 新增項目
          </button>
        </div>

        {items.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-[#DFE1E6] rounded-md text-[13px] text-[#6B778C]">
            尚無項目，點右上「+ 新增項目」開始建立
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#DFE1E6] rounded-md">
            <table className="w-full text-[13px]">
              <thead className="bg-[#F4F5F7] text-[11px] uppercase tracking-wide text-[#42526E]">
                <tr>
                  <th className="px-2 py-2 text-left w-16">#</th>
                  <th className="px-2 py-2 text-left w-20">類型</th>
                  <th className="px-2 py-2 text-left">說明</th>
                  <th className="px-2 py-2 text-right w-20">數量</th>
                  <th className="px-2 py-2 text-right w-24">單價</th>
                  <th className="px-2 py-2 text-right w-28">小計</th>
                  <th className="px-2 py-2 text-center w-12"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, idx) => (
                  <tr key={idx} className="border-t border-[#F4F5F7]">
                    <td className="px-2 py-2 align-top text-[#6B778C] font-mono">{it.line_no}</td>
                    <td className="px-2 py-2 align-top">
                      <select
                        value={it.kind}
                        onChange={(e) =>
                          updateItem(idx, { kind: e.target.value as WorkOrderItemDraft["kind"] })
                        }
                        className="w-full px-1 py-1 bg-white border border-[#DFE1E6] rounded text-[13px]"
                      >
                        {KIND_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-2 align-top space-y-1">
                      <input
                        value={it.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        placeholder={
                          it.kind === "parts"
                            ? "例：火星塞 NGK CR9EIA-9"
                            : it.kind === "labor"
                              ? "例：更換火星塞工資"
                              : it.kind === "external"
                                ? "例：拋光外包"
                                : "例：常客折扣 -10%"
                        }
                        className="w-full px-2 py-1 bg-white border border-[#DFE1E6] rounded text-[13px]"
                      />
                      {it.kind === "parts" && (
                        <select
                          value={it.item_id ?? ""}
                          onChange={(e) =>
                            updateItem(idx, { item_id: e.target.value || null })
                          }
                          className="w-full px-1 py-0.5 bg-[#F4F5F7] border border-transparent rounded text-[11px] text-[#42526E]"
                        >
                          <option value="">（不連結料號）</option>
                          {parts.slice(0, 100).map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.code} {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {it.kind === "labor" && (
                        <select
                          value={it.technician_id ?? ""}
                          onChange={(e) =>
                            updateItem(idx, { technician_id: e.target.value || null })
                          }
                          className="w-full px-1 py-0.5 bg-[#F4F5F7] border border-transparent rounded text-[11px] text-[#42526E]"
                        >
                          <option value="">（未指定技師）</option>
                          {technicians.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name} {t.emp_code ? `(${t.emp_code})` : ""}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="number"
                        step="0.01"
                        value={it.qty}
                        onChange={(e) =>
                          updateItem(idx, { qty: Number(e.target.value) || 0 })
                        }
                        className="w-full px-2 py-1 text-right bg-white border border-[#DFE1E6] rounded text-[13px]"
                      />
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="number"
                        step="0.01"
                        value={it.unit_price}
                        onChange={(e) => {
                          const v = Number(e.target.value) || 0;
                          if (it.kind === "discount") {
                            // discount 直接吃 amount
                            updateItem(idx, { unit_price: v, amount: v });
                          } else {
                            updateItem(idx, { unit_price: v });
                          }
                        }}
                        className="w-full px-2 py-1 text-right bg-white border border-[#DFE1E6] rounded text-[13px]"
                      />
                    </td>
                    <td className="px-2 py-2 align-top text-right font-mono text-[#172B4D]">
                      {NT(it.amount)}
                    </td>
                    <td className="px-2 py-2 align-top text-center">
                      <button
                        type="button"
                        onClick={() => removeItem(idx)}
                        className="text-[#BF2600] hover:text-[#A12500] text-[16px] leading-none"
                        aria-label={`刪除第 ${it.line_no} 行`}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-[#FAFBFC] text-[13px]">
                <tr className="border-t border-[#DFE1E6]">
                  <td colSpan={5} className="px-2 py-1.5 text-right text-[#42526E]">料</td>
                  <td className="px-2 py-1.5 text-right font-mono">{NT(partsTotal)}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={5} className="px-2 py-1.5 text-right text-[#42526E]">工</td>
                  <td className="px-2 py-1.5 text-right font-mono">{NT(laborTotal)}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={5} className="px-2 py-1.5 text-right text-[#42526E]">外包</td>
                  <td className="px-2 py-1.5 text-right font-mono">{NT(externalTotal)}</td>
                  <td />
                </tr>
                <tr>
                  <td colSpan={5} className="px-2 py-1.5 text-right text-[#42526E]">折扣</td>
                  <td className="px-2 py-1.5 text-right font-mono text-[#BF2600]">
                    {NT(discountTotal)}
                  </td>
                  <td />
                </tr>
                <tr className="border-t border-[#DFE1E6] font-bold text-[14px]">
                  <td colSpan={5} className="px-2 py-2 text-right">總計</td>
                  <td className="px-2 py-2 text-right font-mono">{NT(total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <FormField
        name="notes"
        label="備註"
        multiline
        rows={2}
        defaultValue={workOrder?.notes ?? ""}
      />

      <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
        <SubmitButton
          idleLabel={submitIdle}
          pendingLabel={submitPending}
          pending={isPending}
        />
        <Link
          href="/admin/master-data/work-orders"
          className="px-5 py-2 text-[14px] text-[#42526E] hover:text-[#172B4D]"
        >
          取消
        </Link>
      </div>

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

/**
 * 監聽 customer_id hidden input 變化，告訴 parent 過濾車輛 dropdown。
 * Combobox 用 hidden input + React state 寫值，但 React state 不觸發 DOM mutation。
 * 用 250ms polling 簡單可靠（form 生命週期短，不擔心開銷）。
 */
function CustomerWatcher({ onChange }: { onChange: (id: string) => void }) {
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>(
      'input[type="hidden"][name="customer_id"]',
    );
    if (!input) return;
    let prev = input.value;
    if (prev) onChange(prev);
    const t = setInterval(() => {
      if (input.value !== prev) {
        prev = input.value;
        onChange(input.value);
      }
    }, 250);
    return () => clearInterval(t);
  }, [onChange]);
  return null;
}
