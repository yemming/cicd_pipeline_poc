"use client";

/**
 * Handcard v8 Sub Bar — 身份標籤 + 5 step 進度 + RS / 卡號。
 *
 * 規格：RS01_電子手卡_v8.html L385-405
 *
 * 5 個進度 dot 跟「3 route」不是 1-1 對應：
 *   - 1 接待建檔 / 2 意向確認 → counter
 *   - 3 試駕/鑑價            → consultant
 *   - 4 報價追蹤 / 5 成交交車 → closing
 *
 * 視 currentStage 高亮對應 dot。
 */

import { IDENTITY_LABELS } from "@/domain/handcard-suggestions";
import { useHandcard } from "@/lib/handcard-store";

const STEPS = [
  { num: 1, label: "接待建檔" },
  { num: 2, label: "意向確認" },
  { num: 3, label: "試駕/鑑價" },
  { num: 4, label: "報價追蹤" },
  { num: 5, label: "成交交車" },
];

export function HandcardV8SubBar({ currentStage }: { currentStage: 1 | 2 | 3 | 4 | 5 }) {
  const { state } = useHandcard();
  const identityLabel = state.identity ? IDENTITY_LABELS[state.identity] : "— 尚未選擇 —";
  const cardNo = state.cardNo || "—";
  const rs = state.receptionStaff || "—";

  return (
    <div
      className="bg-white border-b border-[#EEECE6] px-6 py-3 flex items-center gap-4 text-[12px] flex-wrap"
      data-testid="handcard-v8-sub-bar"
    >
      <span className="text-[#9A9890]">身份</span>
      <span
        className={`px-2 py-0.5 rounded text-[11.5px] font-medium ${
          state.identity
            ? "bg-[#EAF4FB] text-[#185FA5]"
            : "bg-[#F2F2F2] text-[#6B6A68]"
        }`}
        data-testid="handcard-identity-tag"
      >
        {identityLabel}
      </span>
      <span className="w-px h-4 bg-[#EEECE6]" />
      <div className="flex items-center gap-1.5">
        {STEPS.map((s, idx) => {
          const done = s.num < currentStage;
          const active = s.num === currentStage;
          return (
            <div key={s.num} className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10.5px] font-semibold ${
                  active
                    ? "bg-[#1A3A5C] text-white"
                    : done
                      ? "bg-[#0F6E56] text-white"
                      : "bg-[#F2F2F2] text-[#9A9890]"
                }`}
              >
                {done ? "✓" : s.num}
              </span>
              <span
                className={`${
                  active
                    ? "font-semibold text-[#2C2C2A]"
                    : done
                      ? "text-[#3B6D11]"
                      : "text-[#9A9890]"
                }`}
              >
                {s.label}
              </span>
              {idx < STEPS.length - 1 && <span className="text-[#D5D3CB]">›</span>}
            </div>
          );
        })}
      </div>
      <span className="w-px h-4 bg-[#EEECE6]" />
      <span className="text-[#9A9890]">RS：<b className="text-[#1A3A5C]">{rs}</b></span>
      <span className="ml-auto text-[#9A9890]">
        手卡編號 <span className="font-mono font-semibold text-[#2C2C2A]">{cardNo}</span>
      </span>
    </div>
  );
}
