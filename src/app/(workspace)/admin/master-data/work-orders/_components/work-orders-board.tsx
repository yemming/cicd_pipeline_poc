"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteWorkOrderAction } from "@/lib/master-data/workorder-actions";
import type { WorkOrder } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  draft: { text: "草稿", color: "bg-[#DFE1E6] text-[#42526E]" },
  dispatched: { text: "已派工", color: "bg-[#DEEBFF] text-[#0747A6]" },
  in_progress: { text: "施工中", color: "bg-[#FFEEDB] text-[#974F0C]" },
  qc: { text: "品檢", color: "bg-[#FFF7D6] text-[#7F5F01]" },
  done: { text: "已完成", color: "bg-[#E3FCEF] text-[#006644]" },
  closed: { text: "已結案", color: "bg-[#DFE1E6] text-[#172B4D]" },
  cancelled: { text: "已取消", color: "bg-[#FFEBE6] text-[#BF2600]" },
};

const NT = (n: number) => `NT$ ${Math.round(n).toLocaleString()}`;

type CustomerLite = { id: string; name: string };
type VehicleLite = { id: string; license_plate: string | null; vin: string | null };
type EmployeeLite = { id: string; name: string };

export function WorkOrdersBoard({
  rows,
  totalCount,
  page,
  pageSize,
  canCreate,
  customers,
  vehicles,
  employees,
}: {
  rows: WorkOrder[];
  totalCount: number;
  page: number;
  pageSize: number;
  canCreate: boolean;
  customers: CustomerLite[];
  vehicles: VehicleLite[];
  employees: EmployeeLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const empById = new Map(employees.map((e) => [e.id, e]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const goToPage = (next: number) => {
    const p = new URLSearchParams();
    if (next > 1) p.set("page", String(next));
    const qs = p.toString();
    const href = qs
      ? `/admin/master-data/work-orders?${qs}`
      : "/admin/master-data/work-orders";
    startTransition(() => router.push(href));
  };

  const removeRow = (w: WorkOrder) => {
    if (!confirm(`確定刪除工單「${w.ro_no}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteWorkOrderAction(w.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<WorkOrder>[] = [
    {
      id: "ro_no",
      header: "單號",
      width: 180,
      hideable: false,
      cell: (w) => (
        <button
          onClick={() => router.push(`/admin/master-data/work-orders/${w.id}`)}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {w.ro_no}
        </button>
      ),
      exportValue: (w) => w.ro_no,
      sortValue: (w) => w.ro_no,
    },
    {
      id: "opened_at",
      header: "開單時間",
      width: 120,
      cell: (w) => (
        <span className="text-[12px]">
          {new Date(w.opened_at).toLocaleDateString("zh-TW", {
            timeZone: "Asia/Taipei",
          })}
        </span>
      ),
      exportValue: (w) =>
        new Date(w.opened_at).toLocaleDateString("zh-TW", {
          timeZone: "Asia/Taipei",
        }),
      sortValue: (w) => w.opened_at,
    },
    {
      id: "customer",
      header: "車主",
      width: 120,
      cell: (w) => (w.customer_id ? customerById.get(w.customer_id)?.name ?? "—" : "—"),
      exportValue: (w) =>
        w.customer_id ? customerById.get(w.customer_id)?.name ?? "" : "",
    },
    {
      id: "vehicle",
      header: "車輛",
      cell: (w) => {
        const v = vehicleById.get(w.vehicle_id);
        return v?.license_plate ?? v?.vin ?? "—";
      },
      exportValue: (w) => {
        const v = vehicleById.get(w.vehicle_id);
        return v?.license_plate ?? v?.vin ?? "";
      },
    },
    {
      id: "advisor",
      header: "顧問",
      width: 100,
      cell: (w) => (w.advisor_id ? empById.get(w.advisor_id)?.name ?? "—" : "—"),
      exportValue: (w) =>
        w.advisor_id ? empById.get(w.advisor_id)?.name ?? "" : "",
    },
    {
      id: "tech",
      header: "主責技師",
      width: 100,
      cell: (w) =>
        w.lead_technician_id
          ? empById.get(w.lead_technician_id)?.name ?? "—"
          : "—",
      exportValue: (w) =>
        w.lead_technician_id ? empById.get(w.lead_technician_id)?.name ?? "" : "",
    },
    {
      id: "total",
      header: "金額",
      align: "right",
      width: 120,
      cell: (w) => (
        <span className="font-mono">{NT(Number(w.total_amount ?? 0))}</span>
      ),
      exportValue: (w) => NT(Number(w.total_amount ?? 0)),
      sortValue: (w) => Number(w.total_amount ?? 0),
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (w) => {
        const s = STATUS_LABEL[w.status] ?? { text: w.status, color: "bg-[#DFE1E6]" };
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${s.color}`}
          >
            {s.text}
          </span>
        );
      },
      exportValue: (w) => STATUS_LABEL[w.status]?.text ?? w.status,
      sortValue: (w) => w.status,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">維修工單</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          RO 主檔總覽
        </span>
        {canCreate && (
          <button
            onClick={() => router.push("/admin/master-data/work-orders/new")}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增工單
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
          筆工單（本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(w) => w.id}
        persistKey="admin/master-data/work-orders"
        exportFileName="work-orders"
        emptyMessage="尚無工單 — 點右上角「新增工單」開始建立"
        disabled={isPending}
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
        rowActions={(w) => (
          <>
            <button
              onClick={() => router.push(`/admin/master-data/work-orders/${w.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(w)}
              disabled={isPending || !canCreate}
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
