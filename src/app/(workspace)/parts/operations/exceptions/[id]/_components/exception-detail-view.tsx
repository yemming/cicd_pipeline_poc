"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { voidAdjustment } from "@/domain/adjustments";
import type { AdjustmentDetail } from "@/domain/adjustments";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  pending: { label: "待審核", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  posted: { label: "已過帳", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  cancelled: { label: "已作廢", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const TYPE_LABEL: Record<string, string> = {
  exception_in: "例外進貨",
  exception_out: "例外出貨",
  damage: "損耗報廢",
  manual: "手動調整",
  count: "盤點調整",
  other: "其他",
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}
function fmtDateTime(d: string | null): string {
  return d ? new Date(d).toLocaleString("zh-TW") : "—";
}

export function ExceptionDetailView({
  detail,
  canEdit,
}: {
  detail: AdjustmentDetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { adj, lines } = detail;
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  const [voidReason, setVoidReason] = useState("");

  const flash = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const confirmVoid = () => {
    const reason = voidReason.trim();
    if (!reason) {
      flash({ ok: false, msg: "請填寫作廢原因" });
      return;
    }
    startTransition(async () => {
      const res = await voidAdjustment(adj.id, reason);
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已作廢 ${adj.adj_no}` });
        setVoidOpen(false);
        setVoidReason("");
        router.refresh();
      } else {
        flash({ ok: false, msg: `作廢失敗：${res.error}` });
      }
    });
  };

  const statusDef = STATUS_LABEL[adj.status ?? ""] ?? STATUS_LABEL.draft;
  const typeLabel = TYPE_LABEL[adj.type ?? ""] ?? adj.type;
  const isVoidable = canEdit && adj.status === "posted";

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/operations/exceptions" className="hover:text-[#185FA5]">
            例外出入庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{adj.adj_no}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/operations/exceptions"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {canEdit ? (
            <Link
              href="/parts/operations/exceptions/new"
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
            >
              新增
            </Link>
          ) : null}
          {isVoidable ? (
            <button
              type="button"
              onClick={() => {
                setVoidOpen(true);
                setVoidReason("");
              }}
              className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm"
            >
              作廢
            </button>
          ) : null}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">調整單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {typeLabel}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{adj.adj_no}</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusDef.chip}`}
                >
                  {statusDef.label}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="調整單號" value={adj.adj_no} mono />
          <Kv label="類型" value={typeLabel} />
          <Kv label="倉庫" value={adj.warehouse_name ?? "—"} />
          <Kv label="原因" value={adj.reason ?? "—"} />
          <Kv label="影響金額" value={fmtMoney(adj.total_amount)} mono />
          <Kv label="建立日" value={fmtDateTime(adj.created_at)} mono small />
          <Kv label="過帳時間" value={fmtDateTime(adj.posted_at)} mono small />
          <Kv label="GL 記帳" value={adj.gl_posted ? "已記帳" : "未記帳"} />
          <Kv label="備註" value={adj.notes ?? "—"} />
        </div>
      </section>

      {/* 明細 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 明細（{lines.length}）
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="bg-[#F8F7F4] text-left text-[11px] text-[#9A9890]">
                <th className="px-3 py-2 w-[60px]">#</th>
                <th className="px-3 py-2">料號</th>
                <th className="px-3 py-2">品名</th>
                <th className="px-3 py-2">序列號 / 批號</th>
                <th className="px-3 py-2 text-right">數量變動</th>
                <th className="px-3 py-2 text-right">單價</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2">備註</th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    無明細
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.id} className="border-t border-[#EEECE6]">
                    <td className="px-3 py-2 font-mono text-[12px] text-[#5A5955]">{l.line_no}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/parts/setup/items/${l.item_id}`}
                        className="font-mono font-semibold text-[#1A3A5C] hover:underline"
                      >
                        {l.item_code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{l.item_name}</td>
                    <td className="px-3 py-2 text-[11.5px] text-[#5A5955]">
                      {l.serial_no || l.batch_no ? (
                        <>
                          {l.serial_no ? (
                            <span className="font-mono">SN:{l.serial_no}</span>
                          ) : null}
                          {l.serial_no && l.batch_no ? <span> / </span> : null}
                          {l.batch_no ? <span className="font-mono">B:{l.batch_no}</span> : null}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono text-[12px] ${
                        l.qty_delta > 0 ? "text-[#0F6E56]" : "text-[#CC0000]"
                      }`}
                    >
                      {l.qty_delta > 0 ? "+" : ""}
                      {l.qty_delta}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {fmtMoney(l.unit_cost)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">
                      {fmtMoney(l.line_amount)}
                    </td>
                    <td className="px-3 py-2 text-[11.5px] text-[#5A5955]">{l.notes ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {voidOpen ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setVoidOpen(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                作廢調整單 {adj.adj_no}
              </h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                作廢後會自動反向回沖庫存：原入庫的扣回、原出庫的補回。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  作廢原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  placeholder="例如：建錯類型、應走 PO 流程⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={isPending || !voidReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {isPending ? "作廢中⋯" : "確認作廢"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
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
}

function Kv({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`${mono ? "font-mono " : ""}${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
