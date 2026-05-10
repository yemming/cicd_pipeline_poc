"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  deleteCoaAccountAction,
  setCoaActiveAction,
} from "@/lib/accounting/coa-actions";
import type { CoaRow } from "@/lib/accounting/queries";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Banner = { ok: boolean; msg: string } | null;

const L1_LABEL: Record<string, string> = {
  ASSET: "資產",
  LIABILITY: "負債",
  EQUITY: "權益",
  REVENUE: "營業收入",
  COGS: "營業成本",
  EXPENSE: "營業費用",
  NON_OPERATING: "營業外",
  TAX: "所得稅",
};
const DEALER_LABEL: Record<string, string> = {
  GENERAL: "通用",
  VEHICLE_SALES: "整車銷售",
  VEHICLE_INV: "車輛庫存",
  SERVICE: "維修",
  PARTS: "零件",
  INSURANCE: "保險",
  FINANCE: "分期/融資",
};
const DEALER_CHIP: Record<string, string> = {
  GENERAL: "bg-[#EEF4FB] text-[#185FA5]",
  VEHICLE_SALES: "bg-[#FDECEA] text-[#CC0000]",
  VEHICLE_INV: "bg-[#FDF3E3] text-[#854F0B]",
  SERVICE: "bg-[#E8F5F0] text-[#0F6E56]",
  PARTS: "bg-[#EAF3DE] text-[#3B6D11]",
  INSURANCE: "bg-[#EAF4FB] text-[#185FA5]",
  FINANCE: "bg-[#F2EAFB] text-[#5E2EA0]",
};
const LEVEL_LABEL: Record<string, string> = {
  L1_CATEGORY: "L1",
  L2_SUBCATEGORY: "L2",
  L3_MOEA: "L3",
  L4_PARENT: "L4",
  L5_DETAIL: "L5",
};
const LEVEL_CHIP: Record<string, string> = {
  L1_CATEGORY: "bg-[#1A3A5C] text-white",
  L2_SUBCATEGORY: "bg-[#185FA5] text-white",
  L3_MOEA: "bg-[#EAF4FB] text-[#185FA5]",
  L4_PARENT: "bg-[#FDF3E3] text-[#854F0B]",
  L5_DETAIL: "bg-[#EAF3DE] text-[#3B6D11]",
};

export type CoaFilterState = {
  q?: string;
  l1?: string;
  dealer?: string;
  level?: string;
  postable?: string;
  status?: string;
};

