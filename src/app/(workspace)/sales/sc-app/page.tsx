"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import Link from "next/link";

type Tab = "today" | "customers" | "inventory" | "orders" | "profile";

const NAV_ITEMS: { key: Tab; icon: string; iconFilled: string; label: string; href?: string }[] = [
  { key: "today",     icon: "today",        iconFilled: "today",         label: "今日" },
  { key: "customers", icon: "groups",        iconFilled: "groups",        label: "客戶", href: "/sales/customers" },
  { key: "inventory", icon: "two_wheeler",   iconFilled: "two_wheeler",   label: "庫存", href: "/sales/inventory" },
  { key: "orders",    icon: "description",   iconFilled: "description",   label: "訂單", href: "/sales/orders" },
  { key: "profile",   icon: "account_circle",iconFilled: "account_circle",label: "我的" },
];

const TASKS = [
  {
    time: "09:00",
    status: "待撥打",
    statusClass: "bg-amber-50 text-amber-600 border border-amber-200",
    icon: "phone",
    iconBg: "bg-[#1A1A2E]/5",
    iconColor: "text-on-surface-variant",
    title: "電訪跟進 李小姐",
    grade: "B 級",
    gradeClass: "text-on-surface-variant/60",
    highlight: false,
  },
  {
    time: "10:30",
    status: "已確認",
    statusClass: "bg-green-50 text-green-600 border border-green-200",
    icon: "person",
    iconBg: "bg-[#CC0000]",
    iconColor: "text-white",
    title: "邀約到店 張先生",
    grade: "A 級",
    gradeClass: "text-[#CC0000] font-bold",
    highlight: true,
  },
  {
    time: "14:00",
    status: "待接待",
    statusClass: "bg-blue-50 text-blue-600 border border-blue-200",
    icon: "calendar_today",
    iconBg: "bg-[#1A1A2E]/5",
    iconColor: "text-on-surface-variant",
    title: "新客接待",
    grade: "排班輪值",
    gradeClass: "text-on-surface-variant/60",
    highlight: false,
  },
  {
    time: "15:30",
    status: "待撥打",
    statusClass: "bg-amber-50 text-amber-600 border border-amber-200",
    icon: "phone",
    iconBg: "bg-[#1A1A2E]/5",
    iconColor: "text-on-surface-variant",
    title: "電訪跟進 陳先生",
    grade: "C 級",
    gradeClass: "text-on-surface-variant/60",
    highlight: false,
  },
  {
    time: "16:00",
    status: "主管已批",
    statusClass: "bg-[#CC0000]/5 text-[#CC0000] border border-[#CC0000]/20",
    icon: "description",
    iconBg: "bg-[#1A1A2E]/5",
    iconColor: "text-on-surface-variant",
    title: "訂單簽核結果確認",
    grade: "ORD-005",
    gradeClass: "text-on-surface-variant/60 font-mono",
    highlight: false,
  },
];

// 帶客工具：業務拿 iPad 面對面給客人展示的功能
const CUSTOMER_TOOLS = [
  {
    icon: "compare",
    label: "車款比較",
    desc: "並排對比規格",
    href: "/sales/inventory",
    color: "#CC0000",
    bg: "from-[#CC0000]/10 to-[#CC0000]/5",
  },
  {
    icon: "calculate",
    label: "金融試算",
    desc: "分期 · 利率 · 月繳",
    href: "/sales/finance",
    color: "#1A1A2E",
    bg: "from-[#1A1A2E]/10 to-[#1A1A2E]/5",
  },
  {
    icon: "directions_bike",
    label: "試駕預約",
    desc: "現場立即報名",
    href: "/sales/test-rides",
    color: "#4A7C59",
    bg: "from-[#4A7C59]/10 to-[#4A7C59]/5",
  },
  {
    icon: "palette",
    label: "配色選擇",
    desc: "車色 · 塗裝方案",
    href: "#",
    color: "#7C4A9E",
    bg: "from-[#7C4A9E]/10 to-[#7C4A9E]/5",
  },
  {
    icon: "build",
    label: "精品配件",
    desc: "原廠選配目錄",
    href: "/sales/accessories",
    color: "#C9A84C",
    bg: "from-[#C9A84C]/10 to-[#C9A84C]/5",
  },
  {
    icon: "receipt_long",
    label: "報價產生",
    desc: "即時生成報價單",
    href: "/sales/quote",
    color: "#2563EB",
    bg: "from-[#2563EB]/10 to-[#2563EB]/5",
  },
];

