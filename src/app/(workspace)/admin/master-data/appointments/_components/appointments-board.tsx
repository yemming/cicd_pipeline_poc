"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteAppointmentAction } from "@/lib/master-data/appointment-actions";
import type { ServiceAppointment } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  booked: { text: "已預約", color: "bg-[#DEEBFF] text-[#0747A6]" },
  checked_in: { text: "已報到", color: "bg-[#FFF7D6] text-[#7F5F01]" },
  in_progress: { text: "施工中", color: "bg-[#FFEEDB] text-[#974F0C]" },
  done: { text: "已完成", color: "bg-[#E3FCEF] text-[#006644]" },
  cancelled: { text: "已取消", color: "bg-[#DFE1E6] text-[#42526E]" },
  no_show: { text: "未到場", color: "bg-[#FFEBE6] text-[#BF2600]" },
};

const SERVICE_TYPE_LABEL: Record<string, string> = {
  general: "一般保養",
  scheduled_maintenance: "定期保養",
  repair: "維修",
  pdi: "PDI",
  other: "其他",
};

type CustomerLite = { id: string; name: string };
type VehicleLite = { id: string; license_plate: string | null; vin: string | null };
type AdvisorLite = { id: string; name: string };

export function AppointmentsBoard({
  rows,
  totalCount,
  page,
  pageSize,
  canEdit,
  customers,
  vehicles,
  advisors,
}: {
  rows: ServiceAppointment[];
  totalCount: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  customers: CustomerLite[];
  vehicles: VehicleLite[];
  advisors: AdvisorLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const advisorById = new Map(advisors.map((a) => [a.id, a]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const goToPage = (next: number) => {
    const p = new URLSearchParams();
    if (next > 1) p.set("page", String(next));
    const qs = p.toString();
    const href = qs
      ? `/admin/master-data/appointments?${qs}`
      : "/admin/master-data/appointments";
    startTransition(() => router.push(href));
  };

  const removeRow = (r: ServiceAppointment) => {
    const label = r.appt_no ?? r.id.slice(0, 8);
    if (!confirm(`確定刪除預約「${label}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteAppointmentAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString("zh-TW", { timeZone: "Asia/Taipei" });
  const formatTime = (iso: string) =>
    new Date(iso).toLocaleTimeString("zh-TW", {
      timeZone: "Asia/Taipei",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const columns: DataGridColumn<ServiceAppointment>[] = [
    {
      id: "appt_no",
      header: "單號",
      width: 180,
      hideable: false,
      cell: (a) => (
        <Link
          href={`/admin/master-data/appointments/${a.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {a.appt_no}
        </Link>
      ),
      exportValue: (a) => a.appt_no ?? "",
      sortValue: (a) => a.appt_no ?? "",
    },
    {
      id: "scheduled_at",
      header: "預約時間",
      width: 150,
      cell: (a) => (
        <span className="text-[12px]">
          {formatDate(a.scheduled_at)}
          <br />
          <span className="text-[#6B778C]">{formatTime(a.scheduled_at)}</span>
        </span>
      ),
      exportValue: (a) => `${formatDate(a.scheduled_at)} ${formatTime(a.scheduled_at)}`,
      sortValue: (a) => a.scheduled_at,
    },
    {
      id: "customer",
      header: "客戶",
      width: 140,
      cell: (a) => customerById.get(a.customer_id)?.name ?? "—",
      exportValue: (a) => customerById.get(a.customer_id)?.name ?? "",
      sortValue: (a) => customerById.get(a.customer_id)?.name ?? "",
    },
    {
      id: "vehicle",
      header: "車輛",
      cell: (a) => {
        if (!a.vehicle_id) return "—";
        const v = vehicleById.get(a.vehicle_id);
        return v?.license_plate ?? v?.vin ?? "—";
      },
      exportValue: (a) => {
        if (!a.vehicle_id) return "";
        const v = vehicleById.get(a.vehicle_id);
        return v?.license_plate ?? v?.vin ?? "";
      },
    },
    {
      id: "service_type",
      header: "類型",
      width: 110,
      cell: (a) => SERVICE_TYPE_LABEL[a.service_type] ?? a.service_type,
      exportValue: (a) => SERVICE_TYPE_LABEL[a.service_type] ?? a.service_type,
      sortValue: (a) => a.service_type,
    },
    {
      id: "advisor",
      header: "顧問",
      width: 110,
      cell: (a) =>
        a.advisor_id ? advisorById.get(a.advisor_id)?.name ?? "—" : "—",
      exportValue: (a) =>
        a.advisor_id ? advisorById.get(a.advisor_id)?.name ?? "" : "",
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (a) => {
        const s = STATUS_LABEL[a.status] ?? { text: a.status, color: "bg-[#DFE1E6]" };
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${s.color}`}
          >
            {s.text}
          </span>
        );
      },
      exportValue: (a) => STATUS_LABEL[a.status]?.text ?? a.status,
      sortValue: (a) => a.status,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">維修預約</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          客戶 / 車輛 / 顧問 與單號管理
        </span>
        {canEdit && (
          <button
            onClick={() => router.push("/admin/master-data/appointments/new")}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增預約
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
          筆預約（本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(a) => a.id}
        persistKey="admin/master-data/appointments"
        exportFileName="appointments"
        emptyMessage="尚無預約 — 點右上角「新增預約」開始建立"
        disabled={isPending}
        pagination={{ page, pageSize, totalCount, onPageChange: goToPage }}
        rowActions={(a) => (
          <>
            <button
              onClick={() =>
                router.push(`/admin/master-data/appointments/${a.id}`)
              }
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(a)}
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
