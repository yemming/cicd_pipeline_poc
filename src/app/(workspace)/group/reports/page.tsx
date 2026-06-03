"use client";

import Link from "next/link";
import { useSetPageHeader } from "@/components/page-header-context";

type ReportLink = { name: string; desc: string; icon: string; href: string };
type ReportSection = { title: string; items: ReportLink[] };

// 報表中心 = 既有真報表頁的彙整入口（皆為真 React + 真資料，非假頁）
const SECTIONS: ReportSection[] = [
  {
    title: "績效報表",
    items: [
      { name: "集團總覽", desc: "各門市銷售 / 庫存 / 業績達標即時總覽", icon: "dashboard", href: "/group/dashboard" },
      { name: "季度績效報告", desc: "逐店評級對比 + 月度拆解，可匯出 PDF", icon: "calendar_view_month", href: "/group/quarterly-report" },
      { name: "銷售目標達成", desc: "目標配速（Pace）與達成率追蹤", icon: "flag", href: "/group/sales-target" },
      { name: "平衡計分卡 BSC", desc: "六面向 KPI 平衡計分", icon: "balance", href: "/group/bsc" },
    ],
  },
  {
    title: "診斷分析",
    items: [
      { name: "門市銷售診斷", desc: "逐店銷售結構與趨勢拆解", icon: "insights", href: "/group/store-sales" },
      { name: "門市服務診斷", desc: "售後服務量能與滿意度診斷", icon: "build", href: "/group/store-service" },
      { name: "經銷商健康度", desc: "綜合健康分數與環比變化", icon: "favorite", href: "/group/health-score" },
      { name: "門市象限分析", desc: "銷售 × 服務雙軸象限定位", icon: "scatter_plot", href: "/group/store-quadrant" },
      { name: "集團客戶動態", desc: "漏斗 / 流失 / NPS 客戶經營", icon: "groups", href: "/group/customer-dynamics" },
      { name: "零件財務", desc: "集團零件周轉與毛利", icon: "payments", href: "/group/parts-financials" },
    ],
  },
  {
    title: "人員能效",
    items: [
      { name: "銷售人員能效", desc: "業代產值散佈圖", icon: "person", href: "/group/sales-efficiency" },
      { name: "服務顧問能效", desc: "SA 接待與產值散佈圖", icon: "support_agent", href: "/group/sa-efficiency" },
      { name: "技師能效", desc: "技師工時產值散佈圖", icon: "engineering", href: "/group/tech-efficiency" },
      { name: "中古車能效", desc: "中古車收售效率", icon: "directions_car", href: "/group/usedcar-efficiency" },
      { name: "跨部門能效", desc: "跨部門綜合效率對比", icon: "hub", href: "/group/cross-dept-efficiency" },
    ],
  },
];

export default function GroupReportsHubPage() {
  useSetPageHeader({
    title: "報表中心",
    breadcrumb: [{ label: "集團管理", href: "/group/dashboard" }, { label: "報表中心" }],
  });

  return (
    <main className="px-6 py-5 space-y-5">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">報表中心</h1>
        <span className="text-[12px] text-[#9A9890]">集團所有績效 / 診斷 / 能效報表的統一入口</span>
      </header>

      {SECTIONS.map((section) => (
        <section key={section.title} className="space-y-2">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{section.title}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {section.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-start gap-3 hover:border-[#185FA5] hover:shadow-sm transition"
              >
                <span className="material-symbols-outlined text-[20px] text-[#1A3A5C] shrink-0 mt-0.5">
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[#2C2C2A] group-hover:text-[#185FA5]">
                    {item.name}
                  </span>
                  <span className="block text-[11.5px] text-[#9A9890] leading-snug mt-0.5">
                    {item.desc}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
