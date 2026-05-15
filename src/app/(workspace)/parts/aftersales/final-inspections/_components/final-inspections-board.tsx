"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  FINAL_INSPECTION_STATUS,
  STATUS_CHIP,
  STATUS_LABEL,
  type FinalInspectionStatus,
} from "@/domain/final-inspections.constants";
import type {
  FinalInspectionListRow,
  RoCandidate,
} from "@/domain/final-inspections";
import { createFromRoAction } from "@/lib/aftersales/final-inspection-actions";

type Banner = { ok: boolean; msg: string } | null;

type Filter = { status: FinalInspectionStatus | "all"; q: string };

type Props = {
  rows: FinalInspectionListRow[];
  candidates: RoCandidate[];
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

export function FinalInspectionsBoard({ rows, candidates, filter, canEdit }: Props) {
  useSetPageHeader({
    title: "竣工複檢",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "竣工複檢" },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedRoId, setSelectedRoId] = useState<string>(candidates[0]?.id ?? "");
  const [statusLocal, setStatusLocal] = useState<Filter["status"]>(filter.status);
  const [qLocal, setQLocal] = useState(filter.q);

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (statusLocal !== "all") params.set("status", statusLocal);
    if (qLocal.trim()) params.set("q", qLocal.trim());
    startTransition(() => {
      router.push(`/parts/aftersales/final-inspections?${params.toString()}`);
    });
  }

  function resetFilter() {
    setStatusLocal("all");
    setQLocal("");
    startTransition(() => {
      router.push(`/parts/aftersales/final-inspections`);
    });
  }

  function handleCreate() {
    if (!selectedRoId) {
      showBanner({ ok: false, msg: "請先選擇要建立複檢的工單" });
      return;
    }
    startTransition(async () => {
      const res = await createFromRoAction(selectedRoId);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立複檢，跳轉中⋯" });
        setCreateOpen(false);
        router.push(`/parts/aftersales/final-inspections/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const columns = useMemo<DataGridColumn<FinalInspectionListRow>[]>(
    () => [
      {
        id: "inspection_no",
        header: "複檢編號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/aftersales/final-inspections/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:underline"
          >
            {r.inspection_no}
          </Link>
        ),
        exportValue: (r) => r.inspection_no,
        sortValue: (r) => r.inspection_no,
      },
      {
        id: "ro_code",
        header: "工單號",
        width: 150,
        cell: (r) =>
          r.ro_code ? (
            <Link
              href={`/parts/aftersales/repair-orders/${r.repair_order_id}/lines`}
              className="font-mono text-[#185FA5] hover:underline"
            >
              {r.ro_code}
            </Link>
          ) : (
            "—"
          ),
        exportValue: (r) => r.ro_code ?? "",
        sortValue: (r) => r.ro_code ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 130,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${STATUS_CHIP[r.status]}`}
          >
            {STATUS_LABEL[r.status]}
          </span>
        ),
        exportValue: (r) => STATUS_LABEL[r.status],
        sortValue: (r) => r.status,
      },
      {
        id: "customer",
        header: "車主",
        width: 120,
        cell: (r) => r.customer_name ?? "—",
        exportValue: (r) => r.customer_name ?? "",
      },
      {
        id: "vehicle",
        header: "車輛",
        width: 180,
        cell: (r) => (
          <span className="text-[12px]">
            {r.vehicle_model_name ?? "—"}{" "}
            <span className="font-mono text-[#5A5955]">
              {r.vehicle_license_plate ?? ""}
            </span>
          </span>
        ),
        exportValue: (r) =>
          [r.vehicle_model_name, r.vehicle_license_plate].filter(Boolean).join(" / "),
      },
      {
        id: "progress",
        header: "通過 / 總項",
        width: 110,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px]">
            <b className="text-[#3B6D11]">{r.passed_lines}</b>
            <span className="text-[#9A9890]"> / {r.total_lines}</span>
          </span>
        ),
        exportValue: (r) => `${r.passed_lines}/${r.total_lines}`,
        sortValue: (r) => r.total_lines === 0 ? 0 : r.passed_lines / r.total_lines,
      },
      {
        id: "inspector",
        header: "複檢員",
        width: 120,
        cell: (r) => r.inspector_name ?? <span className="text-[#9A9890]">—</span>,
        exportValue: (r) => r.inspector_name ?? "",
      },
      {
        id: "signed_at",
        header: "簽核時間",
        width: 150,
        cell: (r) => fmtDateTime(r.signed_at),
        exportValue: (r) => fmtDateTime(r.signed_at),
        sortValue: (r) => r.signed_at ?? "",
      },
      {
        id: "updated_at",
        header: "更新時間",
        width: 150,
        cell: (r) => fmtDateTime(r.updated_at),
        exportValue: (r) => fmtDateTime(r.updated_at),
        sortValue: (r) => r.updated_at ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">竣工複檢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後 · Step 6
        </span>
        <span className="text-[12px] text-[#9A9890]">
          維修完成後逐項複檢、試車、清潔、簽核、通知取車的 5 步驟單據
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={statusLocal}
              onChange={(e) => setStatusLocal(e.target.value as Filter["status"])}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
            >
              <option value="all">全部</option>
              {FINAL_INSPECTION_STATUS.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">關鍵字（複檢編號）</label>
            <input
              value={qLocal}
              onChange={(e) => setQLocal(e.target.value)}
              placeholder="FI-yymmdd-xxx"
              className="h-[30px] w-[180px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              disabled={!canEdit || candidates.length === 0}
              title={candidates.length === 0 ? "目前沒有可建立複檢的工單" : "從工單建立"}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增複檢
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 份複檢單　可建立來源工單{" "}
          <b className="text-[#2C2C2A]">{candidates.length}</b> 張
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/aftersales/final-inspections"
        exportFileName="final-inspections"
        emptyMessage="尚無竣工複檢資料"
        disabled={isPending}
      />

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-full max-w-[520px]">
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">從工單建立竣工複檢</h2>
              <button
                onClick={() => setCreateOpen(false)}
                className="ml-auto text-[#9A9890] hover:text-[#2C2C2A] text-[16px]"
                aria-label="關閉"
              >
                ✕
              </button>
            </header>
            <div className="p-4 space-y-3">
              <p className="text-[12px] text-[#5A5955]">
                選擇一張處於「維修中／進行中」且尚未建立複檢的工單。建立後將自動帶入該工單的所有維修項目。
              </p>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">候選工單</label>
                <select
                  value={selectedRoId}
                  onChange={(e) => setSelectedRoId(e.target.value)}
                  className="h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
                >
                  {candidates.length === 0 ? (
                    <option value="">（沒有可建立的工單）</option>
                  ) : (
                    candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.ro_code} · {c.customer_name ?? "未掛車主"} ·{" "}
                        {c.vehicle_license_plate ?? "—"} · {c.line_count} 項
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={() => setCreateOpen(false)}
                className="h-[32px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={isPending || !selectedRoId}
                className="h-[32px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
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
