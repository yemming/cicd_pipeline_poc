import Link from "next/link";

import type { InternalSaleReceiptDetail } from "@/domain/internal-sale-receipts";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:  { label: "草稿",   chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  posted: { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  void:   { label: "已作廢", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDate(d: string | null | undefined): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

export function InternalSaleDetailView({
  receipt,
}: {
  receipt: InternalSaleReceiptDetail;
}) {
  const statusDef = STATUS_LABEL[receipt.status ?? ""] ?? STATUS_LABEL.draft;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Breadcrumb + pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/receipt/internal-sale" className="hover:text-[#185FA5]">
            內售入庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{receipt.doc_no}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/receipt/internal-sale"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
        </div>
      </div>

      {/* 2. Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">內售入庫單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {receipt.doc_no}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusDef.chip}`}
                >
                  {statusDef.label}
                </span>
                {receipt.source_label ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                    來源：{receipt.source_label}
                  </span>
                ) : null}
                {receipt.warehouse_label ? (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                    {receipt.warehouse_label}
                  </span>
                ) : null}
                <span className="text-[#9A9890]">·</span>
                <span className="text-[#5A5955] font-mono">{fmtDate(receipt.receipt_date)}</span>
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[260px] h-[120px] bg-[#F8F7F4] border border-[#EEECE6] rounded-lg flex flex-col items-center justify-center gap-1">
            <div className="text-[11px] text-[#9A9890]">入庫總金額</div>
            <div className="text-[20px] font-semibold text-[#1A3A5C] font-mono">
              {fmtMoney(receipt.amount_total)}
            </div>
            <div className="text-[11px] text-[#9A9890]">
              共 {receipt.qty_total} 件
            </div>
          </div>
        </div>
      </header>

      {/* 3. ▼ 基本資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資訊</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="入庫單號" value={receipt.doc_no} mono />
          <Kv
            label="狀態"
            value={
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusDef.chip}`}
              >
                {statusDef.label}
              </span>
            }
          />
          <Kv label="入庫日期" value={<span className="font-mono">{fmtDate(receipt.receipt_date)}</span>} />

          <Kv label="來源" value={receipt.source_label ?? "—"} />
          <Kv label="入庫倉" value={receipt.warehouse_label ?? "—"} />
          <div></div>

          <Kv label="入庫總量" value={<span className="font-mono">{receipt.qty_total} 件</span>} />
          <Kv label="入庫金額" value={<span className="font-mono">{fmtMoney(receipt.amount_total)}</span>} />
          <Kv label="建立時間" value={fmtDateTime(receipt.created_at)} mono />

          <div className="col-span-1 md:col-span-3">
            <div className="text-[11px] text-[#9A9890] font-medium mb-1">備註</div>
            <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap min-h-[20px]">
              {receipt.notes ?? <span className="text-[#9A9890]">—</span>}
            </div>
          </div>
        </div>
      </section>

      {/* 註記：純資訊頁、無 CRUD / 無明細子表 */}
      <div className="text-[11px] text-[#9A9890] px-1">
        此為外部系統同步進來的內售入庫摘要紀錄，本頁僅供檢視。
      </div>
    </main>
  );
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <div className="text-[11px] text-[#9A9890] font-medium">{label}</div>
      <div className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""} truncate`}>
        {value}
      </div>
    </div>
  );
}
