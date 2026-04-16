import type { ReactNode } from "react";

export function Card({
  title,
  subtitle,
  action,
  icon,
  children,
  className = "",
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  icon?: string;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`bg-white rounded-2xl shadow-sm border border-slate-200/70 ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {icon && (
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                <span className="material-symbols-outlined text-indigo-600 text-[20px]">
                  {icon}
                </span>
              </div>
            )}
            <div>
              {title && <h3 className="font-display font-bold text-slate-900 text-base leading-tight">{title}</h3>}
              {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export function KpiCard({
  label,
  value,
  icon,
  tone = "indigo",
  delta,
  deltaTone = "positive",
  subtitle,
}: {
  label: string;
  value: ReactNode;
  icon?: string;
  tone?: "indigo" | "emerald" | "rose" | "amber" | "sky" | "slate";
  delta?: string;
  deltaTone?: "positive" | "negative" | "neutral";
  subtitle?: string;
}) {
  const toneMap: Record<string, { bg: string; text: string }> = {
    indigo: { bg: "bg-indigo-50", text: "text-indigo-600" },
    emerald: { bg: "bg-emerald-50", text: "text-emerald-600" },
    rose: { bg: "bg-rose-50", text: "text-rose-600" },
    amber: { bg: "bg-amber-50", text: "text-amber-600" },
    sky: { bg: "bg-sky-50", text: "text-sky-600" },
    slate: { bg: "bg-slate-100", text: "text-slate-700" },
  };
  const { bg, text } = toneMap[tone];
  const deltaColor =
    deltaTone === "positive"
      ? "text-emerald-600"
      : deltaTone === "negative"
        ? "text-rose-600"
        : "text-slate-500";
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 shadow-sm p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium mb-1.5">{label}</p>
          <div className="text-2xl font-extrabold font-display text-slate-900">{value}</div>
          {subtitle && <p className="text-[11px] text-slate-400 mt-1">{subtitle}</p>}
        </div>
        {icon && (
          <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
            <span className={`material-symbols-outlined text-[20px] ${text}`}>{icon}</span>
          </div>
        )}
      </div>
      {delta && (
        <div className={`mt-3 text-xs font-medium flex items-center gap-1 ${deltaColor}`}>
          <span className="material-symbols-outlined text-[14px]">
            {deltaTone === "positive" ? "trending_up" : deltaTone === "negative" ? "trending_down" : "trending_flat"}
          </span>
          {delta}
        </div>
      )}
    </div>
  );
}
