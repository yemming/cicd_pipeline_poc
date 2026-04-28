"use client";

import { ReactNode } from "react";

type Tone = "red" | "orange" | "amber" | "green" | "teal" | "blue" | "violet";

const TONE_BG: Record<Tone, string> = {
  red: "bg-red-700",
  orange: "bg-orange-600",
  amber: "bg-amber-600",
  green: "bg-emerald-600",
  teal: "bg-teal-600",
  blue: "bg-blue-700",
  violet: "bg-violet-700",
};

/** 紅色橫條 section header — 模仿紙本工單分區的視覺強度 */
export function SectionHeader({
  title,
  subtitle,
  tone = "red",
  number,
}: {
  title: string;
  subtitle?: string;
  tone?: Tone;
  number?: string;
}) {
  return (
    <div className={`${TONE_BG[tone]} text-white px-4 py-2.5 rounded-md shadow-sm flex items-center gap-3`}>
      {number && (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/15 text-white font-bold text-sm font-mono">
          {number}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm tracking-wide truncate">{title}</div>
        {subtitle && <div className="text-[11px] text-white/80 truncate">{subtitle}</div>}
      </div>
    </div>
  );
}

/** 平鋪 label/value 欄位（單行） */
export function FormField({
  label,
  value,
  placeholder = "—",
  className = "",
}: {
  label: string;
  value?: ReactNode;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={`flex items-stretch min-w-0 ${className}`}>
      <span className="shrink-0 w-28 px-3 py-2 text-[12px] font-medium text-slate-600 bg-slate-100 rounded-l-md border border-slate-200 border-r-0 flex items-center">
        {label}
      </span>
      <span className="flex-1 min-w-0 px-3 py-2 text-[13px] text-slate-800 bg-white border border-slate-200 rounded-r-md truncate">
        {value || <span className="text-slate-300">{placeholder}</span>}
      </span>
    </label>
  );
}

/** Checkbox 列表（紙本上的 □ 項目） */
export function CheckItem({
  label,
  checked = false,
  size = "sm",
}: {
  label: string;
  checked?: boolean;
  size?: "sm" | "md";
}) {
  const boxCls =
    size === "md"
      ? "w-4 h-4 border-[1.5px]"
      : "w-3.5 h-3.5 border";
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-700 whitespace-nowrap">
      <span
        className={`${boxCls} rounded-sm border-slate-400 inline-flex items-center justify-center shrink-0 ${
          checked ? "bg-slate-700" : "bg-white"
        }`}
      >
        {checked && (
          <span className="material-symbols-outlined text-white" style={{ fontSize: 11 }}>
            check
          </span>
        )}
      </span>
      <span>{label}</span>
    </span>
  );
}

/** 🟢🟡🔴 三色狀態評估（紙本：「🟢正常 🟡注意 🔴需修」） */
export function TrafficLight({
  selected,
}: {
  selected?: "green" | "amber" | "red" | null;
}) {
  const opt = (val: "green" | "amber" | "red", emoji: string, text: string, ringCls: string) => (
    <button
      type="button"
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium inline-flex items-center gap-1 transition ${
        selected === val
          ? `${ringCls} text-white`
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-slate-300"
      }`}
    >
      <span style={{ fontSize: 10 }}>{emoji}</span>
      <span>{text}</span>
    </button>
  );
  return (
    <div className="inline-flex items-center gap-1">
      {opt("green", "🟢", "正常", "bg-emerald-600")}
      {opt("amber", "🟡", "注意", "bg-amber-500")}
      {opt("red", "🔴", "需修", "bg-rose-600")}
    </div>
  );
}

/** 簽名格 — 預留簽名 + 日期/時間 */
export function SignatureBox({
  role,
  hint,
  date,
  time,
}: {
  role: string;
  hint?: string;
  date?: string;
  time?: string;
}) {
  return (
    <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-slate-50/40">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
        {role}
      </div>
      <div className="h-12 border-b border-slate-300 mb-2" />
      {hint && <div className="text-[10px] text-slate-400 mb-2 italic">{hint}</div>}
      <div className="flex gap-3 text-[11px] text-slate-500">
        <span>日期：{date || "____________"}</span>
        <span>時間：{time || "________"}</span>
      </div>
    </div>
  );
}

/** 一行說明文字（粗體框 + 警示色） */
export function NoticeBar({
  children,
  tone = "amber",
}: {
  children: ReactNode;
  tone?: "amber" | "rose" | "blue" | "slate";
}) {
  const cls: Record<typeof tone, string> = {
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    rose: "bg-rose-50 border-rose-200 text-rose-900",
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };
  return (
    <div className={`text-[12px] border ${cls[tone]} rounded-md px-3 py-2 leading-relaxed`}>
      {children}
    </div>
  );
}
