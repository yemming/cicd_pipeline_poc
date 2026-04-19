"use client";

import { useState, useTransition } from "react";
import { createSubscriptionAction } from "@/lib/notifications/actions";

interface TargetOpt {
  id: string;
  channelCode: string;
  displayName: string;
  targetRef: string;
}

interface TemplateOpt {
  code: string;
  eventCode: string;
  channelCode: string;
}

export function CreateSubscriptionForm({
  eventCodes,
  targets,
  templateCodes,
}: {
  eventCodes: string[];
  targets: TargetOpt[];
  templateCodes: TemplateOpt[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [eventCode, setEventCode] = useState(eventCodes[0]);
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");

  const relevantTemplates = templateCodes.filter((t) => {
    const target = targets.find((tg) => tg.id === targetId);
    return t.eventCode === eventCode && t.channelCode === target?.channelCode;
  });

  async function onSubmit(fd: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await createSubscriptionAction(fd);
        setSuccess(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const isBusy = isPending;

  return (
    <form
      action={onSubmit}
      className={`rounded-lg border border-outline-variant bg-surface-container p-4 space-y-3 ${
        isBusy ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="事件類型">
          <select
            name="event_code"
            className="form-input"
            value={eventCode}
            onChange={(e) => setEventCode(e.target.value)}
            disabled={isBusy}
          >
            {eventCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>

        <Field label="目標">
          <select
            name="target_id"
            className="form-input"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            disabled={isBusy}
          >
            {targets.length === 0 && <option value="">（尚無 target，先去「通路與目標」建立）</option>}
            {targets.map((t) => (
              <option key={t.id} value={t.id}>
                [{t.channelCode}] {t.displayName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="模板（選填）" hint="不填 → 使用程式碼內建預設">
          <select name="template_code" className="form-input" disabled={isBusy} defaultValue="">
            <option value="">（使用預設）</option>
            {relevantTemplates.map((t) => (
              <option key={t.code} value={t.code}>
                {t.code}
              </option>
            ))}
          </select>
        </Field>

        <Field label="過濾規則（選填 JSON）" hint={`例：{"dealer_id":"xxx"}`}>
          <input
            name="filter_rules"
            className="form-input font-mono text-xs"
            placeholder='{}'
            disabled={isBusy}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <label className="inline-flex items-center gap-2 select-none">
          <input type="checkbox" name="is_active" value="true" defaultChecked disabled={isBusy} />
          啟用
        </label>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={isBusy || !targetId}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-on-primary disabled:opacity-60"
          style={{ backgroundColor: "#CC0000", color: "#FFFFFF" }}
        >
          {isBusy && <Spinner />}
          {isBusy ? "建立中…" : "建立訂閱"}
        </button>
        {error && <span className="text-sm text-error">⚠️ {error}</span>}
        {success && <span className="text-sm text-success">✓ 已建立</span>}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-on-surface-variant">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-0.5 block text-[11px] text-on-surface-variant">{hint}</span>}
    </label>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
