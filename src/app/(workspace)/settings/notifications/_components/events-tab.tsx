"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createSubscriptionAction,
  deleteSubscriptionAction,
  toggleSubscriptionActiveAction,
} from "@/lib/notifications/actions";
import { EVENT_CATALOG, catalogedEventCodes, type EventCatalogEntry } from "./event-catalog";
import { channelLabel } from "./format";

export interface TargetOpt {
  id: string;
  display_name: string;
  channel_code: string;
  is_active: boolean;
}

export interface SubscriptionRow {
  id: string;
  event_code: string;
  target_id: string;
  is_active: boolean;
}

const selectClass =
  "h-[28px] rounded border border-[#D5D3CB] bg-white px-2 text-[11.5px] outline-none focus:border-[#185FA5] disabled:opacity-60";

export function EventsTab({ targets, subscriptions }: { targets: TargetOpt[]; subscriptions: SubscriptionRow[] }) {
  const targetMap = useMemo(() => new Map(targets.map((t) => [t.id, t])), [targets]);

  const subsByEvent = useMemo(() => {
    const m = new Map<string, SubscriptionRow[]>();
    for (const s of subscriptions) {
      const arr = m.get(s.event_code) ?? [];
      arr.push(s);
      m.set(s.event_code, arr);
    }
    return m;
  }, [subscriptions]);

  // 保險機制：資料庫裡若出現目錄沒收錄的事件碼（未來新事件忘了補目錄），
  // 用事件碼本身當顯示名放進一個額外分組，避免既有設定悄悄從畫面消失。
  const groups = useMemo(() => {
    const known = catalogedEventCodes();
    const extra = Array.from(new Set(subscriptions.map((s) => s.event_code)))
      .filter((code) => !known.has(code))
      .sort();
    if (extra.length === 0) return EVENT_CATALOG;
    return [
      ...EVENT_CATALOG,
      {
        key: "uncatalogued",
        label: "其他事件（未分類）",
        events: extra.map((code) => ({ code, label: code })),
      },
    ];
  }, [subscriptions]);

  return (
    <div className="space-y-5">
      <p className="text-[11.5px] text-[#9A9890]">
        每個事件可以同時通知多個對象（例如同時發到銷售群組 + 店長個人）。在事件底下按「＋ 新增接收目標」加入，
        或用開關暫時停用某個目標而不用整筆刪除。
      </p>
      {groups.map((g) => (
        <section key={g.key} className="overflow-hidden rounded-lg border border-[#EEECE6] bg-white">
          <header className="border-b border-[#EEECE6] bg-[#F8F7F4] px-4 py-2.5">
            <h3 className="text-[13px] font-semibold text-[#2C2C2A]">{g.label}</h3>
          </header>
          <div className="divide-y divide-[#EEECE6]">
            {g.events.map((ev) => (
              <EventRow
                key={ev.code}
                event={ev}
                subs={subsByEvent.get(ev.code) ?? []}
                targets={targets}
                targetMap={targetMap}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function EventRow({
  event,
  subs,
  targets,
  targetMap,
}: {
  event: EventCatalogEntry;
  subs: SubscriptionRow[];
  targets: TargetOpt[];
  targetMap: Map<string, TargetOpt>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const subscribedTargetIds = new Set(subs.map((s) => s.target_id));
  const availableTargets = targets.filter((t) => !subscribedTargetIds.has(t.id));

  const addSubscription = () => {
    if (!selectedTargetId) return;
    setError(null);
    const fd = new FormData();
    fd.set("event_code", event.code);
    fd.set("target_id", selectedTargetId);
    fd.set("is_active", "true");
    startTransition(async () => {
      try {
        await createSubscriptionAction(fd);
        setAdding(false);
        setSelectedTargetId("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex flex-wrap items-start gap-3 px-4 py-3">
      <div className="w-full shrink-0 md:w-[240px]">
        <div className="text-[12.5px] font-medium text-[#2C2C2A]">{event.label}</div>
        {event.label !== event.code && (
          <div className="mt-0.5 font-mono text-[10.5px] text-[#9A9890]">{event.code}</div>
        )}
      </div>

      <div className="flex min-w-[260px] flex-1 flex-wrap items-center gap-2">
        {subs.length === 0 && !adding && (
          <span className="text-[11.5px] text-[#9A9890]">尚未設定接收目標</span>
        )}

        {subs.map((s) => (
          <SubscriptionChip key={s.id} sub={s} target={targetMap.get(s.target_id)} />
        ))}

        {adding ? (
          <div className="inline-flex items-center gap-1.5">
            <select
              value={selectedTargetId}
              onChange={(e) => setSelectedTargetId(e.target.value)}
              className={selectClass}
              disabled={isPending}
            >
              <option value="">選擇接收目標…</option>
              {availableTargets.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.display_name}（{channelLabel(t.channel_code)}）
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={addSubscription}
              disabled={isPending || !selectedTargetId}
              className="h-[28px] rounded bg-[#0F6E56] px-2.5 text-[11.5px] font-medium text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {isPending ? "新增中…" : "確定"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setSelectedTargetId("");
                setError(null);
              }}
              disabled={isPending}
              className="h-[28px] rounded border border-[#D5D3CB] bg-white px-2.5 text-[11.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={availableTargets.length === 0}
            title={availableTargets.length === 0 ? "所有接收目標都已訂閱此事件" : undefined}
            className="h-[26px] rounded border border-dashed border-[#D5D3CB] bg-white px-2.5 text-[11.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
          >
            ＋ 新增接收目標
          </button>
        )}

        {error && <span className="w-full text-[11px] text-[#CC0000]">⚠️ {error}</span>}
      </div>
    </div>
  );
}

function SubscriptionChip({ sub, target }: { sub: SubscriptionRow; target: TargetOpt | undefined }) {
  const router = useRouter();
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = isToggling || isDeleting;
  const targetName = target?.display_name ?? "（目標已刪除）";

  const toggle = () => {
    setError(null);
    startToggle(async () => {
      try {
        await toggleSubscriptionActiveAction(sub.id, !sub.is_active);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const remove = () => {
    if (!window.confirm(`確定移除「${targetName}」對這個事件的通知？`)) return;
    setError(null);
    startDelete(async () => {
      try {
        await deleteSubscriptionAction(sub.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <span
      className={`inline-flex h-[26px] items-center gap-1 rounded-full border pl-2.5 pr-1 text-[11.5px] ${
        sub.is_active ? "border-[#D5D3CB] bg-white text-[#2C2C2A]" : "border-[#EEECE6] bg-[#F2F2F2] text-[#9A9890]"
      } ${busy ? "opacity-60" : ""}`}
      title={error ?? undefined}
    >
      {targetName}
      {target && <span className="text-[#9A9890]">· {channelLabel(target.channel_code)}</span>}
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="ml-1 h-[20px] rounded border border-[#D5D3CB] bg-white px-1.5 text-[10.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
      >
        {isToggling ? "…" : sub.is_active ? "停用" : "啟用"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label="刪除此接收目標"
        className="flex h-[20px] w-[20px] items-center justify-center rounded text-[#CC0000] hover:bg-[#FDECEA] disabled:opacity-50"
      >
        ✕
      </button>
    </span>
  );
}
