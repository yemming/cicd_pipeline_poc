"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  HANDOFF_LABEL,
  HANDOFF_CHIP,
} from "@/domain/ro-handoffs.constants";
import type { HandoffDetail } from "@/domain/ro-handoffs";
import {
  PREFIX_P1_DEFS,
  PREFIX_P2_DEFS,
  PREFIX_COMBO_RULES,
  type PrefixP1,
  type PrefixP2,
} from "@/domain/repair-orders.constants";
import {
  transferToROAction,
  rejectHandoffAction,
} from "@/lib/aftersales/ro-handoff-actions";

type Banner = { ok: boolean; msg: string } | null;

type Props = {
  detail: HandoffDetail;
  canEdit: boolean;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `NT$${Math.round(n).toLocaleString()}`;
}

export function HandoffDetailView({ detail, canEdit }: Props) {
  useSetPageHeader({
    title: `串接工單 ${detail.pi_no}`,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "串接工單", href: "/parts/aftersales/ro-handoff" },
      { label: detail.pi_no },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [p1, setP1] = useState<PrefixP1>("MN");
  const [p2, setP2] = useState<PrefixP2>("CP");
  const [notes, setNotes] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  const combo = PREFIX_COMBO_RULES.find((r) => r.p1 === p1 && r.p2 === p2);
  const comboInvalid = combo?.verdict === "invalid";

  function handleTransfer() {
    startTransition(async () => {
      const res = await transferToROAction({
        pi_id: detail.id,
        prefix_p1: p1,
        prefix_p2: p2,
        notes: notes.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已串接 ${res.data.ro_code}，跳轉中⋯` });
        setTransferOpen(false);
        setTimeout(() => {
          router.push(`/parts/aftersales/repair-orders/${res.data.ro_id}`);
        }, 600);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleReject() {
    startTransition(async () => {
      const res = await rejectHandoffAction(detail.id, rejectReason.trim() || undefined);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已駁回，請 SA 回預檢單重簽" });
        setRejectOpen(false);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const status = detail.handoff_status;
  const canTransfer = canEdit && status === "ready";
  const canReject = canEdit && status === "ready";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/aftersales/ro-handoff"
            className="hover:text-[#185FA5]"
          >
            串接工單
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{detail.pi_no}</span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${HANDOFF_CHIP[status]}`}
          >
            {HANDOFF_LABEL[status]}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/ro-handoff"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          <Link
            href={`/parts/aftersales/pre-inspections/${detail.id}`}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            檢視預檢單
          </Link>
          {detail.repair_order_id ? (
            <Link
              href={`/parts/aftersales/repair-orders/${detail.repair_order_id}`}
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm font-medium"
            >
              開啟正式工單 →
            </Link>
          ) : (
            <>
              <button
                onClick={() => canReject && setRejectOpen(true)}
                disabled={!canReject || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                駁回
              </button>
              <button
                onClick={() => canTransfer && setTransferOpen(true)}
                disabled={!canTransfer || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                串接成正式工單 →
              </button>
            </>
          )}
        </div>
      </div>

      {status === "awaiting_signature" && (
        <div className="rounded-lg border border-[#BA7517] bg-[#FAEEDA] px-4 py-2.5 text-[12px] text-[#412402]">
          ⚠️ 此預檢單尚未取得車主簽名，無法串接。請 SA 先到預檢單完成「Tab 5 確認簽名」步驟。
        </div>
      )}
      {status === "transferred" && detail.ro_code && (
        <div className="rounded-lg border border-[#1D9E75] bg-[#E1F5EE] px-4 py-2.5 text-[12px] text-[#0F6E56]">
          ✓ 已於 {fmtDateTime(detail.transferred_at)} 串接成正式工單{" "}
          <span className="font-mono font-semibold">{detail.ro_code}</span>
          {detail.ro_status ? `（狀態：${detail.ro_status}）` : ""}。
        </div>
      )}

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">PRE-INSPECTION HANDOFF</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {detail.customer_name ?? "（未填客戶）"} ｜ {detail.vehicle_model_name ?? "—"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{detail.pi_no}</span>
                <span className="font-mono text-[#5A5955]">
                  {detail.vehicle_license_plate ?? "—"}
                </span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${HANDOFF_CHIP[status]}`}
                >
                  {HANDOFF_LABEL[status]}
                </span>
              </div>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[11px] text-[#9A9890]">預估報價</div>
            <div className="text-[20px] font-semibold text-[#CC0000]">
              {fmtMoney(detail.estimated_subtotal)}
            </div>
            {detail.estimated_labor_units !== null && (
              <div className="text-[11px] text-[#9A9890] mt-1">
                工時：{detail.estimated_labor_units} 工
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <Section title="▼ 車輛與客戶基本資料">
        <Kv label="車主姓名" value={detail.customer_name ?? "—"} />
        <Kv label="聯絡電話" value={detail.customer_phone ?? "—"} mono />
        <Kv label="接待 SA" value={detail.sa_name ?? "—"} />
        <Kv label="車牌號碼" value={detail.vehicle_license_plate ?? "—"} mono />
        <Kv label="車型" value={detail.vehicle_model_name ?? "—"} />
        <Kv
          label="進廠里程"
          value={detail.mileage_in ? `${detail.mileage_in.toLocaleString()} km` : "—"}
        />
      </Section>

      {/* 簽名與串接狀態 */}
      <Section title="▼ 簽名與串接狀態">
        <Kv label="預檢狀態" value={detail.pi_status} small />
        <Kv label="車主簽名時間" value={fmtDateTime(detail.signed_at)} small />
        <Kv label="串接時間" value={fmtDateTime(detail.transferred_at)} small />
        <Kv label="建立時間" value={fmtDateTime(detail.created_at)} small />
        <Kv label="最後更新" value={fmtDateTime(detail.updated_at)} small />
        <Kv
          label="已串接 RO"
          value={
            detail.ro_code ? (
              <Link
                href={`/parts/aftersales/repair-orders/${detail.repair_order_id}`}
                className="font-mono text-[#1A3A5C] hover:underline"
              >
                {detail.ro_code}
              </Link>
            ) : (
              "—"
            )
          }
          small
        />
      </Section>

      {/* Transfer modal */}
      {transferOpen && canTransfer && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-40"
          onClick={() => !isPending && setTransferOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-5 w-[560px] max-w-[92vw] shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
              ✅ 預檢單確認完成 — 開立正式工單 RO
            </h2>
            <p className="text-[12px] text-[#5A5955] leading-relaxed">
              將以下資料自動帶入新建的 RO 工單。需先選擇{" "}
              <strong>業務類型 P1</strong> + <strong>付款方式 P2</strong>。
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">業務類型 P1</label>
                <select
                  value={p1}
                  onChange={(e) => setP1(e.target.value as PrefixP1)}
                  className="h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                >
                  {PREFIX_P1_DEFS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code} {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">付款方式 P2</label>
                <select
                  value={p2}
                  onChange={(e) => setP2(e.target.value as PrefixP2)}
                  className="h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                >
                  {PREFIX_P2_DEFS.map((o) => (
                    <option key={o.code} value={o.code}>
                      {o.code} {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              className={`text-[11.5px] px-3 py-2 rounded ${
                comboInvalid
                  ? "bg-[#FCEBEB] text-[#CC0000] border border-[#F09595]"
                  : combo
                    ? "bg-[#E1F5EE] text-[#0F6E56] border border-[#1D9E75]"
                    : "bg-[#FAEEDA] text-[#854F0B] border border-[#BA7517]"
              }`}
            >
              {combo?.description ?? `⚠️ ${p1}-${p2} 組合需主管確認（將以 metadata 標記）`}
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">備註（選填）</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="如有特別說明請填入，會寫進 RO metadata"
                className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] outline-none focus:border-[#185FA5] min-h-[60px]"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setTransferOpen(false)}
                disabled={isPending}
                className="flex-1 h-[34px] rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                返回修改
              </button>
              <button
                onClick={handleTransfer}
                disabled={isPending || comboInvalid}
                className="flex-[2] h-[34px] rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              >
                {isPending ? "串接中⋯" : "確認 開立正式工單 RO →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejectOpen && canReject && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-40"
          onClick={() => !isPending && setRejectOpen(false)}
        >
          <div
            className="bg-white rounded-lg p-5 w-[480px] max-w-[92vw] shadow-xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[14px] font-semibold text-[#2C2C2A]">駁回預檢單</h2>
            <p className="text-[12px] text-[#5A5955] leading-relaxed">
              此操作會清除「車主簽名」狀態、把預檢退回 SA 修改，並通知 SA 重新確認車況/報價後再請車主簽名。
            </p>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">駁回原因（選填）</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="例：報價金額異常 / 車主反悔 / 車型錯誤"
                className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] outline-none focus:border-[#185FA5] min-h-[60px]"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setRejectOpen(false)}
                disabled={isPending}
                className="flex-1 h-[34px] rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={handleReject}
                disabled={isPending}
                className="flex-1 h-[34px] rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                {isPending ? "駁回中⋯" : "確認駁回"}
              </button>
            </div>
          </div>
        </div>
      )}

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
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">{children}</div>
    </section>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span
        className={`${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"} ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}
