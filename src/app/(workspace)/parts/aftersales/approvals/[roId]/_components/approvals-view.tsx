"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { ApprovalRecord } from "@/domain/aftersales-approvals.constants";
import { SCENARIO_LABEL } from "@/domain/aftersales-approvals.constants";
import { decideApprovalAction, requestWarrantyGraceAction } from "../actions";

type Props = {
  roId: string;
  roCode: string;
  customerName: string | null;
  approvals: ApprovalRecord[];
  canDecide: boolean;   // is_dept_manager || is_cross_admin
  canRequest: boolean;  // RO_CLOSE permission
};

type Banner = { ok: boolean; msg: string } | null;

function fmtDatetime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}

function StatusChip({ status }: { status: "pending" | "approved" | "rejected" }) {
  const map = {
    pending:  "bg-[#FDF3E3] text-[#854F0B]",
    approved: "bg-[#EAF3DE] text-[#3B6D11]",
    rejected: "bg-[#FDECEA] text-[#CC0000]",
  };
  const label = { pending: "待審", approved: "已核准", rejected: "已拒絕" };
  return (
    <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${map[status]}`}>
      {label[status]}
    </span>
  );
}

export function ApprovalsView({
  roId,
  roCode,
  customerName,
  approvals,
  canDecide,
  canRequest,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("approval");

  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // 決定 Modal 狀態
  const [decideModal, setDecideModal] = useState<{
    record: ApprovalRecord;
    decision: "approved" | "rejected";
  } | null>(null);
  const [decideReason, setDecideReason] = useState("");

  // 保固通融申請 Modal 狀態
  const [warrantyModal, setWarrantyModal] = useState(false);
  const [warrantyNotes, setWarrantyNotes] = useState("");

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function openDecideModal(record: ApprovalRecord, decision: "approved" | "rejected") {
    setDecideReason("");
    setDecideModal({ record, decision });
  }

  function doDecide() {
    if (!decideModal) return;
    if (!decideReason.trim()) {
      showBanner({ ok: false, msg: "請填寫決定說明（稽核必填）" });
      return;
    }
    const { record, decision } = decideModal;
    setDecideModal(null);
    startTransition(async () => {
      const res = await decideApprovalAction({
        ro_id: roId,
        approval_id: record.id,
        decision,
        reason: decideReason.trim(),
      });
      if (res.ok) {
        showBanner({
          ok: true,
          msg: decision === "approved" ? "✓ 已核准，SA 將收到通知" : "✓ 已拒絕，SA 將收到通知",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function doWarrantyRequest() {
    if (!warrantyNotes.trim()) {
      showBanner({ ok: false, msg: "請填寫申請說明" });
      return;
    }
    setWarrantyModal(false);
    startTransition(async () => {
      const res = await requestWarrantyGraceAction(roId, warrantyNotes.trim());
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 保固通融申請已送出，主管將收到通知" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="px-6 py-5 space-y-4">
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

      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">主管授權記錄</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RP5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          工單 {roCode}｜{customerName ?? "（無客戶）"}
        </span>
        {canRequest && (
          <div className="ml-auto">
            <button
              onClick={() => {
                setWarrantyNotes("");
                setWarrantyModal(true);
              }}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 申請保固通融
            </button>
          </div>
        )}
      </header>

      {/* 說明卡 */}
      {approvals.length === 0 && (
        <div className="bg-white border border-[#EEECE6] rounded-lg px-5 py-8 text-center">
          <p className="text-[13px] text-[#9A9890]">此工單目前無授權申請記錄。</p>
          {canRequest && (
            <p className="text-[12px] text-[#9A9890] mt-1">
              折扣超限時系統自動送審；或點上方「申請保固通融」手動送出。
            </p>
          )}
        </div>
      )}

      {/* 授權記錄列表 */}
      {approvals.map((rec) => {
        const isHighlight = rec.id === highlightId;
        return (
          <div
            key={rec.id}
            className={`bg-white border rounded-lg overflow-hidden ${
              isHighlight ? "border-[#1A3A5C] ring-2 ring-[#1A3A5C]/20" : "border-[#EEECE6]"
            }`}
          >
            {/* 卡頭 */}
            <div className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-3">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                {SCENARIO_LABEL[rec.scenario]}
              </span>
              <StatusChip status={rec.status} />
              <span className="text-[11px] text-[#9A9890] ml-auto">
                申請時間：{fmtDatetime(rec.requested_at)}
              </span>
            </div>

            {/* 卡身 */}
            <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
              <div>
                <div className="text-[11px] text-[#9A9890]">申請人</div>
                <div className="text-[#2C2C2A] font-medium mt-0.5">
                  {rec.requester_name ?? "（未知）"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#9A9890]">申請說明</div>
                <div className="text-[#2C2C2A] mt-0.5">{rec.notes ?? "—"}</div>
              </div>
              {Object.keys(rec.context).length > 0 && (
                <div>
                  <div className="text-[11px] text-[#9A9890]">情境資料</div>
                  <div className="text-[#5A5955] mt-0.5 font-mono text-[11px] whitespace-pre-wrap">
                    {JSON.stringify(rec.context, null, 2)}
                  </div>
                </div>
              )}
              {rec.status !== "pending" && (
                <div>
                  <div className="text-[11px] text-[#9A9890]">
                    {rec.status === "approved" ? "核准人" : "拒絕人"}
                  </div>
                  <div className="text-[#2C2C2A] font-medium mt-0.5">
                    {rec.decider_name ?? "（未知）"}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">決定時間</div>
                  <div className="text-[#5A5955] mt-0.5">{fmtDatetime(rec.decided_at)}</div>
                  {rec.decision_reason && (
                    <>
                      <div className="text-[11px] text-[#9A9890] mt-1">說明</div>
                      <div className="text-[#2C2C2A] mt-0.5">{rec.decision_reason}</div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* 主管操作列 */}
            {rec.status === "pending" && canDecide && (
              <div className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
                <span className="text-[12px] text-[#854F0B] font-medium mr-auto">
                  待您審批
                </span>
                <button
                  onClick={() => openDecideModal(rec, "approved")}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                >
                  核准
                </button>
                <button
                  onClick={() => openDecideModal(rec, "rejected")}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  拒絕
                </button>
              </div>
            )}
          </div>
        );
      })}

      {/* 決定 Modal */}
      {decideModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-[15px] font-semibold text-[#2C2C2A]">
              {decideModal.decision === "approved" ? "✅ 核准授權申請" : "❌ 拒絕授權申請"}
            </h2>
            <p className="text-[12.5px] text-[#5A5955]">
              情境：{SCENARIO_LABEL[decideModal.record.scenario]}
              <br />
              申請人：{decideModal.record.requester_name ?? "（未知）"}
              <br />
              說明：{decideModal.record.notes ?? "—"}
            </p>
            <div>
              <label className="text-[11px] text-[#9A9890] font-medium">
                決定說明（稽核必填）
              </label>
              <textarea
                value={decideReason}
                onChange={(e) => setDecideReason(e.target.value)}
                placeholder={
                  decideModal.decision === "approved"
                    ? "例：客戶為 VIP，本次保養特准九折…"
                    : "例：折扣超出授權，請重新報價…"
                }
                rows={3}
                className="mt-1 w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDecideModal(null)}
                className="h-[30px] px-4 rounded text-[12.5px] border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={doDecide}
                disabled={isPending || !decideReason.trim()}
                className={`h-[30px] px-4 rounded text-[12.5px] font-medium disabled:opacity-50 ${
                  decideModal.decision === "approved"
                    ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                    : "bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                }`}
              >
                {isPending ? "處理中⋯" : decideModal.decision === "approved" ? "確認核准" : "確認拒絕"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 保固通融申請 Modal */}
      {warrantyModal && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-[15px] font-semibold text-[#2C2C2A]">申請保固通融</h2>
            <p className="text-[12.5px] text-[#5A5955]">
              請說明保固通融的原因，主管核准後即可免費維修。
            </p>
            <div>
              <label className="text-[11px] text-[#9A9890] font-medium">
                申請說明（必填）
              </label>
              <textarea
                value={warrantyNotes}
                onChange={(e) => setWarrantyNotes(e.target.value)}
                placeholder="例：車輛出廠 2 個月，保固期限尚未到，但系統顯示已到期，請主管核准通融…"
                rows={3}
                className="mt-1 w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setWarrantyModal(false)}
                className="h-[30px] px-4 rounded text-[12.5px] border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={doWarrantyRequest}
                disabled={isPending || !warrantyNotes.trim()}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "送出中⋯" : "送出申請"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
