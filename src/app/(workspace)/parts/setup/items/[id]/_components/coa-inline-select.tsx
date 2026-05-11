"use client";

import { useMemo, useState } from "react";

export type CoaOption = {
  id: string;
  account_code: string;
  name_zh_tw: string;
};

export function CoaInlineSelect({
  current,
  options,
  editable,
  pending,
  onChange,
}: {
  current: CoaOption | null;
  options: CoaOption[];
  editable: boolean;
  pending: boolean;
  onChange: (coaId: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return options;
    return options.filter(
      (o) =>
        o.account_code.toLowerCase().includes(t) ||
        o.name_zh_tw.toLowerCase().includes(t),
    );
  }, [options, search]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          if (!editable || pending) return;
          setSearch("");
          setOpen(true);
        }}
        disabled={!editable || pending}
        className={`inline-flex items-center gap-1 text-left text-[12.5px] ${
          editable && !pending
            ? "cursor-pointer hover:bg-[#F8F7F4] rounded px-1 -mx-1"
            : "cursor-default"
        } ${pending ? "opacity-60" : ""}`}
      >
        {pending ? (
          <span className="text-[#9A9890]">儲存中⋯</span>
        ) : current ? (
          <>
            <span className="font-mono font-semibold text-[#1A3A5C]">
              {current.account_code}
            </span>
            <span className="text-[#5A5955]">— {current.name_zh_tw}</span>
          </>
        ) : (
          <span className="text-[#9A9890]">未設定</span>
        )}
      </button>
    );
  }

  return (
    <div className="relative">
      <input
        type="text"
        autoFocus
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="輸入代碼或名稱搜尋…"
        onBlur={() => setTimeout(() => setOpen(false), 180)}
        className="h-[28px] border border-[#185FA5] rounded px-2 text-[12.5px] bg-white outline-none w-full"
      />
      <div className="absolute top-full left-0 right-0 mt-0.5 max-h-[280px] overflow-y-auto bg-white border border-[#D5D3CB] rounded shadow-lg z-50">
        {filtered.length === 0 ? (
          <div className="px-3 py-2 text-[12px] text-[#9A9890]">無符合科目</div>
        ) : (
          <>
            {filtered.slice(0, 50).map((o) => (
              <button
                key={o.id}
                type="button"
                onMouseDown={async (e) => {
                  e.preventDefault();
                  setOpen(false);
                  await onChange(o.id);
                }}
                className="block w-full text-left px-3 py-1.5 hover:bg-[#F8F7F4] text-[12.5px]"
              >
                <span className="font-mono font-semibold text-[#1A3A5C]">
                  {o.account_code}
                </span>
                <span className="text-[#5A5955]"> — {o.name_zh_tw}</span>
              </button>
            ))}
            {filtered.length > 50 ? (
              <div className="px-3 py-1 text-[11px] text-[#9A9890] border-t border-[#EEECE6]">
                （另 {filtered.length - 50} 筆未顯示，請輸入更精確的關鍵字）
              </div>
            ) : null}
          </>
        )}
        {current ? (
          <button
            type="button"
            onMouseDown={async (e) => {
              e.preventDefault();
              setOpen(false);
              await onChange(null);
            }}
            className="block w-full text-left px-3 py-1.5 border-t border-[#EEECE6] text-[12px] text-[#CC0000] hover:bg-[#FDECEA]"
          >
            ✕ 清除設定
          </button>
        ) : null}
      </div>
    </div>
  );
}
