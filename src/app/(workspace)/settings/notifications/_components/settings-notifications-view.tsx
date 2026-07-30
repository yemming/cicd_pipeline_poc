"use client";

import { useState, type ReactNode } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { TargetsTab, type ChannelOpt, type TargetRow } from "./targets-tab";
import type { CandidateView } from "./candidates-section";
import { EventsTab, type SubscriptionRow, type TargetOpt } from "./events-tab";

type TabKey = "targets" | "events";

export function SettingsNotificationsView({
  channels,
  targets,
  eventTargets,
  candidates,
  subscriptions,
}: {
  channels: ChannelOpt[];
  targets: TargetRow[];
  eventTargets: TargetOpt[];
  candidates: CandidateView[];
  subscriptions: SubscriptionRow[];
}) {
  useSetPageHeader({
    title: "通知設定",
    breadcrumb: [{ label: "系統設定", href: "/settings/org" }, { label: "通知設定" }],
  });

  const [tab, setTab] = useState<TabKey>("targets");

  return (
    <main className="space-y-4 px-6 py-5">
      <header>
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">通知設定</h1>
        <p className="mt-1 text-[12px] text-[#9A9890]">
          設定哪些 LINE 群組 / Google Chat 空間會收到哪些事件通知，系統管理員自己就能調整，不用每次都找工程師改資料庫。
        </p>
      </header>

      <div>
        <div className="overflow-x-auto rounded-t-lg border border-[#EEECE6] bg-white">
          <div className="flex border-b border-[#EEECE6]">
            <TabButton active={tab === "targets"} onClick={() => setTab("targets")}>
              接收目標
            </TabButton>
            <TabButton active={tab === "events"} onClick={() => setTab("events")}>
              通知事件設定
            </TabButton>
          </div>
        </div>
        <div className="space-y-3 rounded-b-lg border border-t-0 border-[#EEECE6] bg-white p-4">
          {tab === "targets" ? (
            <TargetsTab channels={channels} targets={targets} candidates={candidates} />
          ) : (
            <EventsTab targets={eventTargets} subscriptions={subscriptions} />
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
