"use client";

import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

export type QuickAddField = {
  key: string;
  label: string;
  required?: boolean;
  placeholder?: string;
};

export type QuickAddCreateResult =
  | { ok: true; value: string; label: string }
  | { ok: false; error: string };

export function QuickAddSelect({
  value,
  onChange,
  options,
  onCreate,
  placeholder = "—",
  fields = [{ key: "label", label: "名稱", required: true }],
  inputClass = "",
  buttonTitle = "新增",
  panelTitle = "新增選項",
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  onCreate: (data: Record<string, string>) => Promise<QuickAddCreateResult>;
  placeholder?: string;
  fields?: QuickAddField[];
  inputClass?: string;
  buttonTitle?: string;
  panelTitle?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Compute fixed position relative to viewport when opening
  useLayoutEffect(() => {
    if (!open || !wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const PANEL_WIDTH = 280;
    const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
    const top = rect.bottom + 4;
    setPos({ top, left });
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      if (!wrapperRef.current) return;
      const rect = wrapperRef.current.getBoundingClientRect();
      const PANEL_WIDTH = 280;
      const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
      setPos({ top: rect.bottom + 4, left });
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open]);

  // Close on outside click (consider both wrapper and popover as "inside")
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideWrapper = wrapperRef.current?.contains(target);
      const insidePopover = popoverRef.current?.contains(target);
      if (!insideWrapper && !insidePopover) {
        setOpen(false);
        setError(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const submit = () => {
    setError(null);
    for (const f of fields) {
      if (f.required && !(draft[f.key] ?? "").trim()) {
        setError(`${f.label}必填`);
        return;
      }
    }
    startTransition(async () => {
      const res = await onCreate(draft);
      if (res.ok) {
        onChange(res.value);
        setDraft({});
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div ref={wrapperRef} className="relative flex gap-1 items-stretch">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`flex-1 min-w-0 ${inputClass}`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title={buttonTitle}
        className="shrink-0 w-[28px] h-[28px] border border-[#D5D3CB] rounded text-[14px] leading-none text-[#5A5955] bg-white hover:border-[#0F6E56] hover:text-[#0F6E56] disabled:opacity-50"
      >
        ＋
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              style={{ position: "fixed", top: pos.top, left: pos.left, width: 280, zIndex: 9999 }}
              className="bg-white border border-[#D5D3CB] rounded-md shadow-xl p-3"
            >
              <div className="text-[11.5px] font-semibold text-[#2C2C2A] mb-2">{panelTitle}</div>
              {fields.map((f) => (
                <div key={f.key} className="mb-2">
                  <label className="text-[10.5px] text-[#9A9890] block mb-0.5">
                    {f.label}
                    {f.required ? " *" : ""}
                  </label>
                  <input
                    value={draft[f.key] ?? ""}
                    onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                    placeholder={f.placeholder}
                    className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] outline-none focus:border-[#185FA5]"
                  />
                </div>
              ))}
              {error ? (
                <div className="text-[11px] text-[#CC0000] bg-[#FDECEA] rounded px-2 py-1 mb-2">
                  {error}
                </div>
              ) : null}
              <div className="flex gap-1.5 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setError(null);
                  }}
                  className="h-[26px] px-2.5 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11px] bg-[#0F6E56] text-white disabled:opacity-60"
                >
                  {isPending ? "建立中…" : "建立"}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
