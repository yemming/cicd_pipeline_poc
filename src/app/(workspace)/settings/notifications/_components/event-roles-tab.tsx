"use client";

/**
 * Tab 一：事件角色設定 — Russell 第二版指令核心畫面。
 *
 * 每個事件不再手動挑群組，而是選一個「職位」，dispatch 端會自動找
 * 目前擔任該職位、在職、已綁定個人 LINE 的員工發送通知（見
 * @/domain/line-binding 的 listActiveEmployeesByRole）。
 *
 * 「改了就存」：下拉選單 / 開關一變動立即呼叫 upsertEventRoleAction，
 * 不做整頁「儲存設定」按鈕 —— 跟本頁其他分頁、專案內其他頁面的互動慣例一致。
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertEventRoleAction } from "@/lib/notifications/actions";
import type { EventCode } from "@/lib/notifications";
import { EVENT_CATALOG } from "./event-catalog";

export interface RoleOpt {
  code: string;
  label: string;
}

export interface RoleSubscriptionRow {
  id: string;
  event_code: string;
  target_role: string | null;
  is_active: boolean;
}

const NONE_VALUE = "";

export function EventRolesTab({
  roleOptions,
  subscriptions,
}: {
  roleOptions: RoleOpt[];
  subscriptions: RoleSubscriptionRow[];
}) {
  // 「其他事件」分組維持群組式使用情境（Google Chat 頻道類 / 廣播類），不適用角色路由。
  const roleGroups = useMemo(() => EVENT_CATALOG.filter((g) => g.key !== "other"), []);

  const roleByEvent = useMemo(() => {
    const m = new Map<string, RoleSubscriptionRow>();
    for (const s of subscriptions) {
      if (s.target_role) m.set(s.event_code, s);
    }
    return m;
  }, [subscriptions]);

  return (
    <div className="space-y-5">
      <p className="text-[11.5px] text-[#9A9890]">
        設定每個事件要通知「哪個職位」，系統會自動找出目前擔任該職位、在職、且已綁定個人 LINE
        的員工發送通知，不用再手動維護群組名單。下拉選單或開關一變動就會立即儲存，不用另外按「儲存設定」。
      </p>

      {roleGroups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-lg border border-[#EEECE6] bg-white">
          <header className="border-b border-[#EEECE6] bg-[#F8F7F4] px-4 py-2.5">
            <h3 className="text-[13px] font-semibold text-[#2C2C2A]">{g.label}</h3>
          </header>
          <div className="divide-y divide-[#EEECE6]">
            {g.events.map((ev) => (
              <EventRoleRow
                key={ev.code}
                eventCode={ev.code}
                eventLabel={ev.label}
                current={roleByEvent.get(ev.code)}
                roleOptions={roleOptions}
              />
            ))}
          </div>
        </section>
      ))}

      <p className="text-[11.5px] text-[#9A9890]">
        「其他事件」分組（Google Chat 頻道類 / 需廣播給整個群組的情境）不適用角色路由，
        這些事件的通知設定請到「進階：群組 / 頻道管理」分頁調整。
      </p>
    </div>
  );
}

function EventRoleRow({
  eventCode,
  eventLabel,
  current,
  roleOptions,
}: {
  eventCode: string;
  eventLabel: string;
  current: RoleSubscriptionRow | undefined;
  roleOptions: RoleOpt[];
}) {
  const router = useRouter();
  const [role, setRole] = useState(current?.target_role ?? NONE_VALUE);
  const [active, setActive] = useState(current?.is_active ?? false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function save(nextRole: string, nextActive: boolean) {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const res = await upsertEventRoleAction(eventCode as EventCode, nextRole || null, nextActive);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.refresh();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function onRoleChange(next: string) {
    setRole(next);
    if (!next) {
      // 選「（關閉，不通知）」— 一併關閉開關，避免留下「角色為空但啟用中」的無意義狀態
      setActive(false);
      save(next, false);
    } else {
      setActive(true);
      save(next, true);
    }
  }

  function onToggleActive() {
    if (!role) return;
    const next = !active;
    setActive(next);
    save(role, next);
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-3 px-4 py-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="w-full shrink-0 md:w-[240px]">
        <div className="text-[12.5px] font-medium text-[#2C2C2A]">{eventLabel}</div>
        {eventLabel !== eventCode && (
          <div className="mt-0.5 font-mono text-[10.5px] text-[#9A9890]">{eventCode}</div>
        )}
      </div>

      <div className="flex flex-1 flex-wrap items-center gap-2">
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value)}
          disabled={isPending}
          className="h-[30px] rounded border border-[#D5D3CB] bg-white px-2 text-[12.5px] outline-none focus:border-[#185FA5] disabled:opacity-60"
        >
          <option value={NONE_VALUE}>（關閉，不通知）</option>
          {roleOptions.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>

        <div className="inline-flex items-center gap-1.5">
          <Switch on={active} onChange={onToggleActive} disabled={isPending || !role} ariaLabel="啟用此事件的角色通知" />
          <span className="text-[11.5px] text-[#5A5955]">{isPending ? "儲存中…" : active ? "已啟用" : "已關閉"}</span>
        </div>

        {saved && <span className="text-[11.5px] text-[#3B6D11]">✓ 已儲存</span>}
        {error && <span className="text-[11px] text-[#CC0000]">⚠️ {error}</span>}
      </div>
    </div>
  );
}

function Switch({
  on,
  onChange,
  disabled,
  ariaLabel,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[22px] w-[38px] rounded-full transition-colors duration-200 disabled:opacity-50 ${
        on ? "bg-[#0F6E56]" : "bg-[#D5D3CB]"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] h-[16px] w-[16px] rounded-full bg-white shadow transition-transform duration-200 ${
          on ? "translate-x-[16px]" : "translate-x-0"
        }`}
      />
    </button>
  );
}
