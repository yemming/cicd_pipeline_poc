"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setVehiclePOStatusAction,
  deleteVehiclePOAction,
} from "@/lib/vehicle-inventory/vehicle-po-actions";
import type {
  VehiclePODetail,
  VehiclePOStatus,
} from "@/domain/vehicle-purchase-orders";

const BASE = "/sales/inventory/purchase-orders";

const STATUS_LABELS: Record<VehiclePOStatus, string> = {
  draft: "草稿",
  submitted: "已送出（在途）",
  in_transit: "在途中",
  arrived: "到港完成",
  closed: "已結案",
  cancelled: "已取消",
};

function statusChip(status: VehiclePOStatus): string {
  switch (status) {
    case "draft":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    case "submitted":
    case "in_transit":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "arrived":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "closed":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "cancelled":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
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
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value ?? "—"}
      </span>
    </div>
  );
}

type Banner = { ok: boolean; msg: string } | null;

export default function VehiclePODetailView({
  po,
  canEdit,
}: {
  po: VehiclePODetail;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const setStatus = (next: VehiclePOStatus) => {
    startTransition(async () => {
      const res = await setVehiclePOStatusAction(po.id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 狀態已更新為「${STATUS_LABELS[next]}」` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const remove = () => {
    if (
      !confirm(
        `確定刪除採購單「${po.po_no}」？此動作永久移除單頭與車款明細。\n（已連帶建立在途車輛庫存的單無法刪除，請改用「取消」。）`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteVehiclePOAction(po.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除採購單" });
        setTimeout(() => router.push(BASE), 350);
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* Breadcrumb + CRUD pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={BASE} className="hover:text-[#185FA5]">
            整車採購訂單
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{po.po_no}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href={BASE}
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          <Link
            href={`${BASE}/new`}
            aria-disabled={!canEdit}
            className={`h-[30px] px-4 inline-flex items-center rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm ${
              canEdit ? "" : "pointer-events-none opacity-50"
            }`}
          >
            新增
          </Link>
          {po.status !== "arrived" && po.status !== "cancelled" ? (
            <button
              type="button"
              onClick={() => setStatus("arrived")}
              disabled={!canEdit || isPending}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
            >
              標記到港
            </button>
          ) : null}
          <button
            type="button"
            onClick={remove}
            disabled={!canEdit || isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
          >
            刪除
          </button>
          <button
            type="button"
            onClick={() => setStatus(po.status === "cancelled" ? "draft" : "cancelled")}
            disabled={!canEdit || isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            {po.status === "cancelled" ? "恢復" : "取消"}
          </button>
        </div>
      </div>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="text-[11px] tracking-wider text-[#9A9890]">整車採購訂單 / RS_INV01</div>
        <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{po.po_no}</h1>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
          <span className="text-[#5A5955]">{po.supplier_name ?? "（未指定供應商）"}</span>
          <span
            className={`px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusChip(po.status)}`}
          >
            {STATUS_LABELS[po.status]}
          </span>
          <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
            {po.total_qty} 台 · {po.model_count} 款
          </span>
        </div>
      </header>

      {/* 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="採購單號" value={po.po_no} mono />
          <Kv label="供應商" value={po.supplier_name} />
          <Kv label="狀態" value={STATUS_LABELS[po.status]} />
          <Kv label="採購日期" value={po.order_date} mono />
          <Kv label="預計到港" value={po.expected_arrival} mono />
          <Kv label="入庫倉" value={po.warehouse_name} />
          <Kv label="幣別" value={po.currency} />
          <Kv label="匯率" value={po.exchange_rate} mono />
          <Kv label="關稅率 (%)" value={po.customs_rate} mono />
          <Kv label="運費估計" value={fmtNT(po.freight_estimate)} mono />
          <Kv label="保險估計" value={fmtNT(po.insurance_estimate)} mono />
          <Kv label="採購總金額（未稅）" value={fmtNT(po.total_amount_twd)} mono />
        </div>
        {po.notes ? (
          <div className="px-4 pb-4">
            <Kv label="備註" value={po.notes} />
          </div>
        ) : null}
      </section>

      {/* 車款明細 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 採購車款明細</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                <th className="text-left font-medium px-4 py-2 w-[50px]">項次</th>
                <th className="text-left font-medium px-4 py-2">車系 / 車型</th>
                <th className="text-left font-medium px-4 py-2 w-[120px]">顏色</th>
                <th className="text-right font-medium px-4 py-2 w-[80px]">數量</th>
                <th className="text-right font-medium px-4 py-2 w-[130px]">單價（未稅）</th>
                <th className="text-right font-medium px-4 py-2 w-[140px]">小計</th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((it) => (
                <tr key={it.id} className="border-b border-[#F4F3F0]">
                  <td className="px-4 py-2 text-[#9A9890]">{it.seq}</td>
                  <td className="px-4 py-2">
                    {it.model_series ? (
                      <span className="text-[#9A9890]">{it.model_series} · </span>
                    ) : null}
                    {it.model_display_name ?? "—"}
                  </td>
                  <td className="px-4 py-2">{it.color ?? "—"}</td>
                  <td className="px-4 py-2 text-right font-mono">{it.qty}</td>
                  <td className="px-4 py-2 text-right font-mono">{fmtNT(it.unit_price_twd)}</td>
                  <td className="px-4 py-2 text-right font-mono font-semibold">
                    {fmtNT((it.qty ?? 0) * Number(it.unit_price_twd ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-[#F8F7F4]">
                <td colSpan={3} className="px-4 py-2.5 text-[#5A5955] font-medium">
                  合計
                </td>
                <td className="px-4 py-2.5 text-right font-mono font-semibold">{po.total_qty} 台</td>
                <td></td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-[#1A3A5C]">
                  {fmtNT(po.total_amount_twd)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      {/* 下游提示 */}
      <div className="text-[12px] text-[#9A9890] px-1">
        送出採購單後，每台車已在新車庫存建立「在途中（IN_TRANSIT）」記錄。到港後請前往 RS_INV02
        到港確認逐台掃描 VIN，觸發 PDI 工單。
      </div>
    </main>
  );
}
