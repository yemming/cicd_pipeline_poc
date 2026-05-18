"use client";

import {
  HANDCARD_TAG_GROUPS,
  lookupHandcardTag,
} from "@/domain/handcard-tag-dictionary";

export function HandcardChipPool({
  value,
  onChange,
  editable,
}: {
  value: string[];
  onChange?: (next: string[]) => void;
  editable: boolean;
}) {
  const selectedSet = new Set(value);

  function toggle(code: string) {
    if (!editable || !onChange) return;
    const next = selectedSet.has(code)
      ? value.filter((c) => c !== code)
      : [...value, code];
    onChange(next);
  }

  // 編輯模式：全部 4 群都顯示，可點擊勾選
  if (editable) {
    return (
      <div className="space-y-3">
        {HANDCARD_TAG_GROUPS.map((g) => (
          <div key={g.key}>
            <div className="text-[12px] font-semibold text-[#2C2C2A] mb-1.5 flex items-center gap-1">
              <span>{g.emoji}</span>
              <span>{g.title}</span>
              <span className="text-[11px] text-[#9A9890] font-normal">
                （點選切換）
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.tags.map((t) => {
                const active = selectedSet.has(t.code);
                return (
                  <button
                    key={t.code}
                    type="button"
                    onClick={() => toggle(t.code)}
                    className={`inline-flex items-center gap-1 h-[28px] px-2.5 rounded-full text-[11.5px] transition ${
                      active ? g.classActive : g.classChip
                    }`}
                    aria-pressed={active}
                  >
                    <span className={`w-[6px] h-[6px] rounded-full ${g.classDot}`} />
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // View 模式：只顯示已勾選的，按 group 分區
  if (value.length === 0) {
    return (
      <div className="text-[12px] text-[#9A9890]">尚未勾選任何標籤</div>
    );
  }

  const grouped = HANDCARD_TAG_GROUPS.map((g) => ({
    group: g,
    selected: g.tags.filter((t) => selectedSet.has(t.code)),
  })).filter((x) => x.selected.length > 0);

  return (
    <div className="space-y-2">
      {grouped.map(({ group, selected }) => (
        <div key={group.key} className="flex items-start gap-2 flex-wrap">
          <span className="text-[11px] text-[#9A9890] font-medium mt-1">
            {group.emoji} {group.title}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((t) => (
              <span
                key={t.code}
                className={`inline-flex items-center gap-1 h-[24px] px-2 rounded-full text-[11px] ${group.classActive}`}
              >
                <span className={`w-[6px] h-[6px] rounded-full ${group.classDot}`} />
                {t.label}
              </span>
            ))}
          </div>
        </div>
      ))}
      {/* Unknown codes (e.g. retired tags still in DB) */}
      {value
        .filter((c) => !lookupHandcardTag(c))
        .map((c) => (
          <span
            key={c}
            className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] mr-1"
            title="未知或已停用的標籤"
          >
            ? {c}
          </span>
        ))}
    </div>
  );
}
