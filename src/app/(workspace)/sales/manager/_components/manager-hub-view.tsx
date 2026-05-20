"use client";

/**
 * /sales/manager 主管工作台 hub 入口。
 *
 * 顯示 6 張子模組 KpiCard（funnel / sales-report / kpi-targets /
 * staff / staff-grid / card-config），每張帶當月關鍵 snapshot + click 進子頁。
 *
 * 三狀態：
 *  - empty：六張都 0 → 顯示 navy banner「尚無業務資料，先到 RS_M3 設定…」
 *  - error：firstError 非 null → 顯示 amber banner「部分指標載入失敗（dev fallback）」
 *  - normal：正常顯示 KpiCard grid
 */

import Link from "next/link";

import { KpiCard } from "@/components/visualization";
import {
  MANAGER_HUB_CARDS,
  type ManagerHubData,
  type ManagerHubCardMeta,
} from "@/domain/sales-manager-hub.constants";

type Props = {
  data: ManagerHubData;
  canEdit: boolean;
};

export default function ManagerHubView({ data, canEdit }: Props) {
  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          主管工作台
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_M3 hub
        </span>
        <span className="text-[12px] text-[#9A9890]">
          看板 · 設定 · 人員管理一站式入口（資料即時）
        </span>
        {!canEdit && (
          <span className="ml-auto px-2 py-0.5 text-[11px] rounded-md bg-[#F2F2F2] text-[#6B6A68]">
            唯讀視角
          </span>
        )}
      </header>

      {/* Banner */}
      {data.empty && data.ok && (
        <BannerInfo>
          當前 brand（<code className="font-mono">{data.brand_id}</code>
          ）尚無業務資料；請先到「KPI 目標」與「RS 人員管理」設定基礎資料，
          看板就會自動帶出指標。
        </BannerInfo>
      )}
      {!data.ok && (
        <BannerWarn>
          部分指標讀取失敗（{data.error}）；顯示 fallback「—」。卡片仍可點進去看子頁。
        </BannerWarn>
      )}

      {/* Hub grid — 2 列 3 欄 KpiCard */}
      <section
        aria-label="主管工作台子模組導覽"
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3"
      >
        {MANAGER_HUB_CARDS.map((card) => (
          <HubCard key={card.key} card={card} snap={data.snapshots[card.key]} />
        ))}
      </section>

      {/* 二排補充：使用提示 + 同模組相關入口 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 相關入口
          </h2>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[12.5px]">
          <RelLink
            href="/sales/reception/handcard"
            label="RS01 接待手卡"
            desc="第一線業務的客戶卡片建立入口"
          />
          <RelLink
            href="/sales/reports"
            label="銷售報表（舊版）"
            desc="若需要查歷史數據可走這邊"
          />
          <RelLink
            href="/admin/master-data/employees"
            label="員工名冊管理"
            desc="主檔等級的員工 CRUD（含其他部門）"
          />
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────

function HubCard({
  card,
  snap,
}: {
  card: ManagerHubCardMeta;
  snap: ManagerHubData["snapshots"][keyof ManagerHubData["snapshots"]];
}) {
  // KpiCard 已支援 href + tone + with-chart layout
  // 這裡再外面包一層卡片標題，讓設定 / 看板的「標題 + 描述」清楚
  const valueWithUnit = snap.value === "—" || snap.value === "0"
    ? snap.value
    : `${snap.value}${card.unit ?? ""}`;

  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden flex flex-col">
      <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-start gap-2">
        <span
          className="material-symbols-outlined text-[20px] text-[#1A3A5C]"
          aria-hidden
        >
          {card.icon}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-semibold text-[#2C2C2A] truncate">
            {card.title}
          </h3>
          <p className="text-[11px] text-[#9A9890] mt-0.5 truncate">
            {card.description}
          </p>
        </div>
      </header>

      <KpiCard
        label={card.metricLabel}
        value={valueWithUnit}
        delta={snap.delta}
        tone={card.tone}
        layout="horizontal"
        href={card.href}
        className="border-0 rounded-none shadow-none flex-1"
      />

      {snap.subValue && (
        <div className="px-4 pb-3 pt-0">
          <div className="text-[11px] text-[#5A5955]">
            <span className="text-[#9A9890]">{card.subLabel ?? "副指標"}：</span>
            {snap.subValue}
          </div>
        </div>
      )}

      <footer className="px-4 py-2 border-t border-[#EEECE6] bg-white flex justify-end">
        <Link
          href={card.href}
          className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          進入 →
        </Link>
      </footer>
    </div>
  );
}

function BannerInfo({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 rounded-lg bg-[#EAF4FB] border border-[#85B7EB] text-[12.5px] text-[#185FA5]">
      {children}
    </div>
  );
}

function BannerWarn({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5 rounded-lg bg-[#FDF3E3] border border-[#E8C76F] text-[12.5px] text-[#854F0B]">
      {children}
    </div>
  );
}

function RelLink({
  href,
  label,
  desc,
}: {
  href: string;
  label: string;
  desc: string;
}) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 rounded border border-[#EEECE6] hover:border-[#9A9890] hover:bg-[#F8F7F4] transition"
    >
      <div className="text-[12.5px] font-medium text-[#2C2C2A]">{label}</div>
      <div className="text-[11px] text-[#9A9890] mt-0.5">{desc}</div>
    </Link>
  );
}
