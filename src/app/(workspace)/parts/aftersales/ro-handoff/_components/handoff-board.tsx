"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  HANDOFF_LABEL,
  HANDOFF_CHIP,
  type HandoffStatus,
} from "@/domain/ro-handoffs.constants";
import type { HandoffListRow } from "@/domain/ro-handoffs";

type Banner = { ok: boolean; msg: string } | null;
type Filter = { status: HandoffStatus | "all"; q: string };

type Props = {
  rows: HandoffListRow[];
  filter: Filter;
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

export function HandoffBoard({ rows, filter, canEdit: _canEdit }: Props) {
  // canEdit 目前只用於 detail 頁的 CRUD pill；list 頁不開 inline create
  void _canEdit;
  useSetPageHeader({
    title: "串接工單",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "串接工單" },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner] = useState<Banner>(null);
  const [statusLocal, setStatusLocal] = useState<Filter["status"]>(filter.status);
  const [qLocal, setQLocal] = useState(filter.q);

  function applyFilter() {
    const params = new URLSearchParams();
    if (statusLocal !== "all") params.set("status", statusLocal);
    if (qLocal.trim()) params.set("q", qLocal.trim());
    startTransition(() => {
      router.push(`/parts/aftersales/ro-handoff?${params.toString()}`);
    });
  }
  function resetFilter() {
    setStatusLocal("all");
    setQLocal("");
    startTransition(() => {
      router.push(`/parts/aftersales/ro-handoff`);
    });
  }

  const counts = useMemo(() => {
    const c: Record<HandoffStatus | "all", number> = {
      all: rows.length,
      awaiting_signature: 0,
      ready: 0,
      transferred: 0,
    };
    for (const r of rows) c[r.handoff_status] += 1;
    return c;
  }, [rows]);

  const columns = useMemo<DataGridColumn<HandoffListRow>[]>(
    () => [
      {
        id: "pi_no",
        header: "預檢編號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/ro-handoff/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:underline"
          >
            {r.pi_no}
          </Link>
        ),
        exportValue: (r) => r.pi_no,
        sortValue: (r) => r.pi_no,
      },
      {
        id: "handoff_status",
        header: "串接狀態",
        width: 100,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${HANDOFF_CHIP[r.handoff_status]}`}
          >
            {HANDOFF_LABEL[r.handoff_status]}
          </span>
        ),
        exportValue: (r) => HANDOFF_LABEL[r.handoff_status],
        sortValue: (r) => r.handoff_status,
      },
      {
        id: "customer",
        header: "車主",
        cell: (r) => (
          <span>
            {r.customer_name ?? "—"}
            {r.customer_phone ? (
              <span className="ml-1.5 text-[11px] text-[#9A9890]">{r.customer_phone}</span>
            ) : null}
          </span>
        ),
        exportValue: (r) => `${r.customer_name ?? ""} ${r.customer_phone ?? ""}`.trim(),
      },
      {
        id: "vehicle",
        header: "車輛",
        cell: (r) => (
          <span>
            <span className="font-mono">{r.vehicle_license_plate ?? "—"}</span>
            {r.vehicle_model_name ? (
              <span className="ml-1.5 text-[11px] text-[#5A5955]">{r.vehicle_model_name}</span>
            ) : null}
          </span>
        ),
        exportValue: (r) =>
          `${r.vehicle_license_plate ?? ""} ${r.vehicle_model_name ?? ""}`.trim(),
      },
      {
        id: "estimated_subtotal",
        header: "報價金額",
        width: 110,
        align: "right",
        cell: (r) => fmtMoney(r.estimated_subtotal),
        exportValue: (r) => r.estimated_subtotal,
        sortValue: (r) => r.estimated_subtotal ?? 0,
      },
      {
        id: "sa",
        header: "接待 SA",
        width: 100,
        cell: (r) => r.sa_name ?? "—",
        exportValue: (r) => r.sa_name,
      },
      {
        id: "signed_at",
        header: "簽名時間",
        width: 140,
        cell: (r) => fmtDateTime(r.signed_at),
        exportValue: (r) => r.signed_at,
        sortValue: (r) => r.signed_at,
      },
      {
        id: "ro_code",
        header: "已串接 RO",
        width: 160,
        cell: (r) =>
          r.ro_code ? (
            <Link
              href={`/parts/aftersales/repair-orders/${r.repair_order_id}`}
              className="font-mono text-[#1A3A5C] hover:underline"
            >
              {r.ro_code}
            </Link>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.ro_code,
        sortValue: (r) => r.ro_code,
      },
      {
        id: "transferred_at",
        header: "串接時間",
        width: 140,
        cell: (r) => fmtDateTime(r.transferred_at),
        exportValue: (r) => r.transferred_at,
        sortValue: (r) => r.transferred_at,
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">串接工單</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Sprint 5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          預檢單簽名後 → 設定 P1×P2 → 串接成正式 RO 工單
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">串接狀態</label>
            <select
              value={statusLocal}
              onChange={(e) => setStatusLocal(e.target.value as Filter["status"])}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
            >
              <option value="all">全部（{counts.all}）</option>
              <option value="awaiting_signature">
                {HANDOFF_LABEL.awaiting_signature}（{counts.awaiting_signature}）
              </option>
              <option value="ready">
                {HANDOFF_LABEL.ready}（{counts.ready}）
              </option>
              <option value="transferred">
                {HANDOFF_LABEL.transferred}（{counts.transferred}）
              </option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className="text-[11px] text-[#9A9890] font-medium">關鍵字</label>
            <input
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              placeholder="預檢編號 / 車主 / 車牌"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter") applyFilter();
              }}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
          <span className="ml-3">
            待簽 <b className="text-[#854F0B]">{counts.awaiting_signature}</b>
          </span>
          <span className="ml-2">
            可串接 <b className="text-[#0F6E56]">{counts.ready}</b>
          </span>
          <span className="ml-2">
            已串接 <b className="text-[#185FA5]">{counts.transferred}</b>
          </span>
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="aftersales/ro-handoff"
        exportFileName="ro-handoff"
        emptyMessage="沒有符合條件的串接單"
        disabled={isPending}
        rowActionsWidth={140}
        rowActions={(r) => (
          <Link
            href={`/parts/aftersales/ro-handoff/${r.id}`}
            className="inline-flex items-center justify-center h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            檢視
          </Link>
        )}
      />

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
