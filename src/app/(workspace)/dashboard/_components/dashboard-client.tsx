"use client";

/**
 * Dashboard client shell — 把原本 page.tsx 的 client 邏輯（hooks / tagline / module cards）
 * 整支搬過來，再把 6 個 reminder slot 換成 <ReminderGrid initialReminders />。
 *
 * 真正的數字 + 訂閱資料由 server 側預先撈好，透過 props 傳入。
 */

import Link from "next/link";
import dynamic from "next/dynamic";

import { useNav } from "@/components/nav-provider";
import { useAppearance } from "@/components/appearance-context";
import { useSetPageHeader } from "@/components/page-header-context";
import { useProfile, getGreeting } from "@/lib/use-profile";

import type { ReminderDefinition, ReminderSlots } from "@/domain/reminders.constants";

import ReminderGrid from "./reminder-grid";

const ClockWidget = dynamic(() => import("@/components/clock-widget"), {
  ssr: false,
});

export default function DashboardClient({
  reminders,
  catalog,
}: {
  reminders: ReminderSlots;
  catalog: ReminderDefinition[];
}) {
  useSetPageHeader({ hideSearch: false });
  const profile = useProfile();
  const { modules } = useNav();
  const { dashboardTagline } = useAppearance();
  const taglineRaw = (dashboardTagline ?? "").trim();
  const taglineParts = taglineRaw
    .split(/\s+(?=OFFICIAL\s+DEALER)/i)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div
      className="max-w-6xl mx-auto pt-4"
      data-tagline-raw={taglineRaw}
      data-tagline-len={taglineRaw.length}
    >
      <section className="mb-10">
        {taglineRaw ? (
          <div className="flex items-center gap-4 mb-4 px-1" data-testid="dashboard-tagline">
            <div className="shrink-0 flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <div
                className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.25em]"
                style={{ color: "var(--color-brand-primary)" }}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: "var(--color-brand-primary)" }}
                />
                {taglineParts[0] ?? dashboardTagline}
              </div>
              {taglineParts[1] && (
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.25em]"
                  style={{ color: "var(--color-brand-primary)" }}
                >
                  {taglineParts[1]}
                </span>
              )}
            </div>
            <div
              className="h-px flex-1"
              style={{
                background:
                  "linear-gradient(to right, color-mix(in srgb, var(--color-brand-accent) 70%, transparent), color-mix(in srgb, var(--color-brand-accent) 30%, transparent), transparent)",
              }}
            />
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 shrink-0">Dashboard</div>
          </div>
        ) : (
          <div className="flex items-center gap-4 mb-4 px-1">
            <div
              className="h-px flex-1"
              style={{
                background:
                  "linear-gradient(to right, color-mix(in srgb, var(--color-brand-accent) 70%, transparent), color-mix(in srgb, var(--color-brand-accent) 30%, transparent), transparent)",
              }}
            />
            <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-slate-400 shrink-0">Dashboard</div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1.15fr)] gap-4 items-stretch">
          <div className="relative px-6 py-7 flex flex-col justify-center">
            <h1 className="text-[26px] font-extrabold font-display text-on-surface tracking-tight leading-tight mb-2 whitespace-nowrap">
              {getGreeting()}，{profile?.name ?? "..."}
            </h1>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              選擇一個應用開始你的一天
              <span className="mx-1.5 text-slate-300">·</span>
              或用{" "}
              <kbd className="px-1 py-0.5 rounded border border-slate-300 text-[10px] font-medium bg-white">⌘K</kbd>{" "}
              直接搜尋
            </p>
          </div>
          <ClockWidget />
          <ReminderGrid initialReminders={reminders} catalog={catalog} />
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {modules.map((m) => {
          const card = (
            <div
              className={`relative bg-white rounded-2xl p-6 shadow-sm border border-slate-100 h-full transition-all ${
                m.comingSoon
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:shadow-lg hover:-translate-y-1 cursor-pointer hover:border-slate-200"
              }`}
            >
              {m.comingSoon && (
                <div
                  className="absolute top-4 right-4 text-[10px] font-bold px-2 py-1 rounded-full"
                  style={{
                    color: "var(--color-brand-primary)",
                    backgroundColor: "color-mix(in srgb, var(--color-brand-primary) 10%, transparent)",
                  }}
                >
                  即將推出
                </div>
              )}
              <div className="flex items-center gap-4 mb-4">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{
                    backgroundColor: m.accent
                      ? `${m.accent}22`
                      : "color-mix(in srgb, var(--color-brand-primary) 13%, transparent)",
                  }}
                >
                  <span
                    className="material-symbols-outlined text-2xl"
                    style={{ color: m.accent ?? "var(--color-brand-primary)" }}
                  >
                    {m.icon}
                  </span>
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-on-surface text-lg font-display tracking-tight truncate">{m.name}</h3>
                  {m.description && <p className="text-xs text-on-surface-variant truncate">{m.description}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {m.pages.slice(0, 4).map((p) => (
                  <span key={p.href} className="text-[11px] px-2 py-0.5 bg-surface-container-low rounded-md text-on-surface-variant">
                    {p.name}
                  </span>
                ))}
                {m.pages.length > 4 && (
                  <span className="text-[11px] px-2 py-0.5 text-on-surface-variant">+{m.pages.length - 4}</span>
                )}
              </div>
              {!m.comingSoon && (
                <div
                  className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: m.accent ?? "var(--color-brand-primary)" }}
                />
              )}
            </div>
          );

          if (m.comingSoon) {
            return <div key={m.key} aria-disabled="true">{card}</div>;
          }
          return <Link key={m.key} href={m.home} className="group">{card}</Link>;
        })}
      </div>
    </div>
  );
}
