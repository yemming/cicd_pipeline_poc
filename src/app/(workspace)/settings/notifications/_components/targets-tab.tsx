"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTargetAction, deleteTargetAction, toggleTargetActiveAction } from "@/lib/notifications/actions";
import { CandidatesSection, type CandidateView } from "./candidates-section";
import { targetTypeLabel, truncateRef } from "./format";

export interface ChannelOpt {
  id: string;
  code: string;
  displayName: string;
}

export interface TargetRow {
  id: string;
  channel_code: string;
  target_type: string;
  display_name: string;
  target_ref: string;
  is_active: boolean;
}

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] disabled:opacity-60";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function TargetsTab({
  channels,
  targets,
  candidates,
}: {
  channels: ChannelOpt[];
  targets: TargetRow[];
  candidates: CandidateView[];
}) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-1 text-[13px] font-semibold text-[#2C2C2A]">
          新發現的對話
          {candidates.length > 0 && (
            <span className="ml-2 inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#854F0B] px-1.5 align-middle text-[11px] font-bold text-white">
              {candidates.length}
            </span>
          )}
        </h3>
        <p className="mb-2 text-[11.5px] text-[#9A9890]">
          這是解決「LINE 群組 ID 從哪來」最簡單的方式：把 DealerOS Notifier 官方帳號加進要接收通知的 LINE
          群組，並在群組裡發一則任意訊息，幾秒後系統會自動記錄成候選對話，按一下就能升級成正式目標，完全不需要手動輸入任何技術 ID。
        </p>
        <CandidatesSection candidates={candidates} />
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-[#2C2C2A]">手動新增接收目標</h3>
        <CreateTargetForm channels={channels} />
      </section>

      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-[#2C2C2A]">目前的接收目標（{targets.length}）</h3>
        <TargetsList rows={targets} />
      </section>
    </div>
  );
}

function CreateTargetForm({ channels }: { channels: ChannelOpt[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [targetType, setTargetType] = useState<"user" | "group" | "webhook">("user");

  const currentChannel = channels.find((c) => c.id === channelId);
  const suggestedTypes: Array<"user" | "group" | "webhook"> =
    currentChannel?.code === "google-chat" ? ["webhook"] : ["user", "group"];

  async function onSubmit(fd: FormData) {
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await createTargetAction(fd);
        setSuccess(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  const refHint =
    targetType === "webhook"
      ? "在 Google Chat 空間設定裡新增「Webhook」取得的網址，整段貼上即可。"
      : targetType === "group"
        ? "LINE 群組 ID，可請該群組管理員在 LINE 群組設定裡取得；更推薦直接用上方「新發現的對話」選取，不用手動查。"
        : "LINE 個人 userId；同樣建議優先用上方「新發現的對話」直接選取。";

  return (
    <form
      action={onSubmit}
      className={`space-y-3 rounded-lg border border-[#EEECE6] bg-white p-4 ${
        isPending ? "pointer-events-none opacity-60" : ""
      }`}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="通路">
          <select
            name="channel_id"
            className={inputClass}
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
            className={inputClass}
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as "user" | "group" | "webhook")}
            disabled={isPending}
          >
            {suggestedTypes.map((t) => (
              <option key={t} value={t}>
                {t === "user" ? "個人（user）" : t === "group" ? "群組（group）" : "Webhook"}
              </option>
            ))}
          </select>
        </Field>

        <Field label="顯示名稱" hint="後台列表用，取好記的名字，例如「售服部群組」">
          <input
            type="text"
            name="display_name"
            className={inputClass}
            placeholder="例：售服部群組"
            required
            disabled={isPending}
          />
        </Field>

        <Field label="目標 ID / Webhook 網址" hint={refHint}>
          <input
            type="text"
            name="target_ref"
            className={`${inputClass} font-mono`}
            placeholder={targetType === "webhook" ? "https://chat.googleapis.com/…" : "Uxxxx… / Cxxxx…"}
            required
            disabled={isPending}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-[30px] items-center gap-2 rounded bg-[#0F6E56] px-3.5 text-[12.5px] font-medium text-white hover:bg-[#0a5742] disabled:opacity-60"
        >
          {isPending && <Spinner />}
          {isPending ? "建立中…" : "＋ 建立目標"}
        </button>
        {error && <span className="text-[12.5px] text-[#CC0000]">⚠️ {error}</span>}
        {success && <span className="text-[12.5px] text-[#3B6D11]">✓ 已建立</span>}
      </div>
    </form>
  );
}

function TargetsList({ rows }: { rows: TargetRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#D5D3CB] bg-[#F8F7F4] p-6 text-center text-[12.5px] text-[#9A9890]">
        尚無接收目標，先在上方新增一個。
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#EEECE6] bg-white">
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
            <tr>
              <th className="px-4 py-2 text-left font-medium">名稱</th>
              <th className="px-4 py-2 text-left font-medium">類型</th>
              <th className="px-4 py-2 text-left font-medium">狀態</th>
              <th className="px-4 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EEECE6]">
            {rows.map((r) => (
              <TargetTableRow key={r.id} row={r} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TargetTableRow({ row }: { row: TargetRow }) {
  const router = useRouter();
  const [isToggling, startToggle] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = isToggling || isDeleting;

  const toggle = () => {
    setError(null);
    startToggle(async () => {
      try {
        await toggleTargetActiveAction(row.id, !row.is_active);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const remove = () => {
    if (!window.confirm(`確定刪除「${row.display_name}」這個接收目標？相關的事件訂閱會一起消失，無法復原。`)) return;
    setError(null);
    startDelete(async () => {
      try {
        await deleteTargetAction(row.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <tr className={busy ? "opacity-60" : ""}>
      <td className="px-4 py-2.5 align-top">
        <div className="font-medium text-[#2C2C2A]">{row.display_name}</div>
        <div className="mt-0.5 font-mono text-[10.5px] text-[#9A9890]" title={row.target_ref}>
          {truncateRef(row.target_ref)}
        </div>
        {error && <div className="mt-1 text-[11px] text-[#CC0000]">⚠️ {error}</div>}
      </td>
      <td className="px-4 py-2.5 align-top text-[#5A5955]">{targetTypeLabel(row.channel_code, row.target_type)}</td>
      <td className="px-4 py-2.5 align-top">
        {row.is_active ? (
          <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#EAF3DE] px-1.5 py-0.5 text-[11px] text-[#3B6D11]">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#F2F2F2] px-1.5 py-0.5 text-[11px] text-[#6B6A68]">
            停用
          </span>
        )}
      </td>
      <td className="px-4 py-2.5 align-top text-right">
        <div className="inline-flex gap-1.5">
          <button
            type="button"
            onClick={toggle}
            disabled={busy}
            className="h-[26px] rounded border border-[#D5D3CB] bg-white px-2.5 text-[11.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            {isToggling ? "切換中…" : row.is_active ? "停用" : "啟用"}
          </button>
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            className="h-[26px] rounded border border-[#F5AEAD] bg-[#FDECEA] px-2.5 text-[11.5px] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
          >
            {isDeleting ? "刪除中…" : "刪除"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="mt-0.5 block text-[11px] text-[#9A9890]">{hint}</span>}
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
