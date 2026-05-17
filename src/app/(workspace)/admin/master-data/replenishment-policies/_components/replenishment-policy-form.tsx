"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { FormField } from "@/components/forms/form-field";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  createReplenishmentPolicyAction,
  updateReplenishmentPolicyAction,
  type ReplenishmentPolicyInput,
} from "@/lib/master-data/replenishment-policy-actions";
import type {
  ReplenishmentPolicyFieldKey,
  ReplenishmentPolicyRow,
} from "@/lib/master-data/replenishment-policy-form-types";
import type { Warehouse } from "@/lib/parts/types";

const FREQUENCY_OPTIONS = [
  { value: "weekly_mon", label: "每週一" },
  { value: "biweekly", label: "每兩週" },
  { value: "monthly_1", label: "每月一日" },
  { value: "manual", label: "手動觸發" },
];

function strOrNull(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return s.length === 0 ? null : s;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s.length === 0) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

export function ReplenishmentPolicyForm({
  mode,
  policy,
  warehouses,
}: {
  mode: "create" | "edit";
  policy?: ReplenishmentPolicyRow | null;
  warehouses: Warehouse[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ReplenishmentPolicyFieldKey, string>>
  >({});
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const fe = fieldErrors;

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: ReplenishmentPolicyInput = {
      warehouse_id: strOrNull(fd.get("warehouse_id")),
      frequency: (strOrNull(fd.get("frequency")) ?? "weekly_mon") as ReplenishmentPolicyInput["frequency"],
      horizon_days: intOrNull(fd.get("horizon_days")) ?? 7,
      auto_create_pr_for_urgent: fd.get("auto_create_pr_for_urgent") === "on",
      include_forecast: fd.get("include_forecast") === "on",
      notes: strOrNull(fd.get("notes")),
      is_active: mode === "edit" ? fd.get("is_active") === "on" : true,
    };

    startTransition(async () => {
      setError(null);
      setFieldErrors({});
      const res =
        mode === "create"
          ? await createReplenishmentPolicyAction(input)
          : await updateReplenishmentPolicyAction(policy!.id, input);
      if (!res.ok) {
        setError(res.error);
        setFieldErrors(res.fieldErrors ?? {});
        setBanner({ ok: false, msg: res.error });
        return;
      }
      setBanner({
        ok: true,
        msg: mode === "create" ? "✓ 已建立補貨計畫" : "✓ 已儲存",
      });
      if (mode === "create") {
        router.push("/admin/master-data/replenishment-policies");
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
        </div>
      )}

      <fieldset
        disabled={isPending}
        className={isPending ? "pointer-events-none opacity-60 space-y-6" : "space-y-6"}
      >
        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            適用範圍
          </h3>
          <SelectField
            name="warehouse_id"
            label="適用倉庫"
            defaultValue={policy?.warehouse_id ?? ""}
            options={warehouses.map((w) => ({
              value: w.id,
              label: `${w.code} ${w.name}`,
            }))}
            placeholder="（留空＝brand 全域預設）"
            hint="留空代表這是 brand 預設值；指定倉庫則覆蓋全域"
            error={fe.warehouse_id}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            排程與視野
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              name="frequency"
              label="執行頻率"
              required
              defaultValue={policy?.frequency ?? "weekly_mon"}
              options={FREQUENCY_OPTIONS}
              hint="排程目前留 metadata，實際 cron 在 v2 接 pg_cron"
              error={fe.frequency}
            />
            <FormField
              name="horizon_days"
              label="需求視野（天）"
              type="number"
              required
              defaultValue={String(policy?.horizon_days ?? 7)}
              hint="MRP 看未來 N 天的 WO 需料總和"
              error={fe.horizon_days}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-[12px] font-bold uppercase tracking-wide text-[#42526E]">
            自動化開關
          </h3>
          <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
            <input
              type="checkbox"
              name="auto_create_pr_for_urgent"
              defaultChecked={policy?.auto_create_pr_for_urgent ?? false}
              className="w-4 h-4"
            />
            緊急項目自動建立採購申請（PR）— 不等使用者勾選一鍵建單
          </label>
          <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
            <input
              type="checkbox"
              name="include_forecast"
              defaultChecked={policy?.include_forecast ?? false}
              className="w-4 h-4"
            />
            包含預測需求（v2，目前先標旗標、邏輯尚未掛上）
          </label>
        </section>

        <FormField
          name="notes"
          label="備註"
          multiline
          rows={2}
          defaultValue={policy?.notes ?? ""}
          placeholder="例：每週一上午 9 點採購主管 review、五金類延長 horizon 至 14 天…"
        />

        {mode === "edit" && (
          <label className="flex items-center gap-2 text-[13px] text-[#172B4D]">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={policy?.is_active ?? true}
              className="w-4 h-4"
            />
            啟用中
          </label>
        )}

        <div className="flex items-center gap-3 pt-3 border-t border-[#DFE1E6]">
          <SubmitButton
            idleLabel={mode === "create" ? "建立計畫" : "儲存變更"}
            pendingLabel={mode === "create" ? "建立中…" : "儲存中…"}
            pending={isPending}
          />
          <Link
            href="/admin/master-data/replenishment-policies"
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
