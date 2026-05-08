"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  escalateLoopEntryAction,
  resolveLoopEntryAction,
} from "@/lib/parts-setup/workorder-loop-actions";

export type LoopEntry = {
  id: string;
  ro_no: string;
  missing_parts: string;
  sa_name: string | null;
  shortage_reason: string | null;
  po_no: string | null;
  eta_label: string | null;
  days_pending: number;
  status: string;
  is_overdue: boolean;
  sort_order: number;
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  escalated: "bg-[#FDECEA] text-[#CC0000]",
  resolved: "bg-[#EAF3DE] text-[#3B6D11]",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待料中",
  escalated: "逾期待料",
  resolved: "已解除",
};

const FLOW_STEPS: Array<{
  icon: string;
  label: string;
  sub: string;
  color: string;
}> = [
  { icon: "🔧", label: "SA 領料", sub: "工單出庫\n庫存不足", color: "border-[#CC0000] bg-[#FDECEA] text-[#CC0000]" },
  { icon: "⚡", label: "缺料告警", sub: "工單進入\n「待料」狀態", color: "border-[#CC0000] bg-[#FDECEA] text-[#CC0000]" },
  { icon: "📋", label: "自動建需求", sub: "系統自動建立\n緊急補貨需求", color: "border-[#854F0B] bg-[#FDF3E3] text-[#854F0B]" },
  { icon: "🛒", label: "採購審核", sub: "主管審核\n緊急採購單", color: "border-[#1A3A5C] bg-[#EBF3FF] text-[#1A3A5C]" },
  { icon: "📥", label: "備件到庫", sub: "採購入庫\n庫存更新", color: "border-[#0F6E56] bg-[#E8F5F0] text-[#0F6E56]" },
  { icon: "✅", label: "自動解除", sub: "待料解除\nSA LINE 通知", color: "border-[#3B6D11] bg-[#EAF3DE] text-[#3B6D11]" },
];

type Banner = { ok: boolean; msg: string } | null;

export function WorkorderLoopBoard({
  entries,
  canEdit,
}: {
  entries: LoopEntry[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const resolve = (id: string, ro: string) => {
    startTransition(async () => {
      const res = await resolveLoopEntryAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${ro} 待料已解除` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const escalate = (id: string, ro: string) => {
    startTransition(async () => {
      const res = await escalateLoopEntryAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${ro} 已標記催單` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const pendingCount = entries.filter(
    (e) => e.status === "pending" || e.status === "escalated",
  ).length;

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">工單增項閉環</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          10.4
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          維修工單缺料後的自動補貨觸發、待料解除、SA 通知完整閉環
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

      <section className="rounded-md border border-[#E1E1E1] bg-white p-4">
        <h2 className="text-[13px] font-semibold mb-3">🔄 工單缺料完整閉環流程</h2>
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {FLOW_STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-1">
              <div className="flex flex-col items-center gap-1 min-w-[90px]">
                <div
                  className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-[18px] ${s.color}`}
                >
                  {s.icon}
                </div>
                <div className="text-[11px] font-semibold text-center">{s.label}</div>
                <div className="text-[10px] text-[#888] text-center whitespace-pre-line">
                  {s.sub}
                </div>
              </div>
              {i < FLOW_STEPS.length - 1 ? (
                <span className="text-[#bbb] text-[20px] mb-4">→</span>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className={`rounded-md border border-[#E1E1E1] bg-white ${lockedClass}`}>
        <header className="px-4 py-3 border-b border-[#E1E1E1] flex items-center gap-2 text-[13px]">
          <span>
            目前待料工單（<b className="text-[#CC0000]">{pendingCount}</b> 筆）
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">工單號</th>
                <th className="px-3 py-2 text-left">缺料備件</th>
                <th className="px-3 py-2 text-left">SA 人員</th>
                <th className="px-3 py-2 text-left">待料原因</th>
                <th className="px-3 py-2 text-left">補貨單號</th>
                <th className="px-3 py-2 text-left">預計到貨</th>
                <th className="px-3 py-2 text-left">待料天數</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className={e.is_overdue ? "bg-[#FFF9F0]" : ""}>
                  <td className="px-3 py-2 font-mono text-[#1A3A5C]">{e.ro_no}</td>
                  <td className="px-3 py-2">{e.missing_parts}</td>
                  <td className="px-3 py-2">{e.sa_name ?? "—"}</td>
                  <td className="px-3 py-2">{e.shortage_reason ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[#0F6E56]">{e.po_no ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-[#854F0B]">{e.eta_label ?? "—"}</td>
                  <td
                    className={`px-3 py-2 font-mono ${
                      e.is_overdue ? "text-[#CC0000]" : "text-[#854F0B]"
                    }`}
                  >
                    {`${e.days_pending} 天`}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        STATUS_BADGE[e.status] ?? STATUS_BADGE.pending
                      }`}
                    >
                      {STATUS_LABEL[e.status] ?? e.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1">
                    {e.status !== "resolved" ? (
                      <>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => resolve(e.id, e.ro_no)}
                          className="px-2 py-1 text-[11.5px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
                        >
                          到庫解除
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => escalate(e.id, e.ro_no)}
                          className="px-2 py-1 text-[11.5px] rounded border border-[#E1E1E1] disabled:opacity-50"
                        >
                          催單
                        </button>
                      </>
                    ) : (
                      <span className="text-[11px] text-[#888]">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[#888]">
                    目前無待料工單
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
