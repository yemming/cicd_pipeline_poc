"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  SALES_NOTIFICATION_GROUP_LABEL,
  type SalesNotificationChannelCode,
  type SalesNotificationModule,
} from "@/domain/sales-notifications.constants";
import type {
  SalesNotificationsBoardData,
  SalesNotificationSubscriptionRow,
  SalesNotificationTargetRow,
  SalesNotificationTemplateRow,
  SalesNotificationEventGroup,
} from "@/domain/sales-notifications";
import {
  createSubscriptionAction,
  deleteSubscriptionAction,
  toggleSubscriptionActiveAction,
} from "@/lib/sales/sales-notifications-actions";

type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] bg-white focus:outline-none focus:border-[#185FA5]";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const CHANNEL_BADGE: Record<
  SalesNotificationChannelCode,
  { bg: string; fg: string; label: string }
> = {
  line: { bg: "#EAF3DE", fg: "#3B6D11", label: "LINE" },
  "google-chat": { bg: "#EAF4FB", fg: "#185FA5", label: "Google Chat" },
};

export function PushNotificationsBoard({
  data,
  canEdit,
  module = "sales",
  title = "推播通知設定",
  sprintLabel = "CRM06",
  caption,
  globalAdminHref = "/admin/notifications/subscriptions",
  moduleLabel,
}: {
  data: SalesNotificationsBoardData;
  canEdit: boolean;
  module?: SalesNotificationModule;
  title?: string;
  sprintLabel?: string;
  caption?: string;
  globalAdminHref?: string;
  moduleLabel?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [showAddFor, setShowAddFor] = useState<string | null>(null);

  const stats = useMemo(() => {
    let active = 0;
    let total = 0;
    for (const g of data.events) {
      for (const s of g.subscriptions) {
        total += 1;
        if (s.is_active) active += 1;
      }
    }
    return { active, total, eventCount: data.events.length };
  }, [data.events]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const markPending = (id: string, on: boolean) =>
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const onToggle = (sub: SalesNotificationSubscriptionRow) => {
    if (!canEdit) return;
    markPending(sub.id, true);
    startTransition(async () => {
      const res = await toggleSubscriptionActiveAction(
        sub.id,
        !sub.is_active,
        module,
      );
      markPending(sub.id, false);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: `✓ 已${res.data.is_active ? "啟用" : "停用"}「${sub.target_display_name}」`,
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onDelete = (sub: SalesNotificationSubscriptionRow) => {
    if (!canEdit) return;
    if (
      !window.confirm(
        `確認刪除訂閱？\n事件：${sub.event_code}\n目標：${sub.target_display_name}`,
      )
    )
      return;
    markPending(sub.id, true);
    startTransition(async () => {
      const res = await deleteSubscriptionAction(sub.id, module);
      markPending(sub.id, false);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除訂閱" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const effectiveModuleLabel =
    moduleLabel ?? (module === "aftersales" ? "售後" : "銷售");
  const effectiveCaption =
    caption ??
    `${effectiveModuleLabel}人員 self-service:哪些事件要推、推到哪個 LINE / Google Chat、目前啟用 ${stats.active} / ${stats.total} 條`;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{title}</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {sprintLabel}
        </span>
        <span className="text-[12px] text-[#9A9890]">{effectiveCaption}</span>
      </header>

      {/* Caption row — summary chips */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
        <div
          className="flex flex-col gap-0.5"
          data-testid="push-summary"
        >
          <span className="text-[11px] text-[#9A9890]">監控中事件</span>
          <span className="text-[14px] font-semibold text-[#2C2C2A]">
            {stats.eventCount} 個
          </span>
        </div>
        <div className="h-8 w-px bg-[#EEECE6]" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-[#9A9890]">啟用中訂閱</span>
          <span className="text-[14px] font-semibold text-[#3B6D11]">
            {stats.active}
          </span>
        </div>
        <div className="h-8 w-px bg-[#EEECE6]" />
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] text-[#9A9890]">總訂閱數</span>
          <span className="text-[14px] font-semibold text-[#2C2C2A]">
            {stats.total}
          </span>
        </div>
        <div className="ml-auto text-[11px] text-[#9A9890]">
          ＊ 後台全域訂閱在{" "}
          <a
            href={globalAdminHref}
            className="text-[#185FA5] hover:underline"
          >
            /admin/notifications
          </a>
          ,這頁只列{effectiveModuleLabel}模組的個人偏好
        </div>
      </section>

      {/* Event cards */}
      <section className="space-y-3" data-testid="push-event-list">
        {data.events.map((group) => (
          <EventCard
            key={group.meta.code}
            group={group}
            targets={data.targets}
            templates={data.templates}
            pendingIds={pendingIds}
            canEdit={canEdit}
            isOpen={showAddFor === group.meta.code}
            onAddOpen={() =>
              setShowAddFor((cur) =>
                cur === group.meta.code ? null : group.meta.code,
              )
            }
            onAddClose={() => setShowAddFor(null)}
            onToggle={onToggle}
            onDelete={onDelete}
            onAddSubmit={(payload, done) => {
              startTransition(async () => {
                const res = await createSubscriptionAction({
                  ...payload,
                  event_code: group.meta.code,
                  module,
                });
                if (res.ok) {
                  showBanner({ ok: true, msg: "✓ 已新增訂閱" });
                  setShowAddFor(null);
                  router.refresh();
                } else {
                  showBanner({ ok: false, msg: res.error });
                }
                done();
              });
            }}
          />
        ))}
      </section>

      {isPending ? (
        <div className="text-[12px] text-[#9A9890]">處理中⋯</div>
      ) : null}

      {/* Banner */}
      {banner ? (
        <div
          data-testid="push-banner"
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );

  // (helpers below are exported from this module scope only)
}

function EventCard({
  group,
  targets,
  templates,
  pendingIds,
  canEdit,
  isOpen,
  onAddOpen,
  onAddClose,
  onToggle,
  onDelete,
  onAddSubmit,
}: {
  group: SalesNotificationEventGroup;
  targets: SalesNotificationTargetRow[];
  templates: SalesNotificationTemplateRow[];
  pendingIds: Set<string>;
  canEdit: boolean;
  isOpen: boolean;
  onAddOpen: () => void;
  onAddClose: () => void;
  onToggle: (sub: SalesNotificationSubscriptionRow) => void;
  onDelete: (sub: SalesNotificationSubscriptionRow) => void;
  onAddSubmit: (
    payload: { target_id: string; template_code: string | null },
    done: () => void,
  ) => void;
}) {
  const activeCount = group.subscriptions.filter((s) => s.is_active).length;

  return (
    <section
      className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
      data-testid="push-event-card"
      data-event-code={group.meta.code}
    >
      <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-3 flex-wrap">
        <span
          className="material-icons text-[#185FA5] text-[20px]"
          aria-hidden="true"
        >
          {group.meta.icon}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              {group.meta.name}
            </h2>
            <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
              {SALES_NOTIFICATION_GROUP_LABEL[group.meta.group]}
            </span>
            <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#F2F2F2] text-[#6B6A68] font-mono">
              {group.meta.code}
            </span>
          </div>
          <p className="text-[12px] text-[#5A5955] mt-1">
            {group.meta.description}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890]">
            {activeCount}/{group.subscriptions.length} 啟用
          </span>
          {canEdit ? (
            <button
              onClick={onAddOpen}
              data-testid="push-event-add-btn"
              className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增訂閱
            </button>
          ) : null}
        </div>
      </header>

      <div className="px-4 py-3 space-y-2">
        {group.subscriptions.length === 0 ? (
          <p className="text-[12px] text-[#9A9890]">
            尚未訂閱此事件 — 點「＋ 新增訂閱」設定通知目標。
          </p>
        ) : (
          group.subscriptions.map((sub) => (
            <SubscriptionRow
              key={sub.id}
              sub={sub}
              busy={pendingIds.has(sub.id)}
              canEdit={canEdit}
              onToggle={() => onToggle(sub)}
              onDelete={() => onDelete(sub)}
            />
          ))
        )}

        {isOpen ? (
          <AddSubscriptionInline
            eventCode={group.meta.code}
            targets={targets}
            templates={templates}
            onCancel={onAddClose}
            onSubmit={onAddSubmit}
          />
        ) : null}
      </div>
    </section>
  );
}

function SubscriptionRow({
  sub,
  busy,
  canEdit,
  onToggle,
  onDelete,
}: {
  sub: SalesNotificationSubscriptionRow;
  busy: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const badge = CHANNEL_BADGE[sub.channel_code] ?? CHANNEL_BADGE.line;
  return (
    <div
      className={`flex items-center gap-2 py-1.5 px-2 rounded border ${
        sub.is_active ? "border-[#EEECE6] bg-white" : "border-[#EEECE6] bg-[#F8F7F4]"
      } ${busy ? "pointer-events-none opacity-60" : ""}`}
      data-testid="push-subscription-row"
      data-subscription-id={sub.id}
      data-active={sub.is_active ? "1" : "0"}
    >
      <span
        className="px-1.5 py-0.5 text-[11px] rounded-md font-medium"
        style={{ backgroundColor: badge.bg, color: badge.fg }}
      >
        {badge.label}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-[#2C2C2A] truncate">
          {sub.target_display_name}
        </div>
        <div className="text-[11px] text-[#9A9890] font-mono truncate">
          {sub.target_type} · {sub.target_ref.slice(0, 28)}
          {sub.target_ref.length > 28 ? "…" : ""}
        </div>
      </div>
      <span
        className={`px-1.5 py-0.5 text-[11px] rounded-md whitespace-nowrap ${
          sub.is_active
            ? "bg-[#EAF3DE] text-[#3B6D11]"
            : "bg-[#F2F2F2] text-[#6B6A68]"
        }`}
        data-testid="push-subscription-status"
      >
        {sub.is_active ? "啟用中" : "已停用"}
      </span>
      {canEdit ? (
        <>
          <button
            onClick={onToggle}
            disabled={busy}
            data-testid="push-toggle-btn"
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            {busy ? "切換中⋯" : sub.is_active ? "停用" : "啟用"}
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
          >
            刪除
          </button>
        </>
      ) : null}
    </div>
  );
}

function AddSubscriptionInline({
  eventCode,
  targets,
  templates,
  onCancel,
  onSubmit,
}: {
  eventCode: string;
  targets: SalesNotificationTargetRow[];
  templates: SalesNotificationTemplateRow[];
  onCancel: () => void;
  onSubmit: (
    payload: { target_id: string; template_code: string | null },
    done: () => void,
  ) => void;
}) {
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? "");
  const [templateCode, setTemplateCode] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const selectedTarget = targets.find((t) => t.id === targetId);
  const candidateTemplates = templates.filter(
    (t) =>
      t.event_code === eventCode &&
      (!selectedTarget || t.channel_code === selectedTarget.channel_code),
  );

  return (
    <div
      className="mt-1 border border-[#1A3A5C] bg-[#F8F7F4] rounded p-3 flex items-end gap-2 flex-wrap"
      data-testid="push-add-inline"
    >
      <div className="flex flex-col gap-1">
        <label className={labelClass}>通知目標</label>
        <select
          value={targetId}
          onChange={(e) => {
            setTargetId(e.target.value);
            setTemplateCode("");
          }}
          className={inputClass}
          data-testid="push-add-target"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.channel_display}｜{t.display_name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className={labelClass}>訊息模板（可選）</label>
        <select
          value={templateCode}
          onChange={(e) => setTemplateCode(e.target.value)}
          className={inputClass}
          data-testid="push-add-template"
        >
          <option value="">— 使用內建預設 —</option>
          {candidateTemplates.map((t) => (
            <option key={t.code} value={t.code}>
              {t.code}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 ml-auto">
        <button
          onClick={onCancel}
          disabled={submitting}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          取消
        </button>
        <button
          onClick={() => {
            if (!targetId) return;
            setSubmitting(true);
            onSubmit(
              {
                target_id: targetId,
                template_code: templateCode === "" ? null : templateCode,
              },
              () => setSubmitting(false),
            );
          }}
          disabled={submitting || !targetId}
          data-testid="push-add-submit"
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          {submitting ? "建立中⋯" : "建立訂閱"}
        </button>
      </div>
    </div>
  );
}