export function CoaBoard({
  rows,
  totalCount,
  filters,
  page,
  pageSize,
}: {
  rows: CoaRow[];
  totalCount: number;
  filters: CoaFilterState;
  page: number;
  pageSize: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fQ, setFQ] = useState(filters.q ?? "");
  const [fL1, setFL1] = useState(filters.l1 ?? "all");
  const [fDealer, setFDealer] = useState(filters.dealer ?? "all");
  const [fLevel, setFLevel] = useState(filters.level ?? "all");
  const [fPostable, setFPostable] = useState(filters.postable ?? "all");
  const [fStatus, setFStatus] = useState(filters.status ?? "all");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildHref = (override: Partial<CoaFilterState> & { page?: number } = {}) => {
    const p = new URLSearchParams();
    const q = override.q ?? fQ.trim();
    const l1 = override.l1 ?? fL1;
    const dealer = override.dealer ?? fDealer;
    const level = override.level ?? fLevel;
    const postable = override.postable ?? fPostable;
    const status = override.status ?? fStatus;
    if (q && q.trim()) p.set("q", q.trim());
    if (l1 !== "all") p.set("l1", l1);
    if (dealer !== "all") p.set("dealer", dealer);
    if (level !== "all") p.set("level", level);
    if (postable !== "all") p.set("postable", postable);
    if (status !== "all") p.set("status", status);
    if (override.page && override.page > 1) p.set("page", String(override.page));
    const qs = p.toString();
    return qs ? `/admin/accounting/coa?${qs}` : "/admin/accounting/coa";
  };

  const submitFilters = () => {
    // 改 filter 一律重置到第 1 頁
    const href = buildHref({ page: 1 });
    startTransition(() => router.push(href));
  };
  const resetFilters = () => {
    setFQ("");
    setFL1("all");
    setFDealer("all");
    setFLevel("all");
    setFPostable("all");
    setFStatus("all");
    startTransition(() => router.push("/admin/accounting/coa"));
  };

  const goToPage = (next: number) => {
    const href = buildHref({ page: next });
    startTransition(() => router.push(href));
  };

  const toggleActive = (r: CoaRow) => {
    if (r.is_locked) {
      showBanner({ ok: false, msg: "L1-L3 結構鎖定，不可停用" });
      return;
    }
    startTransition(async () => {
      const res = await setCoaActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: CoaRow) => {
    if (r.is_locked) {
      showBanner({ ok: false, msg: "L1-L3 鎖定不可刪" });
      return;
    }
    if (r.is_system_default) {
      showBanner({ ok: false, msg: "系統預設科目不可刪除（可改用停用）" });
      return;
    }
    if (!confirm(`確定刪除「${r.account_code} ${r.name_zh_tw}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteCoaAccountAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const l5Postable = rows.filter((r) => r.is_postable).length;

  const columns: DataGridColumn<CoaRow>[] = [
    {
      id: "account_code",
      header: "代碼",
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/admin/accounting/coa/${r.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {r.account_code}
        </Link>
      ),
      exportValue: (r) => r.account_code,
      sortValue: (r) => r.account_code,
    },
    {
      id: "level",
      header: "層",
      width: 60,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            LEVEL_CHIP[r.level] ?? ""
          }`}
        >
          {LEVEL_LABEL[r.level] ?? r.level}
        </span>
      ),
      exportValue: (r) => LEVEL_LABEL[r.level] ?? r.level,
      sortValue: (r) => r.level,
    },
    {
      id: "name_zh_tw",
      header: "科目名稱",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.is_locked && (
            <span className="text-[#9A9890] text-[11px]" title="L1-L3 鎖定">
              🔒
            </span>
          )}
          <Link
            href={`/admin/accounting/coa/${r.id}`}
            className="text-[#185FA5] hover:underline"
          >
            {r.display_indent_name ?? r.name_zh_tw}
          </Link>
        </span>
      ),
      exportValue: (r) => r.display_indent_name ?? r.name_zh_tw,
      sortValue: (r) => r.display_indent_name ?? r.name_zh_tw,
    },
    {
      id: "l1_category",
      header: "大類",
      width: 100,
      cell: (r) => <span>{L1_LABEL[r.l1_category] ?? r.l1_category}</span>,
      exportValue: (r) => L1_LABEL[r.l1_category] ?? r.l1_category,
      sortValue: (r) => r.l1_category,
    },
    {
      id: "dealer_category",
      header: "業態",
      width: 100,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            DEALER_CHIP[r.dealer_category] ?? ""
          }`}
        >
          {DEALER_LABEL[r.dealer_category] ?? r.dealer_category}
        </span>
      ),
      exportValue: (r) => DEALER_LABEL[r.dealer_category] ?? r.dealer_category,
      sortValue: (r) => r.dealer_category,
    },
    {
      id: "moea_code",
      header: "MOEA",
      width: 80,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.moea_code ?? "—"}
        </span>
      ),
      exportValue: (r) => r.moea_code ?? "",
      sortValue: (r) => r.moea_code ?? "",
    },
    {
      id: "normal_balance",
      header: "借/貸",
      width: 60,
      cell: (r) => (
        <span className="text-[12px]">
          {r.normal_balance === "D" ? "借" : "貸"}
        </span>
      ),
      exportValue: (r) => (r.normal_balance === "D" ? "借" : "貸"),
      sortValue: (r) => r.normal_balance,
    },
    {
      id: "is_postable",
      header: "入帳",
      width: 90,
      cell: (r) =>
        r.is_postable ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            ✓ 可入帳
          </span>
        ) : (
          <span className="text-[11.5px] text-[#9A9890]">rollup</span>
        ),
      exportValue: (r) => (r.is_postable ? "可入帳" : "rollup"),
      sortValue: (r) => r.is_postable,
    },
    {
      id: "required_dimensions",
      header: "必填維度",
      sortable: false,
      cell: (r) =>
        r.required_dimensions && r.required_dimensions.length > 0 ? (
          <span className="text-[11.5px] text-[#5A5955] font-mono">
            {r.required_dimensions.join(", ")}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.required_dimensions ?? []).join(", "),
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            停用
          </span>
        ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">會計科目表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          COA v2.0
        </span>
        <span className="text-[12px] text-[#9A9890]">
          5 層架構（MOEA 錨點）・依 template_pack「MOTORCYCLE」部署・tenant = default group
        </span>
      </header>

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

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              placeholder="科目代碼 / 名稱 / MOEA"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>大類 (L1)</label>
            <select
              className={inputClass}
              value={fL1}
              onChange={(e) => setFL1(e.target.value)}
            >
              <option value="all">全部</option>
              {Object.entries(L1_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>業態</label>
            <select
              className={inputClass}
              value={fDealer}
              onChange={(e) => setFDealer(e.target.value)}
            >
              <option value="all">全部</option>
              {Object.entries(DEALER_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>層級</label>
            <select
              className={inputClass}
              value={fLevel}
              onChange={(e) => setFLevel(e.target.value)}
            >
              <option value="all">全部</option>
              {Object.entries(LEVEL_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>可入帳</label>
            <select
              className={inputClass}
              value={fPostable}
              onChange={(e) => setFPostable(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="yes">是 (L5)</option>
              <option value="no">否 (L1-L4)</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
            >
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              onClick={() => router.push("/admin/accounting/coa/new")}
              disabled={isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增 L5 科目
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b>{" "}
          筆科目（本頁顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length}</b> 筆，其中可入帳{" "}
          <b className="text-[#2C2C2A]">{l5Postable}</b> 筆 L5）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/accounting/coa"
        exportFileName="chart-of-accounts"
        emptyMessage="沒有符合條件的科目"
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
        rowActions={(r) => (
          <>
            <button
              onClick={() => router.push(`/admin/accounting/coa/${r.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => toggleActive(r)}
              disabled={isPending || r.is_locked}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              onClick={() => removeRow(r)}
              disabled={isPending || r.is_locked || r.is_system_default}
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
