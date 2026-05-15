"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  type CaseSafetyLevel,
  type CaseStatus,
  type FollowupCaseWithRo,
  type FollowupEventRow,
  type FollowupEventType,
} from "@/domain/followup-cases";
import {
  addNoteAction,
  closeLostAction,
  logSaContactAction,
  markCustomerAgreedAction,
  markLongTermAction,
  markSupervisorIntervenedAction,
  sendLineReminderAction,
} from "@/lib/aftersales/followup-case-actions";

type Banner = { ok: boolean; msg: string } | null;

const statusLabel: Record<CaseStatus, string> = {
  tracking: "追蹤中",
  escalated: "主管介入",
  long_term: "長期追蹤",
  closed_won: "已閉環",
  closed_lost: "已結案（未修）",
};

const statusChip: Record<CaseStatus, string> = {
  tracking: "bg-[#FDF3E3] text-[#854F0B]",
  escalated: "bg-[#FDECEA] text-[#CC0000]",
  long_term: "bg-[#F2F2F2] text-[#6B6A68]",
  closed_won: "bg-[#EAF3DE] text-[#3B6D11]",
  closed_lost: "bg-[#EBF3FF] text-[#1A3A5C]",
};

const safetyLabel: Record<CaseSafetyLevel, string> = {
  normal: "一般建議",
  safety_related: "⚠️ 安全相關",
  safety_critical: "🔴 安全警示",
};

const safetyChip: Record<CaseSafetyLevel, string> = {
  normal: "bg-[#F2F2F2] text-[#6B6A68]",
  safety_related: "bg-[#FDF3E3] text-[#854F0B]",
  safety_critical: "bg-[#FDECEA] text-[#CC0000]",
};

const eventTypeLabel: Record<FollowupEventType, string> = {
  created: "建立追蹤",
  sa_contact: "SA 聯繫",
  supervisor_intervene: "🔴 主管介入",
  customer_agreed: "✅ 車主同意",
  long_term_marked: "轉長期追蹤",
  closed_lost: "❌ 結案（未修）",
  line_reminder: "Line 提醒",
  note: "備註",
};

const eventDot: Record<FollowupEventType, string> = {
  created: "bg-[#EAF3DE] text-[#3B6D11]",
  sa_contact: "bg-[#EAF4FB] text-[#185FA5]",
  supervisor_intervene: "bg-[#FDECEA] text-[#CC0000]",
  customer_agreed: "bg-[#EAF3DE] text-[#3B6D11]",
  long_term_marked: "bg-[#F2F2F2] text-[#6B6A68]",
  closed_lost: "bg-[#FDECEA] text-[#CC0000]",
  line_reminder: "bg-[#EAF4FB] text-[#185FA5]",
  note: "bg-[#F2F2F2] text-[#6B6A68]",
};

