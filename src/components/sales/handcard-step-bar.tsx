"use client";

import type { HandcardIdentity } from "@/domain/sales-handcards.constants";
import { HANDCARD_IDENTITY_CARDS } from "@/domain/handcard-tag-dictionary";

export type StepStatus = "done" | "active" | "todo";

export type WizardStep = {
  key: string;
  label: string;
  status: StepStatus;
};

const IDENTITY_BADGE_COLOR: Record<HandcardIdentity, { bg: string; fg: string }> = {
  new: { bg: "#EAF3DE", fg: "#3B6D11" },
  revisit: { bg: "#EAF4FB", fg: "#185FA5" },
  owner: { bg: "#FDF3E3", fg: "#854F0B" },
  switcher: { bg: "#FDECEA", fg: "#CC0000" },
};

function dotClasses(status: StepStatus): string {
  switch (status) {
    case "done":
      return "bg-[#3B6D11] text-white border-[#3B6D11]";
    case "active":
      return "bg-[#1A3A5C] text-white border-[#1A3A5C] ring-2 ring-[#1A3A5C]/30";
    default:
      return "bg-white text-[#9A9890] border-[#D5D3CB]";
  }
}

function labelClass(status: StepStatus): string {
  switch (status) {
    case "done":
      return "text-[#3B6D11] font-medium";
    case "active":
      return "text-[#1A3A5C] font-semibold";
    default:
      return "text-[#9A9890]";
  }
}

export function HandcardStepBar({
  identity,
  steps,
  rsName,
  cardNo,
}: {
  identity: HandcardIdentity | null;
  steps: WizardStep[];
  rsName: string | null;
  cardNo: string | null;
}) {
  const idBadge = identity ? HANDCARD_IDENTITY_CARDS.find((c) => c.key === identity) : null;
  const idColor = identity ? IDENTITY_BADGE_COLOR[identity] : null;

  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
      {/* 左：身份標籤 */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-[#9A9890]">身份</span>
        {idBadge && idColor ? (
          <span
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11.5px] font-medium"
            style={{ backgroundColor: idColor.bg, color: idColor.fg }}
          >
            <span>{idBadge.emoji}</span>
            <span>{idBadge.label}</span>
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#F2F2F2] text-[#9A9890]">
            未選擇
          </span>
        )}
      </div>

      {/* 中：5 步進度條 */}
      <div className="flex items-center gap-1 flex-1 min-w-[400px] justify-center">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <div
              className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full border text-[11px] font-semibold transition ${dotClasses(s.status)}`}
              title={s.label}
            >
              {s.status === "done" ? "✓" : i + 1}
            </div>
            <span className={`text-[12px] ${labelClass(s.status)} whitespace-nowrap`}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span className="w-4 h-px bg-[#D5D3CB] mx-1" aria-hidden />
            )}
          </div>
        ))}
      </div>

      {/* 右：RS + 卡號 */}
      <div className="flex items-center gap-3 text-[11.5px] text-[#5A5955]">
        {rsName && (
          <span>
            RS：<b className="text-[#2C2C2A]">{rsName}</b>
          </span>
        )}
        {cardNo && (
          <span className="font-mono text-[#9A9890]">{cardNo}</span>
        )}
      </div>
    </div>
  );
}
