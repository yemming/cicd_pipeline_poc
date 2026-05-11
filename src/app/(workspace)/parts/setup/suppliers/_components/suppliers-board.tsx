"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  setSupplierActive,
  softDeleteSupplier,
  type SupplierWithContract,
  type ContractStatus,
} from "@/domain/suppliers";

const TYPE_LABEL: Record<string, { label: string; chip: string }> = {
  VEHICLE_DEALER: { label: "原廠 / 整車代理", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  PARTS_SUPPLIER: { label: "零件供應商", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  OTHER: { label: "其他 / 耗材", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const CONTRACT_LABEL: Record<ContractStatus, { label: string; chip: string }> = {
  valid: { label: "有效", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  expiring: { label: "即將到期", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  expired: { label: "已到期", chip: "bg-[#FDECEA] text-[#CC0000]" },
  none: { label: "未簽約", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

type Banner = { ok: boolean; msg: string } | null;

function formatDate(d: string | null): string {
  if (!d) return "—";
  return d.replace(/-/g, "/");
}

function formatPhone(p: string | null): string {
  return p ?? "—";
}

export function SuppliersBoard({
  rows,
  canEdit,
  initialType,
  initialContractStatus,
  initialQ,
}: {
  rows: SupplierWithContract[];
  canEdit: boolean;
  initialType: string;
  initialContractStatus: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [type, setType] = useState(initialType);
  const [contractStatus, setContractStatus] = useState(initialContractStatus);
  const [q, setQ] = useState(initialQ);
  const [banner, setBanner] = useState<Banner>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierWithContract | null>(null);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (type) params.set("type", type);
    if (contractStatus && contractStatus !== "all") params.set("contract_status", contractStatus);
    if (q) params.set("q", q);
    startTransition(() => {
      router.push(`/parts/setup/suppliers${params.toString() ? "?" + params.toString() : ""}`);
    });
  }

  function reset() {
    setType("");
    setContractStatus("all");
    setQ("");
    startTransition(() => {
      router.push("/parts/setup/suppliers");
    });
  }

  function toggleActive(row: SupplierWithContract) {
    startTransition(async () => {
      const res = await setSupplierActive(row.id, !row.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: row.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    startTransition(async () => {
      const res = await softDeleteSupplier(target.id);
      if (res.ok) {
        setDeleteTarget(null);
        showBanner({ ok: true, msg: "✓ 已刪除（軟刪除 + 連動合約停用）" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const total = rows.length;

  const columns: DataGridColumn<SupplierWithContract>[] = [
    {
      id: "name",
      header: "供應商名稱",
      width: 220,
      hideable: false,
      cell: (r) => (
        <div>
          <Link
            href={`/parts/setup/suppliers/${r.id}`}
            className="font-semibold text-[#1A3A5C] hover:text-[#0F2A45] hover:underline"
          >
            {r.name}
          </Link>
          {r.notes && <div className="text-[11px] text-[#9A9890]">{r.notes}</div>}
        </div>
      ),
      exportValue: (r) => r.name ?? "",
      sortValue: (r) => r.name ?? "",
    },
    {
      id: "type",
      header: "類型",
      width: 100,
      cell: (r) => {
        const def = TYPE_LABEL[r.supplier_type ?? ""] ?? {
          label: r.supplier_type ?? "—",
          chip: "bg-[#F2F2F2] text-[#6B6A68]",
        };
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.label}
          </span>
        );
      },
      exportValue: (r) => r.supplier_type ?? "",
      sortValue: (r) => r.supplier_type ?? "",
    },
    {
      id: "primary_contact",
      header: "主要聯絡人",
      width: 110,
      cell: (r) => r.primary_contact ?? "—",
      exportValue: (r) => r.primary_contact ?? "",
    },
    {
      id: "phone",
      header: "聯絡電話",
      width: 140,
      cell: (r) => <span className="font-mono text-[12px]">{formatPhone(r.phone)}</span>,
      exportValue: (r) => r.phone ?? "",
    },
    {
      id: "supply_categories",
      header: "供應品類",
      width: 200,
      cell: (r) => r.supply_categories || "—",
      exportValue: (r) => r.supply_categories,
      sortable: false,
    },
    {
      id: "latest_contract_to",
      header: "合約效期",
      width: 110,
      cell: (r) => <span className="font-mono text-[12px]">{formatDate(r.latest_contract_to)}</span>,
      exportValue: (r) => r.latest_contract_to ?? "",
      sortValue: (r) => r.latest_contract_to ?? "",
    },
    {
      id: "contract_status",
      header: "合約狀態",
      width: 100,
      cell: (r) => {
        const def = CONTRACT_LABEL[r.contract_status];
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.label}
          </span>
        );
      },
      exportValue: (r) => CONTRACT_LABEL[r.contract_status].label,
      sortValue: (r) => r.contract_status,
    },
    {
      id: "is_active",
      header: "狀態",
      width: 70,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
            停用
          </span>
        ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => (r.is_active ? 1 : 0),
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">供應商資訊管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          2.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          管理零件供應商基本資料、聯絡方式與供應能力
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">供應商類型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              <option value="VEHICLE_DEALER">原廠 / 整車代理</option>
              <option value="PARTS_SUPPLIER">零件供應商</option>
              <option value="OTHER">其他 / 耗材</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">合約狀態</label>
            <select
              value={contractStatus}
              onChange={(e) => setContractStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="all">全部</option>
              <option value="valid">有效</option>
              <option value="expiring">即將到期</option>
              <option value="expired">已到期</option>
              <option value="none">未簽約</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">供應商名稱</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋供應商..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
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
              onClick={reset}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/parts/setup/suppliers/new"
              aria-disabled={!canEdit}
              tabIndex={canEdit ? 0 : -1}
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center bg-[#0F6E56] text-white hover:bg-[#0a5742] ${
                canEdit ? "" : "opacity-50 pointer-events-none"
              }`}
            >
              ＋ 新增供應商
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{total}</b> 家供應商
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/setup/suppliers"
        exportFileName="suppliers"
        emptyMessage="沒有符合條件的供應商"
        disabled={isPending}
        rowActionsWidth={210}
        rowActions={(r) => (
          <>
            <Link
              href={`/parts/setup/suppliers/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </Link>
            <button
              type="button"
              onClick={() => toggleActive(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </>
        )}
      />

      {/* Banner */}
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

      {/* Delete confirm modal */}
      {deleteTarget && (
        <div
          className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
          onClick={() => !isPending && setDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-lg border border-[#EEECE6] shadow-xl max-w-[440px] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">刪除供應商</h3>
            </header>
            <div className="px-4 py-3">
              <p className="text-[13px] text-[#5A5955]">
                確認刪除供應商 <b>{deleteTarget.name}</b>（{deleteTarget.code}）？
              </p>
              <p className="text-[12px] text-[#9A9890] mt-1">
                這是軟刪除：is_active 設成 false、底下 active 合約會一併設為 inactive。
              </p>
              <div className="flex justify-end gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-50"
                >
                  {isPending ? "刪除中⋯" : "確認刪除"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
