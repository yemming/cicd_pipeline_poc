"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteVehicleAction } from "@/lib/master-data/vehicle-actions";
import type { CustomerVehicle } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

type CustomerLite = { id: string; name: string };
type ModelLite = { id: string; display_name: string };

export function VehiclesBoard({
  rows,
  totalCount,
  page,
  pageSize,
  canEdit,
  customers,
  models,
}: {
  rows: CustomerVehicle[];
  totalCount: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  customers: CustomerLite[];
  models: ModelLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const modelById = new Map(models.map((m) => [m.id, m]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const goToPage = (next: number) => {
    const p = new URLSearchParams();
    if (next > 1) p.set("page", String(next));
    const qs = p.toString();
    const href = qs
      ? `/admin/master-data/vehicles?${qs}`
      : "/admin/master-data/vehicles";
    startTransition(() => router.push(href));
  };

  const removeRow = (v: CustomerVehicle) => {
    const label = v.license_plate ?? v.vin ?? v.id.slice(0, 8);
    if (!confirm(`確定刪除車輛「${label}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteVehicleAction(v.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<CustomerVehicle>[] = [
    {
      id: "license_plate",
      header: "車牌",
      width: 130,
      hideable: false,
      cell: (v) =>
        v.license_plate ? (
          <Link
            href={`/admin/master-data/vehicles/${v.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:underline"
          >
            {v.license_plate}
          </Link>
        ) : (
          <Link
            href={`/admin/master-data/vehicles/${v.id}`}
            className="text-[#9A9890] hover:text-[#185FA5]"
          >
            —
          </Link>
        ),
      exportValue: (v) => v.license_plate ?? "",
      sortValue: (v) => v.license_plate ?? "",
    },
    {
      id: "customer",
      header: "車主",
      width: 160,
      cell: (v) => customerById.get(v.customer_id)?.name ?? "—",
      exportValue: (v) => customerById.get(v.customer_id)?.name ?? "",
      sortValue: (v) => customerById.get(v.customer_id)?.name ?? "",
    },
    {
      id: "model",
      header: "車型",
      cell: (v) =>
        v.model_id ? modelById.get(v.model_id)?.display_name ?? "—" : "—",
      exportValue: (v) =>
        v.model_id ? modelById.get(v.model_id)?.display_name ?? "" : "",
      sortValue: (v) =>
        v.model_id ? modelById.get(v.model_id)?.display_name ?? "" : "",
    },
    {
      id: "vin",
      header: "VIN",
      width: 180,
      cell: (v) =>
        v.vin ? (
          <span className="font-mono text-[12px]">{v.vin}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (v) => v.vin ?? "",
      sortValue: (v) => v.vin ?? "",
    },
    {
      id: "mileage",
      header: "里程",
      width: 110,
      align: "right",
      cell: (v) =>
        v.current_mileage != null
          ? `${Number(v.current_mileage).toLocaleString()} km`
          : "—",
      exportValue: (v) =>
        v.current_mileage != null ? Number(v.current_mileage) : "",
      sortValue: (v) =>
        v.current_mileage != null ? Number(v.current_mileage) : null,
    },
    {
      id: "next_service",
      header: "下次保養",
      width: 140,
      sortable: false,
      cell: (v) => {
        if (!v.next_service_due_date && !v.next_service_due_mileage) return "—";
        const d = v.next_service_due_date ?? "—";
        const m = v.next_service_due_mileage
          ? `${Number(v.next_service_due_mileage).toLocaleString()} km`
          : "—";
        return (
          <span className="text-[12px] leading-tight">
            {d}
            <br />
            <span className="text-[#9A9890]">{m}</span>
          </span>
        );
      },
      exportValue: (v) => {
        const d = v.next_service_due_date ?? "";
        const m = v.next_service_due_mileage
          ? `${Number(v.next_service_due_mileage).toLocaleString()} km`
          : "";
        return [d, m].filter(Boolean).join(" / ");
      },
    },
    {
      id: "active",
      header: "狀態",
      width: 80,
      cell: (v) =>
        v.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            持有中
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            已轉手
          </span>
        ),
      exportValue: (v) => (v.is_active ? "持有中" : "已轉手"),
      sortValue: (v) => v.is_active,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">客戶車輛</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          維修預約 / 工單 / 保固 都吃此處 vehicle_id
        </span>
        {canEdit && (
          <button
            onClick={() => router.push("/admin/master-data/vehicles/new")}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增車輛
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
          筆車輛（本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(v) => v.id}
        persistKey="admin/master-data/vehicles"
        exportFileName="vehicles"
        emptyMessage="尚無車輛資料 — 點右上角「新增車輛」開始建立"
        disabled={isPending}
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
        rowActions={(v) => (
          <>
            <button
              onClick={() => router.push(`/admin/master-data/vehicles/${v.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(v)}
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
