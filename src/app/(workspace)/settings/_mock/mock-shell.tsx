"use client";

import { useSetPageHeader, type TopbarBreadcrumb, type TopbarTab } from "@/components/page-header-context";

export function MockShell({
  title,
  breadcrumb,
  tabs,
  children,
}: {
  title: string;
  breadcrumb: TopbarBreadcrumb[];
  tabs?: TopbarTab[];
  children: React.ReactNode;
}) {
  useSetPageHeader({ title, breadcrumb, tabs });
  return (
    <div className="-m-8 p-8 bg-background text-on-surface min-h-[calc(100dvh-4rem)]">
      <div className="max-w-6xl mx-auto space-y-6">{children}</div>
    </div>
  );
}

export function MockCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/10 p-6">
      <header className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-bold font-display text-on-surface">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-on-surface-variant/70">{hint}</span>}
    </label>
  );
}

export function MockInput({
  defaultValue,
  placeholder,
  disabled,
  suffix,
}: {
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full h-10 rounded-lg border border-outline-variant/30 bg-white px-3 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-[#CC0000]/40 disabled:bg-surface-container-low/60 disabled:text-on-surface-variant"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant">
          {suffix}
        </span>
      )}
    </div>
  );
}

export function MockSelect({ value, options }: { value: string; options: string[] }) {
  return (
    <div className="relative">
      <select
        defaultValue={value}
        className="w-full h-10 rounded-lg border border-outline-variant/30 bg-white px-3 pr-8 text-sm text-on-surface appearance-none focus:outline-none focus:ring-2 focus:ring-[#CC0000]/40"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <span className="material-symbols-outlined text-base text-on-surface-variant absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        expand_more
      </span>
    </div>
  );
}

export function MockToggle({ on }: { on?: boolean }) {
  return (
    <div
      className={`w-10 h-6 rounded-full flex items-center px-0.5 transition-colors ${
        on ? "bg-[#CC0000] justify-end" : "bg-outline-variant/50 justify-start"
      }`}
    >
      <div className="w-5 h-5 bg-white rounded-full shadow" />
    </div>
  );
}

export function SaveBar() {
  return (
    <div className="flex justify-end gap-3">
      <button className="h-10 px-5 rounded-lg border border-outline-variant/40 text-sm font-medium text-on-surface hover:bg-surface-container-low">
        取消
      </button>
      <button className="h-10 px-5 rounded-lg bg-[#CC0000] text-white text-sm font-medium hover:bg-[#a80000]">
        儲存設定
      </button>
    </div>
  );
}
