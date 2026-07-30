"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  promoteCandidateAction,
  dismissCandidateAction,
  reviveCandidateAction,
} from "@/lib/notifications/actions";

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
  message: "傳訊息",
  manual: "手動登記",
};

export function CandidatesSection({ candidates }: { candidates: CandidateView[] }) {
  if (candidates.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[#D5D3CB] bg-[#F8F7F4] p-6 text-center text-[12.5px] text-[#5A5955]">
        目前沒有新發現的對話。
        <span className="mt-1 block text-[11px] text-[#9A9890]">
          把「DealerOS Notifier」官方帳號加入要接收通知的 LINE 群組，並在群組裡發一則任意訊息，
          幾秒後這裡就會自動列出候選，不需要手動輸入任何技術 ID。
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[#F0DDB0] bg-[#FDF3E3]">
      <div className="flex items-center gap-2 bg-[#FBEAC6] px-4 py-2 text-[12px] font-semibold text-[#854F0B]">
        <span className="material-symbols-outlined text-[16px]">search_insights</span>
        自動發現的對話 — 幫它取個名字，按「升級為正式目標」就能開始收通知
      </div>
      <div className="divide-y divide-[#F0DDB0] bg-white">
        {candidates.map((c) => (
          <CandidateRow key={c.id} candidate={c} />
        ))}
      </div>
    </div>
  );
}

function CandidateRow({ candidate }: { candidate: CandidateView }) {
  const router = useRouter();
  const [name, setName] = useState(candidate.display_name ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const promote = () => {
    setError(null);
    if (!name.trim()) {
      setError("請先幫這個對話取個名稱");
      return;
    }
    const fd = new FormData();
    fd.set("candidate_id", candidate.id);
    fd.set("display_name", name.trim());
    startTransition(async () => {
      try {
        await promoteCandidateAction(fd);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const doDismiss = () => {
    if (!window.confirm("確定忽略這個對話？之後對方再傳訊息會重新出現在這裡。")) return;
    setError(null);
    startTransition(async () => {
      try {
        await dismissCandidateAction(candidate.id);
        setDismissed(true);
        router.refresh();
      } catch (e) {
        setError("忽略失敗：" + (e instanceof Error ? e.message : String(e)));
      }
    });
  };

  const doRevive = () => {
    setError(null);
    startTransition(async () => {
      try {
        await reviveCandidateAction(candidate.id);
        setDismissed(false);
        router.refresh();
      } catch (e) {
        setError("復原失敗：" + (e instanceof Error ? e.message : String(e)));
      }
    });
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-3 px-4 py-2.5 text-[12.5px] ${
        pending ? "opacity-60" : ""
      } ${dismissed ? "bg-[#F8F7F4]" : ""}`}
    >
      <span className="inline-flex items-center whitespace-nowrap rounded-md bg-[#FDF3E3] px-1.5 py-0.5 text-[11px] font-semibold text-[#854F0B]">
        {TYPE_LABEL[candidate.target_type] ?? candidate.target_type}
      </span>

      <div className="min-w-[160px] flex-1">
        {dismissed ? (
          <div className="text-[#9A9890]">{candidate.display_name || "（未命名對話）"}</div>
        ) : (
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="請命名，例如：售服部群組"
            disabled={pending}
            className="h-[28px] w-56 rounded border border-[#D5D3CB] bg-white px-2 text-[12.5px] outline-none focus:border-[#185FA5] disabled:opacity-60"
          />
        )}
      </div>

      <div className="min-w-[110px] text-[11.5px] text-[#5A5955]">
        {VIA_LABEL[candidate.discovered_via] ?? candidate.discovered_via}
        {candidate.message_count > 1 && (
          <span className="ml-1 text-[11px] text-[#9A9890]">×{candidate.message_count}</span>
        )}
      </div>

      {candidate.last_message_text && (
        <div className="min-w-[160px] max-w-[260px] flex-1 truncate text-[11.5px] text-[#5A5955]" title={candidate.last_message_text}>
          「{candidate.last_message_text}」
        </div>
      )}

      <div className="whitespace-nowrap text-[11px] text-[#9A9890]">{formatTime(candidate.last_seen_at)}</div>

      <div className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
        {dismissed ? (
          <>
            <span className="text-[11.5px] text-[#9A9890]">已忽略</span>
            <button
              type="button"
              onClick={doRevive}
              disabled={pending}
              className="h-[26px] rounded border border-[#D5D3CB] bg-white px-2.5 text-[11.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {pending ? "復原中…" : "復原"}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={promote}
              disabled={pending}
              className="h-[26px] rounded bg-[#0F6E56] px-2.5 text-[11.5px] font-medium text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {pending ? "升級中…" : "升級為正式目標"}
            </button>
            <button
              type="button"
              onClick={doDismiss}
              disabled={pending}
              className="h-[26px] rounded border border-[#D5D3CB] bg-white px-2.5 text-[11.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              忽略
            </button>
          </>
        )}
      </div>

      {error && <div className="w-full text-[11px] text-[#CC0000]">⚠️ {error}</div>}
    </div>
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
