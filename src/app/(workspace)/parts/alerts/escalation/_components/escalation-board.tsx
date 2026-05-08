"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createReceiverAction,
  deleteReceiverAction,
  updateEscalationRuleAction,
  updateReceiverAction,
} from "@/lib/parts-setup/alert-escalation-actions";

export type EscalationRule = {
  id: string;
  alert_type: string;
  alert_label: string;
  alert_priority: string;
  alert_icon: string | null;
  trigger_desc: string | null;
  tier: number;
  tier_label: string;
  delay_minutes: number;
  recipient_label: string | null;
  channel_push: boolean;
  channel_sms: boolean;
  channel_email: boolean;
  sort_order: number;
};

export type Receiver = {
  id: string;
  display_name: string;
  role_label: string | null;
  avatar_color: string;
  default_push: boolean;
  default_sms: boolean;
  default_email: boolean;
  sort_order: number;
};

type Banner = { ok: boolean; msg: string } | null;

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-[#FDECEA] text-[#CC0000]",
  mid: "bg-[#FDF3E3] text-[#854F0B]",
  low: "bg-[#E6EEF8] text-[#1A3A5C]",
};

const PRIORITY_LABEL: Record<string, string> = {
  high: "最高優先",
  mid: "中優先",
  low: "低優先",
};

const TIER_COLOR: Record<number, string> = {
  1: "bg-[#FDECEA] text-[#CC0000] border-[#CC0000]",
  2: "bg-[#FDF3E3] text-[#854F0B] border-[#854F0B]",
  3: "bg-[#EBF3FF] text-[#1A3A5C] border-[#1A3A5C]",
};

const AVATAR_BG: Record<string, string> = {
  navy: "bg-[#1A3A5C]",
  amber: "bg-[#854F0B]",
  teal: "bg-[#0F6E56]",
  red: "bg-[#CC0000]",
};

function fmtDelay(min: number): string {
  if (min === 0) return "觸發後立即";
  if (min % 1440 === 0) return `${min / 1440} 天後`;
  if (min % 60 === 0) return `${min / 60} 小時後`;
  return `${min} 分鐘後`;
}