const fmtMoney = (n: number) => {
  const v = Math.round(n);
  // 千分位手動加（避免 toLocaleString locale 差異 hydration mismatch）
  return `NT$${v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};
const pad = (n: number) => n.toString().padStart(2, "0");
const fmtDateTime = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fmtDateOnly = (s: string | null) => {
  if (!s) return "—";
  const d = new Date(s);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function FollowupCaseDetail({
  caseRow,
  events,
  canEdit,
}: {
  caseRow: FollowupCaseWithRo;
  events: FollowupEventRow[];
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: caseRow.title,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "增項閉環", href: "/parts/aftersales/followups" },
      { label: caseRow.case_no },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [activeModal, setActiveModal] = useState<
    null | "sa_contact" | "supervisor" | "agreed" | "long_term" | "closed_lost" | "note" | "line"
  >(null);

  const isClosed = caseRow.status === "closed_won" || caseRow.status === "closed_lost";

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const handleAction = async (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    startTransition(async () => {
      const res = await fn();
      if ("ok" in res && res.ok) {
        showBanner({ ok: true, msg: okMsg });
        setActiveModal(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error ?? "操作失敗" });
      }
    });
  };

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + 操作 pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/aftersales/followups"
            className="hover:text-[#185FA5]"
          >
            增項閉環
          </Link>
          <span>›</span>
          <span className="font-mono text-[#5A5955]">{caseRow.case_no}</span>
          {isClosed && (
            <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF3DE] text-[#3B6D11] font-medium ml-1">
              已結案
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/followups"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回看板
          </Link>
          {canEdit && !isClosed && (
            <>
              <button
                onClick={() => setActiveModal("sa_contact")}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                記錄聯繫
              </button>
              <button
                onClick={() => setActiveModal("agreed")}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                ✅ 車主同意
              </button>
              {caseRow.safety_level !== "normal" && (
                <button
                  onClick={() => setActiveModal("supervisor")}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                >
                  🔴 主管介入
                </button>
              )}
              <button
                onClick={() => setActiveModal("long_term")}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                長期追蹤
              </button>
              <button
                onClick={() => setActiveModal("closed_lost")}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                結案
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                增項閉環追蹤 · 來源工單 {caseRow.ro?.ro_code ?? "—"}
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {caseRow.title}
              </h1>
              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{caseRow.case_no}</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${safetyChip[caseRow.safety_level]}`}
                >
                  {safetyLabel[caseRow.safety_level]}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusChip[caseRow.status]}`}
                >
                  {statusLabel[caseRow.status]}
                </span>
              </div>
            </div>
            {canEdit && !isClosed && (
              <div className="flex gap-1.5 mt-1 flex-wrap">
                <button
                  onClick={() => setActiveModal("line")}
                  disabled={isPending}
                  className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  發 Line 提醒
                </button>
                <button
                  onClick={() => setActiveModal("note")}
                  disabled={isPending}
                  className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  加備註
                </button>
              </div>
            )}
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-[#9A9890]">估計金額</div>
            <div className="text-[24px] font-bold text-[#1A3A5C]">
              {fmtMoney(Number(caseRow.estimated_fee))}
            </div>
            {caseRow.status === "closed_won" && Number(caseRow.recovered_amount) > 0 && (
              <div className="text-[11px] text-[#3B6D11] mt-1">
                已回收 {fmtMoney(Number(caseRow.recovered_amount))}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 基本資料 KV */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="車主" value={caseRow.customer_name ?? "—"} />
          <Kv label="車型" value={caseRow.vehicle_model ?? "—"} />
          <Kv label="車牌" value={caseRow.vehicle_license_plate ?? "—"} mono />
          <Kv label="負責 SA" value={caseRow.sa_name ?? "—"} />
          <Kv label="來源工單" value={caseRow.ro?.ro_code ?? "—"} mono />
          <Kv label="建立時間" value={fmtDateTime(caseRow.created_at)} />
          <Kv label="最近聯繫" value={fmtDateTime(caseRow.last_contacted_at)} />
          <Kv label="下次聯繫" value={fmtDateOnly(caseRow.next_contact_at)} />
          <Kv label="結案時間" value={fmtDateTime(caseRow.closed_at)} />
        </div>
      </section>

      {/* 時間軸 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 追蹤時間軸（{events.length} 筆）
          </span>
        </header>
        <div className="px-4 py-4">
          {events.length === 0 ? (
            <div className="text-[12px] text-[#9A9890] py-4 text-center">尚無事件</div>
          ) : (
            <div className="space-y-3">
              {events.map((e) => (
                <div key={e.id} className="flex gap-3">
                  <div className="shrink-0">
                    <div
                      className={`w-[28px] h-[28px] rounded-full inline-flex items-center justify-center text-[10px] font-semibold ${eventDot[e.event_type]}`}
                    >
                      {e.event_type === "created"
                        ? "D0"
                        : e.event_type === "sa_contact"
                          ? "SA"
                          : e.event_type === "supervisor_intervene"
                            ? "主"
                            : e.event_type === "customer_agreed"
                              ? "✓"
                              : e.event_type === "long_term_marked"
                                ? "長"
                                : e.event_type === "closed_lost"
                                  ? "✕"
                                  : e.event_type === "line_reminder"
                                    ? "L"
                                    : "·"}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12.5px] font-semibold">
                      {eventTypeLabel[e.event_type]}
                      {e.acted_by_name && (
                        <span className="ml-2 text-[11px] text-[#9A9890] font-normal">
                          · {e.acted_by_name}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">
                      {fmtDateTime(e.occurred_at)}
                    </div>
                    {e.body && (
                      <div className="text-[12px] text-[#2C2C2A] mt-1.5 bg-[#F8F7F4] rounded px-2.5 py-1.5">
                        {e.body}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* Modals */}
      {activeModal === "sa_contact" && (
        <SaContactModal
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSubmit={(outcome, body) =>
            handleAction(() => logSaContactAction(caseRow.id, { outcome, body }), "✓ 已記錄聯繫")
          }
        />
      )}
      {activeModal === "supervisor" && (
        <BodyModal
          title="主管介入紀錄"
          placeholder="主管聯繫結果、客戶反應、後續處置..."
          submitLabel="存檔（轉主管介入）"
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSubmit={(body) =>
            handleAction(
              () => markSupervisorIntervenedAction(caseRow.id, body),
              "✓ 已記錄主管介入",
            )
          }
        />
      )}
      {activeModal === "agreed" && (
        <BodyModal
          title="✅ 車主同意 → 建立預約"
          placeholder="預約日期、車主備註..."
          submitLabel="標記為已閉環"
          submitColor="green"
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSubmit={(body) =>
            handleAction(
              () =>
                markCustomerAgreedAction(caseRow.id, {
                  body,
                  recovered_amount: Number(caseRow.estimated_fee),
                }),
              "✓ 案件已閉環",
            )
          }
        />
      )}
      {activeModal === "long_term" && (
        <BodyModal
          title="轉為長期追蹤"
          placeholder="長期追蹤原因、下次回廠時提醒..."
          submitLabel="轉長期追蹤"
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSubmit={(body) =>
            handleAction(() => markLongTermAction(caseRow.id, body), "✓ 已轉長期追蹤")
          }
        />
      )}
      {activeModal === "closed_lost" && (
        <BodyModal
          title="結案（未修）"
          placeholder="必填：結案原因（如已換店、已自行處理、聯繫不上）..."
          submitLabel="確認結案"
          submitColor="red"
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSubmit={(body) =>
            handleAction(() => closeLostAction(caseRow.id, body), "✓ 案件已結案")
          }
        />
      )}
      {activeModal === "line" && (
        <BodyModal
          title="發 Line 提醒"
          placeholder="提醒文案內容..."
          submitLabel="送出（紀錄）"
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSubmit={(body) =>
            handleAction(() => sendLineReminderAction(caseRow.id, body), "✓ 已紀錄 Line 提醒")
          }
        />
      )}
      {activeModal === "note" && (
        <BodyModal
          title="加備註"
          placeholder="備註內容..."
          submitLabel="新增"
          isPending={isPending}
          onClose={() => setActiveModal(null)}
          onSubmit={(body) =>
            handleAction(() => addNoteAction(caseRow.id, body), "✓ 已新增備註")
          }
        />
      )}
    </main>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function SaContactModal({
  isPending,
  onClose,
  onSubmit,
}: {
  isPending: boolean;
  onClose: () => void;
  onSubmit: (
    outcome: "reached" | "no_answer" | "left_message" | "agreed" | "declined",
    body: string,
  ) => void;
}) {
  const [outcome, setOutcome] = useState<"reached" | "no_answer" | "left_message" | "agreed" | "declined">(
    "no_answer",
  );
  const [body, setBody] = useState("");
  return (
    <Modal title="記錄 SA 聯繫" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] text-[#9A9890] font-medium">結果</label>
          <select
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as typeof outcome)}
            disabled={isPending}
            className="w-full h-[32px] mt-1 border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
          >
            <option value="reached">接通了</option>
            <option value="no_answer">未接通</option>
            <option value="left_message">留言請回電</option>
            <option value="agreed">車主同意</option>
            <option value="declined">車主拒絕</option>
          </select>
        </div>
        <div>
          <label className="text-[11px] text-[#9A9890] font-medium">聯繫摘要</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={isPending}
            rows={3}
            placeholder="車主反應、後續安排..."
            className="w-full mt-1 border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60 resize-none"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <button
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
        >
          取消
        </button>
        <button
          onClick={() => onSubmit(outcome, body)}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
        >
          {isPending ? "儲存中⋯" : "儲存"}
        </button>
      </div>
    </Modal>
  );
}

function BodyModal({
  title,
  placeholder,
  submitLabel,
  submitColor = "navy",
  isPending,
  onClose,
  onSubmit,
}: {
  title: string;
  placeholder: string;
  submitLabel: string;
  submitColor?: "navy" | "green" | "red";
  isPending: boolean;
  onClose: () => void;
  onSubmit: (body: string) => void;
}) {
  const [body, setBody] = useState("");
  const colors = {
    navy: "bg-[#1A3A5C] text-white hover:bg-[#0F2A45]",
    green: "bg-[#0F6E56] text-white hover:bg-[#0a5742]",
    red: "bg-[#CC0000] text-white hover:bg-[#a30000]",
  } as const;
  return (
    <Modal title={title} onClose={onClose}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={isPending}
        rows={4}
        placeholder={placeholder}
        className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60 resize-none"
      />
      <div className="flex gap-2 justify-end mt-4">
        <button
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
        >
          取消
        </button>
        <button
          onClick={() => onSubmit(body)}
          disabled={isPending}
          className={`h-[30px] px-3.5 rounded text-[12.5px] font-medium disabled:opacity-60 ${colors[submitColor]}`}
        >
          {isPending ? "儲存中⋯" : submitLabel}
        </button>
      </div>
    </Modal>
  );
}

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-5 max-w-[480px] w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[14px] font-semibold mb-3">{title}</h3>
        {children}
      </div>
    </div>
  );
}
