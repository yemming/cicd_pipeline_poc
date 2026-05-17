"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteWarrantyClaimAction } from "@/lib/master-data/warranty-actions";
import type { WarrantyClaim } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

const TYPE_LABEL: Record<string, string> = {
  oem_warranty: "OEM",
  extended_warranty: "延保",
  tsb: "TSB",
  pdi: "PDI",
  goodwill: "Goodwill",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已送件",
  under_review: "審查中",
  approved: "已核准",
  partial_approved: "部分核准",
  rejected: "拒絕",
  received: "已收款",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#DFE1E6] text-[#42526E]",
  submitted: "bg-[#DEEBFF] text-[#0747A6]",
  under_review: "bg-[#FFF7E6] text-[#974F00]",
  approved: "bg-[#E3FCEF] text-[#006644]",
  partial_approved: "bg-[#FFF7E6] text-[#974F00]",
  rejected: "bg-[#FFEBE6] text-[#BF2600]",
  received: "bg-[#E3FCEF] text-[#006644]",
  cancelled: "bg-[#DFE1E6] text-[#42526E]",
};

const NT = (n: number | null | undefined) =>
  n != null ? `NT$ ${Math.round(Number(n)).toLocaleString()}` : "—";

type CustomerLite = { id: string; name: string };
type WorkOrderLite = { id: string; ro_no: string };

export function WarrantyClaimsBoard({
  rows,
  totalCount,
  page,
  pageSize,
  canEdit,
  customers,
  workOrders,
}: {
  rows: WarrantyClaim[];
  totalCount: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  customers: CustomerLite[];
  workOrders: WorkOrderLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const woById = new Map(workOrders.map((w) => [w.id, w]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const goToPage = (next: number) => {
    const p = new URLSearchParams();
    if (next > 1) p.set("page", String(next));
    const qs = p.toString();
    const href = qs
      ? `/admin/master-data/warranty-claims?${qs}`
      : "/admin/master-data/warranty-claims";
    startTransition(() => router.push(href));
  };

  const removeRow = (c: WarrantyClaim) => {
    if (!confirm(`確定刪除索賠單「${c.cl_no}」？此動作無法復原（含明細）。`)) return;
    startTransition(async () => {
      const res = await deleteWarrantyClaimAction(c.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<WarrantyClaim>[] = [
    {
      id: "cl_no",
      header: "索賠單號",
      width: 180,
      hideable: false,
      cell: (c) => (
        <button
          onClick={() => router.push(`/admin/master-data/warranty-claims/${c.id}`)}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {c.cl_no}
        </button>
      ),
      exportValue: (c) => c.cl_no,
      sortValue: (c) => c.cl_no,
    },
    {
      id: "type",
      header: "類型",
      width: 90,
      cell: (c) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#EAE6FF] text-[#403294]">
          {TYPE_LABEL[c.claim_type] ?? c.claim_type}
        </span>
      ),
      exportValue: (c) => TYPE_LABEL[c.claim_type] ?? c.claim_type,
      sortValue: (c) => c.claim_type,
    },
    {
      id: "ro",
      header: "工單",
      width: 150,
      cell: (c) =>
        c.ro_id ? (
          <span className="font-mono text-[12px]">
            {woById.get(c.ro_id)?.ro_no ?? "(已刪除)"}
          </span>
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (c) => (c.ro_id ? woById.get(c.ro_id)?.ro_no ?? "" : ""),
    },
    {
      id: "customer",
      header: "客戶",
      cell: (c) =>
        c.customer_id ? (
          customerById.get(c.customer_id)?.name ?? "—"
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (c) =>
        c.customer_id ? customerById.get(c.customer_id)?.name ?? "" : "",
    },
    {
      id: "claim_date",
      header: "索賠日",
      width: 100,
      cell: (c) => c.claim_date ?? "—",
      exportValue: (c) => c.claim_date ?? "",
      sortValue: (c) => c.claim_date ?? "",
    },
    {
      id: "applied",
      header: "申請金額",
      align: "right",
      width: 110,
      cell: (c) => <span className="font-mono">{NT(c.applied_amount)}</span>,
      exportValue: (c) => NT(c.applied_amount),
      sortValue: (c) => Number(c.applied_amount ?? 0),
    },
    {
      id: "approved",
      header: "核准金額",
      align: "right",
      width: 110,
      cell: (c) =>
        c.approved_amount != null ? (
          <span className="font-mono">{NT(c.approved_amount)}</span>
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (c) =>
        c.approved_amount != null ? NT(c.approved_amount) : "",
      sortValue: (c) => Number(c.approved_amount ?? 0),
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (c) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${STATUS_COLOR[c.status] ?? ""}`}
        >
          {STATUS_LABEL[c.status] ?? c.status}
        </span>
      ),
      exportValue: (c) => STATUS_LABEL[c.status] ?? c.status,
      sortValue: (c) => c.status,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">保固索賠</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          連工單 RO 跟原廠保固通報
        </span>
        {canEdit && (
          <button
            onClick={() => router.push("/admin/master-data/warranty-claims/new")}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增索賠
          </button>
        )}
      </header>

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

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b>{" "}
          筆索賠（本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(c) => c.id}
        persistKey="admin/master-data/warranty-claims"
        exportFileName="warranty-claims"
        emptyMessage="尚無保固索賠 — 點右上角「新增索賠」開始建立"
        disabled={isPending}
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
        rowActions={(c) => (
          <>
            <button
              onClick={() =>
                router.push(`/admin/master-data/warranty-claims/${c.id}`)
              }
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(c)}
              disabled={isPending || !canEdit}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}
