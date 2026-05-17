"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteInspectionAction } from "@/lib/master-data/inspection-actions";
import type { InspectionRecord } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

const OVERALL_LABEL: Record<string, string> = {
  pending: "待檢",
  pass: "通過",
  fail: "未通過",
  conditional: "有條件",
};

const OVERALL_COLOR: Record<string, string> = {
  pending: "bg-[#DFE1E6] text-[#42526E]",
  pass: "bg-[#E3FCEF] text-[#006644]",
  fail: "bg-[#FFEBE6] text-[#BF2600]",
  conditional: "bg-[#FFF7E6] text-[#974F00]",
};

type VehicleLite = { id: string; license_plate: string | null; vin: string | null };
type EmployeeLite = { id: string; name: string };

export function InspectionsBoard({
  rows,
  totalCount,
  page,
  pageSize,
  canEdit,
  vehicles,
  employees,
}: {
  rows: InspectionRecord[];
  totalCount: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  vehicles: VehicleLite[];
  employees: EmployeeLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const employeeById = new Map(employees.map((e) => [e.id, e]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const goToPage = (next: number) => {
    const p = new URLSearchParams();
    if (next > 1) p.set("page", String(next));
    const qs = p.toString();
    const href = qs
      ? `/admin/master-data/inspections?${qs}`
      : "/admin/master-data/inspections";
    startTransition(() => router.push(href));
  };

  const removeRow = (r: InspectionRecord) => {
    if (!confirm("確定刪除此檢驗紀錄？此動作無法復原。")) return;
    startTransition(async () => {
      const res = await deleteInspectionAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<InspectionRecord>[] = [
    {
      id: "kind",
      header: "類型",
      width: 80,
      hideable: false,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-mono font-medium whitespace-nowrap ${
            r.kind === "PDI"
              ? "bg-[#EAE6FF] text-[#403294]"
              : "bg-[#DEEBFF] text-[#0747A6]"
          }`}
        >
          {r.kind}
        </span>
      ),
      exportValue: (r) => r.kind,
      sortValue: (r) => r.kind,
    },
    {
      id: "vehicle",
      header: "車輛",
      width: 180,
      cell: (r) => {
        const v = vehicleById.get(r.vehicle_id);
        if (!v) return <span className="text-[#BF2600]">車輛已刪除</span>;
        return (
          <span className="font-mono text-[12px]">
            {v.license_plate || v.vin?.slice(-8) || "—"}
          </span>
        );
      },
      exportValue: (r) => {
        const v = vehicleById.get(r.vehicle_id);
        return v?.license_plate ?? v?.vin ?? "";
      },
      sortValue: (r) => {
        const v = vehicleById.get(r.vehicle_id);
        return v?.license_plate ?? v?.vin ?? "";
      },
    },
    {
      id: "inspector",
      header: "檢驗員",
      width: 140,
      cell: (r) =>
        r.inspector_id ? (
          employeeById.get(r.inspector_id)?.name ?? "—"
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (r) =>
        r.inspector_id ? employeeById.get(r.inspector_id)?.name ?? "" : "",
    },
    {
      id: "inspected_at",
      header: "檢驗時間",
      width: 160,
      cell: (r) =>
        new Date(r.inspected_at).toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
        }),
      exportValue: (r) =>
        new Date(r.inspected_at).toLocaleString("zh-TW", {
          timeZone: "Asia/Taipei",
        }),
      sortValue: (r) => r.inspected_at,
    },
    {
      id: "mileage",
      header: "里程",
      width: 100,
      align: "right",
      cell: (r) =>
        r.mileage_at_inspection != null ? (
          `${Number(r.mileage_at_inspection).toLocaleString()} km`
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (r) =>
        r.mileage_at_inspection != null
          ? `${Number(r.mileage_at_inspection).toLocaleString()} km`
          : "",
      sortValue: (r) => Number(r.mileage_at_inspection ?? 0),
    },
    {
      id: "status",
      header: "判定",
      width: 90,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${OVERALL_COLOR[r.overall_status] ?? ""}`}
        >
          {OVERALL_LABEL[r.overall_status] ?? r.overall_status}
        </span>
      ),
      exportValue: (r) => OVERALL_LABEL[r.overall_status] ?? r.overall_status,
      sortValue: (r) => r.overall_status,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">PI / PDI 檢驗</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          PI 進廠檢驗 / PDI 交車前檢驗
        </span>
        {canEdit && (
          <button
            onClick={() => router.push("/admin/master-data/inspections/new")}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增檢驗
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
          筆檢驗紀錄（本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/master-data/inspections"
        exportFileName="inspections"
        emptyMessage="尚無檢驗紀錄 — 點右上角「新增檢驗」開始建立"
        disabled={isPending}
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
        rowActions={(r) => (
          <>
            <button
              onClick={() => router.push(`/admin/master-data/inspections/${r.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(r)}
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