export function EscalationBoard({
  rules,
  receivers,
  canEdit,
}: {
  rules: EscalationRule[];
  receivers: Receiver[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const groupedRules = useMemo(() => {
    const map = new Map<string, EscalationRule[]>();
    for (const r of rules) {
      if (!map.has(r.alert_type)) map.set(r.alert_type, []);
      map.get(r.alert_type)!.push(r);
    }
    return Array.from(map.entries());
  }, [rules]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const toggleChannel = (
    ruleId: string,
    field: "channel_push" | "channel_sms" | "channel_email",
    value: boolean,
  ) => {
    startTransition(async () => {
      const res = await updateEscalationRuleAction(ruleId, { [field]: value });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const editRecipient = (ruleId: string, current: string | null) => {
    const next = window.prompt("接收人姓名（含角色）", current ?? "");
    if (next === null) return;
    startTransition(async () => {
      const res = await updateEscalationRuleAction(ruleId, { recipient_label: next });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 接收人已更新" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const editDelay = (ruleId: string, current: number) => {
    const raw = window.prompt("延遲分鐘數（0 = 立即）", String(current));
    if (raw === null) return;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      showBanner({ ok: false, msg: "請輸入正整數分鐘" });
      return;
    }
    startTransition(async () => {
      const res = await updateEscalationRuleAction(ruleId, { delay_minutes: n });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 延遲已更新" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const addReceiver = () => {
    const name = window.prompt("姓名");
    if (!name?.trim()) return;
    const role = window.prompt("角色標籤（例：倉管專員）") ?? "";
    startTransition(async () => {
      const res = await createReceiverAction({
        display_name: name.trim(),
        role_label: role,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增接收人" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const toggleReceiverChannel = (
    id: string,
    field: "default_push" | "default_sms" | "default_email",
    value: boolean,
  ) => {
    startTransition(async () => {
      const res = await updateReceiverAction(id, { [field]: value });
      if (res.ok) router.refresh();
      else showBanner({ ok: false, msg: res.error });
    });
  };

  const removeReceiver = (id: string, name: string) => {
    if (!window.confirm(`刪除接收人「${name}」？`)) return;
    startTransition(async () => {
      const res = await deleteReceiverAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">告警階層設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          10.5
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          設定各類告警的升級機制、通知對象與通知方式
        </span>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      <div className={`grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4 ${lockedClass}`}>
        <div className="space-y-4">
          {groupedRules.map(([alertType, list]) => {
            const head = list[0];
            return (
              <section
                key={alertType}
                className="rounded-md border border-[#E1E1E1] bg-white"
              >
                <header className="px-4 py-3 border-b border-[#E1E1E1] flex items-center gap-2">
                  <span className="text-[18px]">{head.alert_icon ?? "🔔"}</span>
                  <h2 className="font-semibold text-[14.5px]">{head.alert_label}</h2>
                  <span
                    className={`ml-2 px-2 py-0.5 text-[11px] rounded ${
                      PRIORITY_BADGE[head.alert_priority] ?? PRIORITY_BADGE.mid
                    }`}
                  >
                    {PRIORITY_LABEL[head.alert_priority] ?? "中優先"}
                  </span>
                </header>
                {head.trigger_desc ? (
                  <div className="px-4 pt-3 text-[11.5px] text-[#444]">
                    觸發條件：{head.trigger_desc}
                  </div>
                ) : null}
                <div className="p-4 space-y-2">
                  {list
                    .sort((a, b) => a.tier - b.tier)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="grid grid-cols-[110px_1fr_220px_auto] items-center gap-3 px-3 py-2 rounded border border-[#E1E1E1]"
                      >
                        <span
                          className={`text-center px-2 py-1 text-[12px] rounded border ${
                            TIER_COLOR[r.tier] ?? TIER_COLOR[1]
                          }`}
                        >
                          {r.tier_label}
                        </span>
                        <div>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => editDelay(r.id, r.delay_minutes)}
                            className="block text-[11px] text-[#666] hover:underline disabled:no-underline"
                          >
                            {fmtDelay(r.delay_minutes)}
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => editRecipient(r.id, r.recipient_label)}
                            className="block w-full text-left mt-1 text-[13px] truncate hover:underline disabled:no-underline"
                          >
                            {r.recipient_label ?? "（未指定）"}
                          </button>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[12px]">
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={r.channel_push}
                              onChange={(e) =>
                                toggleChannel(r.id, "channel_push", e.target.checked)
                              }
                            />
                            系統推播
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={r.channel_sms}
                              onChange={(e) =>
                                toggleChannel(r.id, "channel_sms", e.target.checked)
                              }
                            />
                            簡訊
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              disabled={!canEdit}
                              checked={r.channel_email}
                              onChange={(e) =>
                                toggleChannel(r.id, "channel_email", e.target.checked)
                              }
                            />
                            Email
                          </label>
                        </div>
                        <span className="text-[11px] text-[#888]">
                          {r.channel_push || r.channel_sms || r.channel_email
                            ? "啟用中"
                            : "未啟用"}
                        </span>
                      </div>
                    ))}
                </div>
              </section>
            );
          })}
        </div>

        <aside className="rounded-md border border-[#E1E1E1] bg-white h-fit">
          <header className="px-4 py-3 border-b border-[#E1E1E1] flex items-center gap-2">
            <h2 className="font-semibold text-[14px]">告警接收人管理</h2>
            <button
              type="button"
              disabled={!canEdit}
              onClick={addReceiver}
              className="ml-auto px-2 py-1 text-[12px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
            >
              ＋ 新增
            </button>
          </header>
          <div className="px-4 py-3 text-[11.5px] text-[#666] leading-relaxed">
            設定本門店可接收告警的人員及其默認通知偏好。
          </div>
          <div className="px-4 pb-4 space-y-2">
            {receivers.length === 0 ? (
              <div className="text-[12px] text-[#888]">尚未設定接收人</div>
            ) : (
              receivers.map((rcv) => (
                <div
                  key={rcv.id}
                  className="flex items-center gap-2 px-3 py-2 rounded border border-[#E1E1E1] text-[12.5px]"
                >
                  <span
                    className={`w-7 h-7 rounded text-white text-[11px] font-semibold flex items-center justify-center ${
                      AVATAR_BG[rcv.avatar_color] ?? AVATAR_BG.navy
                    }`}
                  >
                    {rcv.display_name.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{rcv.display_name}</div>
                    <div className="text-[11px] text-[#888] truncate">
                      {rcv.role_label ?? "—"}
                    </div>
                  </div>
                  <div className="flex gap-2 text-[11.5px]">
                    <label className="flex items-center gap-0.5">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={rcv.default_push}
                        onChange={(e) =>
                          toggleReceiverChannel(rcv.id, "default_push", e.target.checked)
                        }
                      />
                      推
                    </label>
                    <label className="flex items-center gap-0.5">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={rcv.default_sms}
                        onChange={(e) =>
                          toggleReceiverChannel(rcv.id, "default_sms", e.target.checked)
                        }
                      />
                      簡
                    </label>
                    <label className="flex items-center gap-0.5">
                      <input
                        type="checkbox"
                        disabled={!canEdit}
                        checked={rcv.default_email}
                        onChange={(e) =>
                          toggleReceiverChannel(rcv.id, "default_email", e.target.checked)
                        }
                      />
                      郵
                    </label>
                  </div>
                  <button
                    type="button"
                    disabled={!canEdit}
                    onClick={() => removeReceiver(rcv.id, rcv.display_name)}
                    className="text-[11px] text-[#CC0000] hover:underline disabled:no-underline"
                  >
                    刪除
                  </button>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </main>
  );
}
