"use client";

/**
 * DamageDisputeSection — 損傷紀錄與客戶異議記錄區塊（B2-01）
 *
 * 顯示已標記損傷列表（state === 2 的 checks），每筆可展開填寫異議類型 + 客戶原話，
 * 儲存走 addDamageDisputeAction（append-only，不可逆）。
 *
 * 已儲存的異議記錄顯示「✅ 已記錄（不可修改）」唯讀狀態。
 */

import { useTransition, useState } from "react";
import { addDamageDisputeAction } from "@/lib/aftersales/damage-dispute-actions";
import { DISPUTE_TYPE_LABEL, type DamageDispute, type DamageDisputeType } from "@/domain/damage-disputes.constants";
import type { CheckRow } from "@/domain/pre-inspections.constants";

type Props = {
  piId: string;
  vehicleId?: string | null;
  checks: CheckRow[];
  existingDisputes: DamageDispute[];
  locked: boolean;
};

type DisputeDraft = {
  disputeType: DamageDisputeType;
  customerWords: string;
};

export function DamageDisputeSection({
  piId,
  vehicleId,
  checks,
  existingDisputes,
  locked,
}: Props) {
  // 只顯示已標記損傷（state === 2）的項目
  const damageItems = checks
    .map((c, i) => ({ ...c, idx: i }))
    .filter((c) => c.state === 2);

  // 展開哪一筆的異議表單（label as key）
  const [expandedLabel, setExpandedLabel] = useState<string | null>(null);
  // 每個 label 的草稿
  const [drafts, setDrafts] = useState<Record<string, DisputeDraft>>({});
  // 每個 label 的儲存中狀態
  const [isPending, startTransition] = useTransition();
  const [savingLabel, setSavingLabel] = useState<string | null>(null);
  // inline 回饋訊息
  const [feedbacks, setFeedbacks] = useState<Record<string, { ok: boolean; msg: string }>>({});

  // 已記錄的 label Set（同一 label 最多一筆，儲存後不可再展開）
  const savedLabels = new Set(existingDisputes.map((d) => d.damageLabel));

  if (damageItems.length === 0) {
    return null; // 沒有損傷項目時不顯示此區塊
  }

  function getDraft(label: string): DisputeDraft {
    return drafts[label] ?? { disputeType: "existing_damage", customerWords: "" };
  }

  function patchDraft(label: string, patch: Partial<DisputeDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [label]: { ...getDraft(label), ...patch },
    }));
  }

  function handleSave(damageLabel: string) {
    const draft = getDraft(damageLabel);
    if (!draft.customerWords.trim()) {
      setFeedbacks((prev) => ({
        ...prev,
        [damageLabel]: { ok: false, msg: "請填寫客戶原話" },
      }));
      return;
    }
    setSavingLabel(damageLabel);
    startTransition(async () => {
      const res = await addDamageDisputeAction({
        pre_inspection_id: piId,
        vehicle_id: vehicleId ?? null,
        dispute_type: draft.disputeType,
        damage_label: damageLabel,
        customer_words: draft.customerWords.trim(),
      });
      setSavingLabel(null);
      if (res.ok) {
        setFeedbacks((prev) => ({
          ...prev,
          [damageLabel]: { ok: true, msg: "✅ 已不可逆記錄（稽核存證 7 年）" },
        }));
        setExpandedLabel(null);
      } else {
        setFeedbacks((prev) => ({
          ...prev,
          [damageLabel]: { ok: false, msg: res.error },
        }));
      }
    });
  }

  return (
    <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 損傷紀錄與客戶異議</h2>
        <span className="text-[11px] text-[#9A9890]">
          （已標記損傷 {damageItems.length} 項，異議記錄不可逆）
        </span>
      </header>
      <div className="px-4 py-3 space-y-2">
        {/* 不可逆警告 */}
        <div className="px-3 py-2 bg-[#FAEEDA] border border-[#BA7517] rounded text-[11.5px] text-[#412402]">
          ⚠️ 儲存異議記錄後<strong>不可修改或刪除</strong>，永久寫入稽核日誌（保存 7 年）。請確認客戶原話已逐字記錄。
        </div>

        {/* 已有的異議記錄（唯讀） */}
        {existingDisputes.length > 0 && (
          <div className="space-y-1.5">
            {existingDisputes.map((d) => (
              <div
                key={d.id}
                className="flex flex-col gap-1 px-3 py-2.5 border border-[#C5DC9F] bg-[#EAF3DE] rounded"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-[#3B6D11]">
                    ✅ {d.damageLabel} — {DISPUTE_TYPE_LABEL[d.disputeType]}
                  </span>
                  <span className="text-[10.5px] text-[#6B6A68]">
                    {d.authorName ?? "—"}・{d.createdAt.slice(0, 10)}
                  </span>
                </div>
                <div className="text-[12px] text-[#2C2C2A] leading-relaxed">
                  「{d.customerWords}」
                </div>
                <div className="text-[10.5px] text-[#9A9890]">不可修改（稽核存證）</div>
              </div>
            ))}
          </div>
        )}

        {/* 損傷項目列表 */}
        {damageItems.map((c) => {
          const isSaved = savedLabels.has(c.label);
          const isExpanded = expandedLabel === c.label;
          const isSavingThis = savingLabel === c.label;
          const draft = getDraft(c.label);
          const fb = feedbacks[c.label];

          return (
            <div
              key={c.label}
              className={`border rounded ${isSaved ? "border-[#C5DC9F] bg-[#F6FCF0]" : "border-[#EEECE6] bg-white"}`}
            >
              {/* 列頭 */}
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-[12.5px] font-medium text-[#2C2C2A]">
                  🔴 {c.label}
                </span>
                {isSaved ? (
                  <span className="text-[11px] text-[#3B6D11] font-medium">✅ 已記錄</span>
                ) : !locked ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedLabel(isExpanded ? null : c.label)
                    }
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] border border-[#D5D3CB] text-[#5A5955] bg-white hover:border-[#9A9890] disabled:opacity-60"
                  >
                    {isExpanded ? "收起" : "+ 客戶有異議"}
                  </button>
                ) : null}
              </div>

              {/* 展開的異議表單 */}
              {isExpanded && !isSaved && (
                <div
                  className={`px-3 pb-3 space-y-2 border-t border-[#F2F2F2] ${isSavingThis ? "opacity-60 pointer-events-none" : ""}`}
                >
                  {/* 異議類型 */}
                  <div className="flex flex-col gap-1 pt-2">
                    <label className="text-[11px] text-[#9A9890] font-medium">異議類型</label>
                    <select
                      value={draft.disputeType}
                      onChange={(e) =>
                        patchDraft(c.label, { disputeType: e.target.value as DamageDisputeType })
                      }
                      className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] bg-white focus:border-[#185FA5] outline-none"
                    >
                      {(Object.keys(DISPUTE_TYPE_LABEL) as DamageDisputeType[]).map((t) => (
                        <option key={t} value={t}>
                          {DISPUTE_TYPE_LABEL[t]}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 客戶原話 */}
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#9A9890] font-medium">
                      客戶原話（逐字記錄，請勿加入 SA 主觀判斷）
                      <span className="text-[#CC0000] ml-0.5">*</span>
                    </label>
                    <textarea
                      value={draft.customerWords}
                      onChange={(e) => patchDraft(c.label, { customerWords: e.target.value })}
                      rows={3}
                      placeholder="例：我這台車在送來之前這個地方就有刮痕了，不是你們弄的..."
                      className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                    />
                  </div>

                  {/* 回饋訊息 */}
                  {fb && (
                    <div
                      className={`px-2 py-1.5 rounded text-[11.5px] ${fb.ok ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"}`}
                    >
                      {fb.msg}
                    </div>
                  )}

                  {/* 儲存按鈕 */}
                  <div className="flex items-center justify-between">
                    <p className="text-[10.5px] text-[#9A9890]">
                      儲存後不可修改・永久稽核存證
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSave(c.label)}
                      disabled={isSavingThis}
                      className="h-[30px] px-3 rounded text-[12px] font-medium bg-[#CC0000] text-white hover:bg-[#a50000] disabled:opacity-50"
                    >
                      {isSavingThis ? "儲存中⋯" : "儲存異議記錄（不可逆）"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
