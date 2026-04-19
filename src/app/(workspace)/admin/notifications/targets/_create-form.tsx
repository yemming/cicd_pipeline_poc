"use client";

import { useState, useTransition } from "react";
import { createTargetAction } from "@/lib/notifications/actions";

interface ChannelOpt {
  id: string;
  code: string;
  displayName: string;
}

export function CreateTargetForm({ channels }: { channels: ChannelOpt[] }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [targetType, setTargetType] = useState<"user" | "group" | "webhook">("user");

  const currentChannel = channels.find((c) => c.id === channelId);

  // 根據 channel 自動建議 target_type
  const suggestedTypes: Array<"user" | "group" | "webhook"> =
    currentChannel?.code === "google-chat" ? ["webhook"] : ["user", "group"];

  async function onSubmit(fd: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await createTargetAction(fd);
        setSuccess(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const refPlaceholder =
    targetType === "webhook"
      ? "https://chat.googleapis.com/v1/spaces/.../messages?key=...&token=..."
      : targetType === "group"
        ? "Cxxxxxxxxxxxxxxxxxxx... (LINE groupId)"
        : "Uxxxxxxxxxxxxxxxxxxx... (LINE userId)";

  return (
    <form
      action={onSubmit}
      className={`rounded-lg border border-outline-variant bg-surface-container p-4 space-y-3 ${
        isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="通路">
          <select
            name="channel_id"
            className="form-input"
            value={channelId}
            onChange={(e) => {
              setChannelId(e.target.value);
              const newCh = channels.find((c) => c.id === e.target.value);
              if (newCh?.code === "google-chat") setTargetType("webhook");
              else if (targetType === "webhook") setTargetType("user");
            }}
            disabled={isPending}
          >
            {channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.displayName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="類型">
          <select
            name="target_type"
            className="form-input"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as "user" | "group" | "webhook")}
            disabled={isPending}
          >
            {suggestedTypes.map((t) => (
              <option key={t} value={t}>
                {t === "user" ? "個人 (user)" : t === "group" ? "群組 (group)" : "Webhook"}
              </option>
            ))}
          </select>
        </Field>

        <Field label="顯示名稱" hint="後台列表用">
          <input
            type="text"
            name="display_name"
            className="form-input"
            placeholder="例：售服部群組"
            required
            disabled={isPending}
          />
        </Field>

        <Field label="Target ref" hint={refPlaceholder}>
          <input
            type="text"
            name="target_ref"
            className="form-input font-mono text-xs"
            placeholder={refPlaceholder}
            required
            disabled={isPending}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-60"
          style={{ backgroundColor: "#CC0000", color: "#FFFFFF" }}
        >
          {isPending && <Spinner />}
          {isPending ? "建立中…" : "建立目標"}
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