export default function ScAppPage() {
  const [activeTab, setActiveTab] = useState<Tab>("today");
  const [showFab, setShowFab] = useState(true);

  useSetPageHeader({
    title: "顧問 App",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "顧問 App" },
    ],
  });

  return (
    // Outer container: full height minus topbar (4rem), flex column
    <div className="relative -m-4 md:-m-8 flex flex-col bg-[#F5F5F5] min-h-[calc(100dvh-4rem)]">

      {/* ── Scrollable content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-28 px-5 pt-5 space-y-7">

        {/* KPI Strip */}
        <section>
          <p className="text-[10px] font-bold text-[#1A1A2E]/40 tracking-[0.12em] uppercase mb-3">今日數字</p>
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="待跟進" value="5" />
            <KpiCard label="今日邀約" value="2" />
            <KpiCard label="本月成交" value="3" total="8" progress={37.5} />
          </div>
        </section>

        {/* Tasks */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold text-[#1A1A2E]/40 tracking-[0.12em] uppercase">今日待辦</p>
            <button className="text-[11px] font-semibold text-[#CC0000] flex items-center gap-0.5 active:opacity-60">
              查看全部
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            </button>
          </div>

          {/* Timeline */}
          <div className="relative space-y-3">
            <div className="absolute left-[19px] top-3 bottom-3 w-px bg-[#1A1A2E]/8" />
            {TASKS.map((task, i) => (
              <TaskRow key={i} {...task} />
            ))}
          </div>
        </section>

        {/* Customer Tools */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold text-[#1A1A2E]/40 tracking-[0.12em] uppercase leading-none mb-1">帶客工具</p>
              <p className="text-[11px] text-[#1A1A2E]/40">面對面展示給客人</p>
            </div>
            {/* 客戶模式 hint */}
            <span className="flex items-center gap-1 text-[10px] font-semibold text-[#CC0000] bg-[#CC0000]/8 px-2.5 py-1 rounded-full">
              <span className="material-symbols-outlined text-[12px]">person_pin</span>
              客戶模式
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {CUSTOMER_TOOLS.map((tool) => (
              <Link
                key={tool.label}
                href={tool.href}
                className="group relative bg-white rounded-2xl p-4 border border-[#1A1A2E]/6 shadow-[0_2px_12px_rgba(26,26,46,0.05)] active:scale-95 transition-all duration-150 overflow-hidden"
              >
                {/* Gradient accent background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${tool.bg} opacity-0 group-active:opacity-100 transition-opacity`} />

                <div className="relative">
                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                    style={{ backgroundColor: `${tool.color}15` }}
                  >
                    <span
                      className="material-symbols-outlined text-[20px]"
                      style={{ color: tool.color }}
                    >
                      {tool.icon}
                    </span>
                  </div>

                  {/* Text */}
                  <p className="text-[13px] font-bold text-[#1A1A2E] leading-tight">{tool.label}</p>
                  <p className="text-[10px] text-[#1A1A2E]/45 mt-0.5 leading-tight">{tool.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

      </div>

      {/* ── FAB ───────────────────────────────────────────────────── */}
      <button
        onClick={() => setShowFab(!showFab)}
        className="fixed z-40 w-14 h-14 bg-[#CC0000] text-white rounded-full shadow-[0_8px_24px_rgba(204,0,0,0.35)] flex items-center justify-center active:scale-90 transition-transform duration-200"
        style={{
          bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
          right: "1.5rem",
        }}
        aria-label="快速新增"
      >
        <span className="material-symbols-outlined text-[24px]">add</span>
      </button>

      {/* ── Bottom Nav ─────────────────────────────────────────────── */}
      {/*  left: var(--shell-left) aligns with the workspace main content area */}
      <nav
        className="fixed bottom-0 right-0 z-50"
        style={{ left: "var(--shell-left, 0px)" }}
      >
        {/* Glass bar */}
        <div className="bg-[#0F0F1E]/90 backdrop-blur-2xl border-t border-white/8 shadow-[0_-8px_32px_rgba(0,0,0,0.25)]">
          <div className="flex items-stretch" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
            {NAV_ITEMS.map((item) => {
              const active = activeTab === item.key;
              const inner = (
                <>
                  {active && (
                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-[#CC0000] rounded-full" />
                  )}
                  <span
                    className="material-symbols-outlined text-[22px] transition-all duration-200"
                    style={{
                      color: active ? "#CC0000" : "white",
                      fontVariationSettings: active
                        ? "'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 24"
                        : "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24",
                    }}
                  >
                    {item.icon}
                  </span>
                  <span
                    className="text-[10px] font-medium tracking-wide transition-colors duration-200"
                    style={{ color: active ? "#CC0000" : "rgba(255,255,255,0.9)" }}
                  >
                    {item.label}
                  </span>
                </>
              );

              const sharedClass = `flex-1 flex flex-col items-center justify-center gap-1 py-3 relative transition-all duration-200 active:scale-90 ${active ? "" : "opacity-40 hover:opacity-70"}`;

              return item.href && !active ? (
                <Link
                  key={item.key}
                  href={item.href}
                  className={sharedClass}
                  onClick={() => setActiveTab(item.key)}
                >
                  {inner}
                </Link>
              ) : (
                <button key={item.key} className={sharedClass} onClick={() => setActiveTab(item.key)}>
                  {inner}
                </button>
              );
            })}
          </div>
        </div>
      </nav>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  total,
  progress,
}: {
  label: string;
  value: string;
  total?: string;
  progress?: number;
}) {
  return (
    <div className="bg-white rounded-2xl p-4 shadow-[0_2px_12px_rgba(26,26,46,0.06)] border border-[#1A1A2E]/4">
      <p className="text-[10px] font-medium text-[#1A1A2E]/50 mb-2 leading-none">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-black text-[#1A1A2E] leading-none">{value}</span>
        {total && <span className="text-[11px] text-[#1A1A2E]/40 font-medium">/{total}</span>}
      </div>
      {progress !== undefined && (
        <div className="mt-2.5 h-1 bg-[#1A1A2E]/6 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#C9A84C] rounded-full transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}

function TaskRow({
  time,
  status,
  statusClass,
  icon,
  iconBg,
  iconColor,
  title,
  grade,
  gradeClass,
  highlight,
}: (typeof TASKS)[0]) {
  return (
    <div
      className={`flex gap-3 relative active:scale-[0.99] transition-transform duration-150 ${
        highlight ? "group" : ""
      }`}
    >
      {/* Timeline dot */}
      <div
        className={`z-10 shrink-0 mt-3 w-9 h-9 rounded-full flex items-center justify-center shadow-sm ${iconBg}`}
      >
        <span className={`material-symbols-outlined text-[17px] ${iconColor}`}>{icon}</span>
      </div>

      {/* Card */}
      <div
        className={`flex-1 rounded-2xl border p-4 flex items-center justify-between transition-shadow duration-200 ${
          highlight
            ? "bg-white border-[#CC0000]/15 shadow-[0_4px_20px_rgba(204,0,0,0.08)]"
            : "bg-white border-[#1A1A2E]/6 shadow-[0_2px_8px_rgba(26,26,46,0.04)]"
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="text-[10px] font-bold text-[#1A1A2E]/40 font-mono tracking-wider">{time}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${statusClass}`}>{status}</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-sm font-bold text-[#1A1A2E] truncate">{title}</h3>
            <span className={`text-[10px] shrink-0 ${gradeClass}`}>{grade}</span>
          </div>
        </div>
        <span className="material-symbols-outlined text-[#1A1A2E]/20 shrink-0 ml-2">chevron_right</span>
      </div>
    </div>
  );
}
