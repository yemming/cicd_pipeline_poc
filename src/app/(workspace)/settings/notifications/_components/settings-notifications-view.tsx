"use client";

import { useState, type ReactNode } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { AdvancedGroupsTab } from "./advanced-groups-tab";
import type { ChannelOpt, TargetRow } from "./targets-tab";
import type { CandidateView } from "./candidates-section";
import type { TargetOpt } from "./events-tab";
import { EventRolesTab, type RoleOpt } from "./event-roles-tab";
import { BindingOverviewTab, type EmployeeBindRowView } from "./binding-overview-tab";

type TabKey = "roles" | "binding" | "advanced";

// 事件訂閱列同時餵給「事件角色設定」（讀 target_role）跟「進階：群組/頻道管理」
// （讀 target_id），兩邊各自的 tab 元件 prop 型別只取用到的欄位，這裡用單一
// 合併型別餵給兩邊，靠結構化型別相容，不用醜的 `A[] & B[]` 交集寫法。
export interface CombinedSubscriptionRow {
  id: string;
  event_code: string;
  target_id: string | null;
  target_role: string | null;
  is_active: boolean;
}

export function SettingsNotificationsView({
  channels,
  targets,
  eventTargets,
  candidates,
  subscriptions,
  roleOptions,
  employees,
}: {
  channels: ChannelOpt[];
  targets: TargetRow[];
  eventTargets: TargetOpt[];
  candidates: CandidateView[];
  subscriptions: CombinedSubscriptionRow[];
  roleOptions: RoleOpt[];
  employees: EmployeeBindRowView[];
}) {
  useSetPageHeader({
    title: "通知設定",
    breadcrumb: [{ label: "系統設定", href: "/settings/org" }, { label: "通知設定" }],
  });

  // 主要使用情境是角色路由，預設開這一頁（取代舊版預設開「接收目標」）
  const [tab, setTab] = useState<TabKey>("roles");

  return (
    <main className="space-y-4 px-6 py-5">
      <header>
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">通知設定</h1>
        <p className="mt-1 text-[12px] text-[#9A9890]">
          設定哪些事件要通知「誰」——多數事件走角色路由（自動找該職位的在職員工發個人 LINE），
          少數群組 / 頻道式情境仍可在「進階」分頁手動設定，系統管理員自己就能調整，不用每次都找工程師改資料庫。
        </p>
      </header>

      <div>
        <div className="overflow-x-auto rounded-t-lg border border-[#EEECE6] bg-white">
          <div className="flex border-b border-[#EEECE6]">
            <TabButton active={tab === "roles"} onClick={() => setTab("roles")}>
              事件角色設定
            </TabButton>
            <TabButton active={tab === "binding"} onClick={() => setTab("binding")}>
              LINE 綁定總覽
            </TabButton>
            <TabButton active={tab === "advanced"} onClick={() => setTab("advanced")}>
              進階：群組 / 頻道管理
            </TabButton>
          </div>
        </div>
        <div className="space-y-3 rounded-b-lg border border-t-0 border-[#EEECE6] bg-white p-4">
          {tab === "roles" && <EventRolesTab roleOptions={roleOptions} subscriptions={subscriptions} />}
          {tab === "binding" && <BindingOverviewTab employees={employees} />}
          {tab === "advanced" && (
            <AdvancedGroupsTab
              channels={channels}
              targets={targets}
              eventTargets={eventTargets}
              candidates={candidates}
              subscriptions={subscriptions}
            />
          )}
        </div>
      </div>
    </main>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[40px] whitespace-nowrap border-r border-[#EEECE6] px-4 text-[12.5px] last:border-r-0 ${
        active
          ? "-mb-px border-b-2 border-b-[#1A3A5C] bg-white font-semibold text-[#1A3A5C]"
          : "text-[#5A5955] hover:bg-[#F8F7F4]"
      }`}
    >
      {children}
    </button>
  );
}
