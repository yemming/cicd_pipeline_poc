"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  saveSerialTrackingRules,
  type BusinessRuleRow,
  type SerialTrackingConfig,
  type SerialTrackingRuleInput,
} from "@/domain/rules";

import { SerialTracePanel } from "./serial-trace-panel";

const TONE_PALETTE: Record<
  SerialTrackingConfig["tone"],
  { bg: string; border: string; titleColor: string }
> = {
  red: { bg: "bg-[#FDECEA]", border: "border-[#F5AEAD]", titleColor: "text-[#CC0000]" },
  amber: { bg: "bg-[#FDF3E3]", border: "border-[#FAC775]", titleColor: "text-[#854F0B]" },
  neutral: { bg: "bg-[#F8F7F4]", border: "border-[#EEECE6]", titleColor: "text-[#2C2C2A]" },
};

type FormRow = {
  id: string;
  config: SerialTrackingConfig;
};

function toFormRow(rule: BusinessRuleRow): FormRow {
  const cfg = (rule.config ?? {}) as Partial<SerialTrackingConfig>;
  return {
    id: rule.id,
    config: {
      item_class: cfg.item_class ?? "C",
      required: cfg.required ?? false,
      by_category: cfg.by_category,
      label: cfg.label ?? "—",
      description: cfg.description ?? "",
      tone: cfg.tone ?? "neutral",
    },
  };
}

export function SerialBoard({
  rules,
  canEdit,
  sprintLabel = "Phase 2",
  caption = "設定哪些備件需要序列號追蹤・序列號軌跡查詢",
}: {
  rules: BusinessRuleRow[];
  canEdit: boolean;
  sprintLabel?: string;
  caption?: string;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<FormRow[]>(() => rules.map(toFormRow));
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateConfig(id: string, patch: Partial<SerialTrackingConfig>) {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, config: { ...r.config, ...patch } } : r)),
    );
  }

  function handleSave() {
    if (!canEdit) return;
    const inputs: SerialTrackingRuleInput[] = rows.map((r) => ({
      id: r.id,
      config: r.config,
    }));
    startTransition(async () => {
      const res = await saveSerialTrackingRules(inputs);
      if (res.ok) {
        setBanner({ ok: true, msg: `✓ 已儲存 ${res.data.saved} 筆規則` });
        router.refresh();
        setTimeout(() => setBanner(null), 2200);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">序列號 / 批號追蹤設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {sprintLabel}
        </span>
        <span className="text-[12px] text-[#9A9890]">{caption}</span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 左：追蹤規則 */}
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
            isPending ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">追蹤規則設定</h2>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canEdit || isPending}
              title={canEdit ? "儲存規則變更" : "沒有編輯權限"}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? "儲存中⋯" : "儲存"}
            </button>
          </header>
          <div className="px-4 py-3 flex flex-col gap-2.5">
            {rows.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] text-center py-6">尚無設定</div>
            ) : (
              rows.map((row) => {
                const palette = TONE_PALETTE[row.config.tone];
                const isA = row.config.item_class === "A";
                const checked = row.config.required || !!row.config.by_category;
                return (
                  <div
                    key={row.id}
                    className={`px-3 py-2.5 rounded-md border ${palette.bg} ${palette.border}`}
                  >
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <input
                        type="text"
                        value={row.config.label}
                        onChange={(e) => updateConfig(row.id, { label: e.target.value })}
                        disabled={!canEdit}
                        className={`flex-1 text-[12.5px] font-semibold bg-transparent border border-transparent focus:border-[#185FA5] rounded px-1 -mx-1 outline-none ${palette.titleColor} disabled:bg-transparent`}
                      />
                      <label className="text-[12px] text-[#5A5955] flex items-center gap-1.5 shrink-0 whitespace-nowrap">
                        {isA ? (
                          <>
                            <input type="checkbox" checked readOnly disabled />
                            強制序列號（鎖定）
                          </>
                        ) : (
                          <>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={!canEdit}
                              onChange={(e) => {
                                const on = e.target.checked;
                                if (on) {
                                  updateConfig(row.id, { required: false, by_category: true });
                                } else {
                                  updateConfig(row.id, { required: false, by_category: false });
                                }
                              }}
                            />
                            {checked ? "部分品類啟用" : "不追蹤（預設）"}
                          </>
                        )}
                      </label>
                    </div>
                    <textarea
                      value={row.config.description}
                      onChange={(e) => updateConfig(row.id, { description: e.target.value })}
                      disabled={!canEdit}
                      rows={2}
                      className="w-full text-[12px] text-[#5A5955] bg-transparent border border-transparent focus:border-[#185FA5] rounded px-1 -mx-1 outline-none resize-none disabled:bg-transparent"
                    />
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 右：序列號查詢 */}
        <SerialTracePanel />
      </div>
      <div className="text-[11px] text-[#9A9890]">
        💡 規則來源：business_rules (rule_kind=serial_tracking)。A 類 required=true 鎖定不可解；B/C 類可切換是否啟用追蹤。
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
    </main>
  );
}
