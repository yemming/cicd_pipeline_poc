"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  requestCostAdditionAction,
  reviewCostAdditionAction,
  deleteCostAdditionAction,
} from "@/lib/vehicle-import/cost-addition-actions";
import type { CostAdditionRow, CostAdditionFilters } from "@/domain/import-cost-additions";
import {
  COST_TYPE_CATALOG,
  COST_TYPE_LABEL,
  ALLOCATION_BASIS_LABEL,
  type AllocationBasis,
} from "@/domain/import-landed-cost.constants";

type Banner = { ok: boolean; msg: string } | null;
type ShipmentOption = { id: string; shipment_no: string; gl_posted: boolean };

const nt = (n: number) => `NT$ ${Math.round(n).toLocaleString("en-US")}`;
const STATUS_CHIP: Record<string, string> = {
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  approved: "bg-[#EAF3DE] text-[#3B6D11]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
};
const STATUS_LABEL: Record<string, string> = { pending: "待簽核", approved: "已核准", rejected: "已退回" };

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

const BASES: AllocationBasis[] = ["qty", "cif", "weight", "model_amort", "direct"];

export function CostAdditionsBoard({
  rows,
  filters,
  shipmentOptions,
}: {
  rows: CostAdditionRow[];
  filters: CostAdditionFilters;
  shipmentOptions: ShipmentOption[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [fStatus, setFStatus] = useState(filters.status ?? "all");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({
    shipment_id: "",
    cost_type: "freight",
    amount: "",
    allocation_basis: "qty" as AllocationBasis,
    is_inventoriable: true,
    payee: "",
    reason: "",
  });

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const goFilter = (status: string) => {
    setFStatus(status);
    startTransition(() =>
      router.push(status === "all" ? "/vehicle-import/cost-additions" : `/vehicle-import/cost-additions?status=${status}`),
    );
  };

  const submit = () => {
    const amount = Number(form.amount);
    if (!form.shipment_id) return showBanner({ ok: false, msg: "請選擇批次" });
    if (!Number.isFinite(amount) || amount <= 0) return showBanner({ ok: false, msg: "金額需為正數" });
    startTransition(async () => {
      const res = await requestCostAdditionAction({
        shipment_id: form.shipment_id,
        cost_type: form.cost_type,
        amount,
        allocation_basis: form.allocation_basis,
        is_inventoriable: form.is_inventoriable,
        payee: form.payee.trim() || null,
        reason: form.reason.trim() || null,
      });
      if (res.ok) {
        setModalOpen(false);
        showBanner({ ok: true, msg: "✓ 已申請，待主管簽核" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const review = (r: CostAdditionRow, approve: boolean) => {
    if (!confirm(`${approve ? "核准" : "退回"}補列「${COST_TYPE_LABEL[r.cost_type] ?? r.cost_type} ${nt(r.amount)}」？`))
      return;
    startTransition(async () => {
      const res = await reviewCostAdditionAction(r.id, approve);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: approve ? "✓ 已核准（回工作台重新 Commit 納入分攤）" : "✓ 已退回",
        });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const remove = (r: CostAdditionRow) => {
    if (!confirm("刪除此補列？")) return;
    startTransition(async () => {
      const res = await deleteCostAdditionAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const columns: DataGridColumn<CostAdditionRow>[] = [
    {
      id: "shipment_no",
      header: "批次",
      width: 140,
      cell: (r) => (
        <Link
          href={`/vehicle-import/shipments/${r.shipment_id}`}
          className="font-mono text-[12px] text-[#1A3A5C] hover:underline"
        >
          {r.shipment_no ?? "—"}
        </Link>
      ),
      exportValue: (r) => r.shipment_no ?? "",
      sortValue: (r) => r.shipment_no ?? "",
    },
    {
      id: "cost_type",
      header: "費用類型",
      width: 150,
      cell: (r) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
          {COST_TYPE_LABEL[r.cost_type] ?? r.cost_type}
        </span>
      ),
      exportValue: (r) => COST_TYPE_LABEL[r.cost_type] ?? r.cost_type,
    },
    {
      id: "amount",
      header: "金額",
      width: 110,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{nt(r.amount)}</span>,
      exportValue: (r) => String(r.amount),
      sortValue: (r) => r.amount,
    },
    {
      id: "basis",
      header: "分攤基礎",
      width: 90,
      cell: (r) => (
        <span className="text-[12px] text-[#5A5955]">
          {ALLOCATION_BASIS_LABEL[r.allocation_basis as AllocationBasis] ?? r.allocation_basis}
        </span>
      ),
      exportValue: (r) => ALLOCATION_BASIS_LABEL[r.allocation_basis as AllocationBasis] ?? r.allocation_basis,
      sortable: false,
    },
    {
      id: "reason",
      header: "事由",
      cell: (r) => <span className="text-[12px] text-[#5A5955]">{r.reason ?? "—"}</span>,
      exportValue: (r) => r.reason ?? "",
      sortable: false,
    },
    {
      id: "status",
      header: "簽核",
      width: 90,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
            STATUS_CHIP[r.approval_status] ?? ""
          }`}
        >
          {STATUS_LABEL[r.approval_status] ?? r.approval_status}
        </span>
      ),
      exportValue: (r) => STATUS_LABEL[r.approval_status] ?? r.approval_status,
      sortValue: (r) => r.approval_status,
    },
    {
      id: "applied",
      header: "已入帳",
      width: 80,
      cell: (r) =>
        r.applied ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
            已分攤
          </span>
        ) : (
          <span className="text-[12px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.applied ? "已分攤" : ""),
      sortValue: (r) => (r.applied ? 1 : 0),
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">補列審核</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">P2P</span>
        <span className="text-[12px] text-[#9A9890]">
          結算後追加費用三道關：申請 → 主管簽核 → 回工作台重新 Commit 納入分攤（未核准不計入成本）
        </span>
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

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>簽核狀態</label>
            <select className={inputClass} value={fStatus} onChange={(e) => goFilter(e.target.value)}>
              <option value="all">全部</option>
              <option value="pending">待簽核</option>
              <option value="approved">已核准</option>
              <option value="rejected">已退回</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={() => setModalOpen(true)}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 申請補列
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆補列
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="vehicle-import/cost-additions"
        exportFileName="cost-additions"
        emptyMessage="目前沒有補列申請"
        disabled={isPending}
        rowActionsWidth={200}
        rowActions={(r) => (
          <>
            {r.approval_status === "pending" ? (
              <>
                <button
                  onClick={() => review(r, true)}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                >
                  核准
                </button>
                <button
                  onClick={() => review(r, false)}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  退回
                </button>
              </>
            ) : null}
            {r.approval_status !== "approved" ? (
              <button
                onClick={() => remove(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
              >
                刪除
              </button>
            ) : null}
          </>
        )}
      />

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-[520px] bg-white rounded-lg shadow-xl border border-[#EEECE6] overflow-hidden">
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">申請補列費用</h2>
              <button onClick={() => setModalOpen(false)} className="ml-auto text-[#9A9890] hover:text-[#5A5955] text-[18px] leading-none">
                ×
              </button>
            </header>
            <div className={`px-4 py-4 grid grid-cols-2 gap-x-4 gap-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
              <div className="flex flex-col gap-1 col-span-2">
                <label className={labelClass}>批次 *</label>
                <select
                  className={inputClass}
                  value={form.shipment_id}
                  onChange={(e) => setForm((f) => ({ ...f, shipment_id: e.target.value }))}
                >
                  <option value="">請選擇⋯</option>
                  {shipmentOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shipment_no}
                      {s.gl_posted ? "（已過帳 GL，套用需先沖銷）" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>費用類型 *</label>
                <select
                  className={inputClass}
                  value={form.cost_type}
                  onChange={(e) => {
                    const cat = COST_TYPE_CATALOG.find((c) => c.value === e.target.value);
                    setForm((f) => ({
                      ...f,
                      cost_type: e.target.value,
                      allocation_basis: (cat?.defaultBasis as AllocationBasis) ?? f.allocation_basis,
                      is_inventoriable: cat?.inventoriable ?? f.is_inventoriable,
                    }));
                  }}
                >
                  {COST_TYPE_CATALOG.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>金額 *</label>
                <input
                  className={inputClass}
                  value={form.amount}
                  onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  placeholder="NT$"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>分攤基礎</label>
                <select
                  className={inputClass}
                  value={form.allocation_basis}
                  onChange={(e) => setForm((f) => ({ ...f, allocation_basis: e.target.value as AllocationBasis }))}
                >
                  {BASES.map((b) => (
                    <option key={b} value={b}>
                      {ALLOCATION_BASIS_LABEL[b]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass}>受款方</label>
                <input
                  className={inputClass}
                  value={form.payee}
                  onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
                />
              </div>
              <div className="flex flex-col gap-1 col-span-2">
                <label className={labelClass}>補列事由</label>
                <input
                  className={inputClass}
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="例：遲到的海運附加費發票"
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={isPending}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "送出中⋯" : "送出申請"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
