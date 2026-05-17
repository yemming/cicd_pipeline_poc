"use client";

import { useState, useTransition } from "react";
import {
  promoteCandidateAction,
  dismissCandidateAction,
} from "@/lib/notifications/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export interface CandidateView {
  id: string;
  channel_code: string;
  target_type: string;
  target_ref: string;
  discovered_via: string;
  display_name: string | null;
  source_user_id: string | null;
  last_message_text: string | null;
  last_seen_at: string;
  message_count: number;
}

const TYPE_LABEL: Record<string, string> = {
  user: "個人",
  group: "群組",
  room: "多人聊天",
};

const VIA_LABEL: Record<string, string> = {
  follow: "加好友",
  join: "邀進群",
  message: "訊息",
};

export function CandidatesSection({ candidates }: { candidates: CandidateView[] }) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#D5D3CB] bg-[#F8F7F4] p-6 text-center text-[#5A5955] text-[12.5px]">
        尚無新發現的對話。
        <span className="block mt-1 text-[11px] opacity-70">
          當有人加 Bot 好友、Bot 被邀進新群、或群裡有人傳訊息，這裡會自動列出來，按一鍵就能加入清單。
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-amber-300 bg-amber-50/50">
      <div className="px-4 py-2 bg-amber-100/70 text-[12px] font-semibold text-amber-900 flex items-center gap-2">
        <span className="material-symbols-outlined text-[16px]">search_insights</span>
        webhook 自動發現的對話 — 確認名稱後一鍵加入清單
      </div>
      <table className="w-full text-sm">
        <thead className="bg-amber-100/30 text-amber-900">
          <tr>
            <th className="px-3 py-2 text-left">類型</th>
            <th className="px-3 py-2 text-left">建議顯示名</th>
            <th className="px-3 py-2 text-left">來源</th>
            <th className="px-3 py-2 text-left">最後一句話 / Ref</th>
            <th className="px-3 py-2 text-left">最近</th>
            <th className="px-3 py-2 text-right">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-amber-200/60 bg-white">
          {candidates.map((c) => (
            <CandidateRow key={c.id} candidate={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: CandidateView }) {
  const [name, setName] = useState(candidate.display_name ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showDismiss, setShowDismiss] = useState(false);

  const promote = () => {
    setError(null);
    if (!name.trim()) {
      setError("請先填顯示名稱");
      return;
    }
    const fd = new FormData();
    fd.set("candidate_id", candidate.id);
    fd.set("display_name", name.trim());
    startTransition(async () => {
      try {
        await promoteCandidateAction(fd);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const doDismiss = () => {
    setShowDismiss(false);
    startTransition(async () => {
      try {
        await dismissCandidateAction(candidate.id);
      } catch (e) {
        setError("忽略失敗：" + (e as Error).message);
      }
    });
  };

  return (
    <tr className={pending ? "opacity-60" : ""}>
      <td className="px-3 py-2 align-top">
        <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 text-[11px] font-semibold">
          {TYPE_LABEL[candidate.target_type] ?? candidate.target_type}
        </span>
      </td>
      <td className="px-3 py-2 align-top">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={candidate.display_name ?? "請命名…"}
          disabled={pending}
          className="form-input w-48"
        />
        {error && <div className="mt-1 text-[11px] text-[#CC0000]">⚠️ {error}</div>}
      </td>
      <td className="px-3 py-2 align-top text-[12px] text-[#5A5955]">
        {VIA_LABEL[candidate.discovered_via] ?? candidate.discovered_via}
        {candidate.message_count > 1 && (
          <span className="ml-1 text-[11px] opacity-60">×{candidate.message_count}</span>
        )}
      </td>
      <td className="px-3 py-2 align-top max-w-[280px]">
        {candidate.last_message_text && (
          <div className="text-[12px] text-[#2C2C2A] line-clamp-2 break-words">
            「{candidate.last_message_text}」
          </div>
        )}
        <div
          className="font-mono text-[10px] text-[#5A5955] truncate mt-0.5"
          title={candidate.target_ref}
        >
          {candidate.target_ref}
        </div>
      </td>
      <td className="px-3 py-2 align-top text-[11px] text-[#5A5955] whitespace-nowrap">
        {formatTime(candidate.last_seen_at)}
      </td>
      <td className="px-3 py-2 align-top text-right whitespace-nowrap">
        <button
          type="button"
          onClick={promote}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded h-[26px] px-2.5 text-[11.5px] font-medium text-white bg-[#0F6E56] hover:bg-[#0a5742] disabled:opacity-50 mr-1"
        >
          {pending && (
            <span
              aria-hidden
              className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          )}
          {pending ? "加入中…" : "加入清單"}
        </button>
        <button
          type="button"
          onClick={() => setShowDismiss(true)}
          disabled={pending}
          className="inline-flex items-center rounded h-[26px] px-2.5 text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          忽略
        </button>
      </td>
      {showDismiss && (
        <td>
          <ConfirmDialog
            title="確定忽略這個候選？"
            message="之後 webhook 再看到一樣的會重出現。"
            confirmLabel="確認忽略"
            variant="primary"
            isPending={pending}
            onConfirm={doDismiss}
            onCancel={() => setShowDismiss(false)}
          />
        </td>
      )}
    </tr>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分前`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} 小時前`;
  return d.toLocaleString("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
