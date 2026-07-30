"use client";

/**
 * Tab 三：進階：群組 / 頻道管理。
 *
 * 上一輪做好的「群組式」通知設定（接收目標管理 + 通知事件多目標訂閱）整套原封不動保留，
 * 只是從主畫面退居成進階分頁 —— 多數事件已改走 Tab 一的角色路由，這裡留給 Google Chat
 * 頻道類、或需要廣播給整個群組的情境用。
 */

import { useState, type ReactNode } from "react";
import { TargetsTab, type ChannelOpt, type TargetRow } from "./targets-tab";
import type { CandidateView } from "./candidates-section";
import { EventsTab, type SubscriptionRow, type TargetOpt } from "./events-tab";

type SubTabKey = "targets" | "events";

export function AdvancedGroupsTab({
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
  const [subTab, setSubTab] = useState<SubTabKey>("targets");

  return (
    <div className="space-y-3">
      <p className="text-[11.5px] text-[#9A9890]">
        這裡管理的是傳統的 LINE 群組 / Google Chat 頻道式訂閱，多數事件建議改用「事件角色設定」分頁做個人化角色路由，
        只有 Google Chat 頻道或需要廣播給整個群組的情境才需要用到這裡。
      </p>

      <div>
        <div className="flex border-b border-[#EEECE6]">
          <SubTabButton active={subTab === "targets"} onClick={() => setSubTab("targets")}>
            接收目標
          </SubTabButton>
          <SubTabButton active={subTab === "events"} onClick={() => setSubTab("events")}>
            通知事件設定
          </SubTabButton>
        </div>
        <div className="pt-3">
          {subTab === "targets" ? (
            <TargetsTab channels={channels} targets={targets} candidates={candidates} />
          ) : (
            <EventsTab targets={eventTargets} subscriptions={subscriptions} />
          )}
        </div>
      </div>
    </div>
  );
}

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[34px] whitespace-nowrap px-3.5 text-[12px] ${
        active
          ? "-mb-px border-b-2 border-b-[#1A3A5C] font-semibold text-[#1A3A5C]"
          : "text-[#5A5955] hover:text-[#2C2C2A]"
      }`}
    >
      {children}
    </button>
  );
}
