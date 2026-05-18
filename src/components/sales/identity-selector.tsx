"use client";

import {
  HANDCARD_IDENTITY_CARDS,
  type HandcardIdentityDef,
} from "@/domain/handcard-tag-dictionary";
import type { HandcardIdentity } from "@/domain/sales-handcards.constants";

export function IdentitySelector({
  value,
  onChange,
  editable,
}: {
  value: HandcardIdentity | null;
  onChange?: (next: HandcardIdentity | null) => void;
  editable: boolean;
}) {
  function clickCard(card: HandcardIdentityDef) {
    if (!editable || !onChange) return;
    onChange(value === card.key ? null : card.key);
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {HANDCARD_IDENTITY_CARDS.map((card) => {
        const selected = value === card.key;
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => clickCard(card)}
            disabled={!editable}
            className={`relative text-left rounded-lg border-2 px-3 py-2.5 transition flex flex-col gap-0.5 ${
              selected
                ? "bg-white shadow-sm"
                : editable
                  ? "bg-white border-[#EEECE6] hover:border-[#D5D3CB]"
                  : "bg-[#F8F7F4] border-[#EEECE6] opacity-80"
            } ${!editable && selected ? "opacity-100" : ""}`}
            style={selected ? { borderColor: card.accent } : undefined}
            aria-pressed={selected}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-[16px] leading-none">{card.emoji}</span>
              <span
                className="text-[13px] font-semibold"
                style={{ color: selected ? card.accent : "#2C2C2A" }}
              >
                {card.label}
              </span>
              {selected && (
                <span
                  className="ml-auto inline-flex items-center justify-center w-[18px] h-[18px] rounded-full text-white text-[11px]"
                  style={{ background: card.accent }}
                  aria-hidden
                >
                  ✓
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#5A5955] leading-tight whitespace-pre-line">
              {card.hint}
            </div>
          </button>
        );
      })}
    </div>
  );
}
