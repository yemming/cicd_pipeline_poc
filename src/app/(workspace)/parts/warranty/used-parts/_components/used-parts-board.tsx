"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  DEFAULT_KEEP_DAYS,
  DERIVED_STATUS_CHIP,
  DERIVED_STATUS_LABEL,
  OEM_DIRECTIVE_LIST,
  PILL_FILTERS,
  RETURN_RECIPIENTS,
} from "@/domain/warranty.constants";
import {
  batchMarkOldParts,
  markOldPartDisposed,
  markOldPartReturned,
  registerOldPart,
  type OldPartListItem,
  type OldPartsStats,
} from "@/domain/warranty";

type Props = {
  rows: OldPartListItem[];
  totalCount: number;
  stats: OldPartsStats;
  canEdit: boolean;
  items: Array<{ id: string; code: string; name: string }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
  initialFilter: {
    status: string;
    wc_no: string;
    ro_no: string;
    keyword: string;
    expiry_from: string;
  };
  currentPage: number;
  pageSize: number;
};

type Banner = { ok: boolean; msg: string } | null;

export function UsedPartsBoard({
  rows,
  totalCount,
  stats,
  canEdit,
  items,
  warehouses,
  initialFilter,
  currentPage,
  pageSize,
}: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // filter local state
  const [status, setStatus] = useState(initialFilter.status);
  const [wcNo, setWcNo] = useState(initialFilter.wc_no);
  const [roNo, setRoNo] = useState(initialFilter.ro_no);
  const [keyword, setKeyword] = useState(initialFilter.keyword);
  const [expiryFrom, setExpiryFrom] = useState(initialFilter.expiry_from);

  // modal flags
  const [inboundOpen, setInboundOpen] = useState(false);
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [pendingTargetId, setPendingTargetId] = useState<string | null>(null);
  const [batchMode, setBatchMode] = useState(false);

  // side panel
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeRow = rows.find((r) => r.id === activeId) ?? null;

  // checkbox selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [banner, setBanner] = useState<Banner>(null);

  function pushUrl(params: Record<string, string>) {
    const q = new URLSearchParams(sp.toString());
    for (const k of Object.keys(params)) {
      if (params[k]) q.set(k, params[k]);
      else q.delete(k);
    }
    q.delete("page"); // filter 變動回第 1 頁
    router.push(`?${q.toString()}`);
  }

  function goPage(p: number) {
    const q = new URLSearchParams(sp.toString());
    q.set("page", String(p));
    router.push(`?${q.toString()}`);
  }

  function applyFilters() {
    pushUrl({
      status,
      wc_no: wcNo,
      ro_no: roNo,
      keyword,
      expiry_from: expiryFrom,
    });
  }

  function resetFilters() {
    setStatus("all");
    setWcNo("");
    setRoNo("");
    setKeyword("");
    setExpiryFrom("");
    router.push("?");
  }

  function setPillStatus(key: string) {
    setStatus(key);
    pushUrl({
      status: key,
      wc_no: wcNo,
      ro_no: roNo,
      keyword,
      expiry_from: expiryFrom,
    });
  }

  function toast(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function openSide(id: string) {
    setActiveId(id);
  }
  function closeSide() {
    setActiveId(null);
  }

  function startQuickReturn(id: string) {
    setBatchMode(false);
    setPendingTargetId(id);
    setReturnOpen(true);
  }
  function startQuickDestroy(id: string) {
    setBatchMode(false);
    setPendingTargetId(id);
    setDestroyOpen(true);
  }
  function startBatch(kind: "return" | "destroy") {
    if (selected.size === 0) {
      toast({ ok: false, msg: "請先勾選要處理的舊件" });
      return;
    }
    setBatchMode(true);
    setPendingTargetId(null);
    if (kind === "return") setReturnOpen(true);
    else setDestroyOpen(true);
  }

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleSelectAll(allIds: string[]) {
    if (selected.size === allIds.length) setSelected(new Set());
    else setSelected(new Set(allIds));
  }

  // ───── DataGrid columns ─────
  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const columns: DataGridColumn<OldPartListItem>[] = [
    {
      id: "select",
      header: "",
      width: 36,
      hideable: false,
      sortable: false,
      cell: (r) => (
        <input
          type="checkbox"
          checked={selected.has(r.id)}
          onChange={(e) => {
            e.stopPropagation();
            toggleSelect(r.id);
          }}
          onClick={(e) => e.stopPropagation()}
          className="cursor-pointer"
        />
      ),
    },
    {
      id: "wc_no",
      header: "索賠件編號",
      width: 150,
      hideable: false,
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#185FA5]">{r.wc_no}</span>
      ),
      exportValue: (r) => r.wc_no,
      sortValue: (r) => r.wc_no,
    },
    {
      id: "item",
      header: "零件名稱 / 備件代碼",
      width: 220,
      cell: (r) => (
        <div className="leading-tight">
          <div className="font-medium text-[12px]">{r.item_name ?? "—"}</div>
          <div className="font-mono text-[10.5px] text-[#5A5955]">
            {r.item_code ?? "—"}
          </div>
        </div>
      ),
      exportValue: (r) => `${r.item_name ?? ""}｜${r.item_code ?? ""}`,
      sortValue: (r) => r.item_code ?? "",
    },
    {
      id: "serial",
      header: "序列號",
      width: 130,
      cell: (r) => (
        <span className="font-mono text-[10.5px]">{r.serial_no ?? "—"}</span>
      ),
      exportValue: (r) => r.serial_no ?? "",
    },
    {
      id: "ro",
      header: "關聯 RO 工單",
      width: 140,
      cell: (r) => {
        const ro =
          r.metadata &&
          typeof r.metadata === "object" &&
          !Array.isArray(r.metadata) &&
          typeof (r.metadata as Record<string, unknown>).ro_no === "string"
            ? ((r.metadata as Record<string, unknown>).ro_no as string)
            : "—";
        return (
          <span className="text-[12px] text-[#185FA5] font-mono">{ro}</span>
        );
      },
      exportValue: (r) =>
        r.metadata &&
        typeof r.metadata === "object" &&
        !Array.isArray(r.metadata) &&
        typeof (r.metadata as Record<string, unknown>).ro_no === "string"
          ? ((r.metadata as Record<string, unknown>).ro_no as string)
          : "",
    },
    {
      id: "entry",
      header: "入庫日期",
      width: 100,
      cell: (r) => <span className="text-[11.5px]">{r.entry_date}</span>,
      exportValue: (r) => r.entry_date,
      sortValue: (r) => r.entry_date,
    },
    {
      id: "expiry",
      header: "保管到期日",
      width: 110,
      cell: (r) => (
        <span
          className={`text-[11.5px] ${
            r.derived_status === "overdue"
              ? "text-[#CC0000] font-bold"
              : r.derived_status === "warn"
                ? "text-[#854F0B] font-bold"
                : ""
          }`}
        >
          {r.expiry_date ?? "—"}
        </span>
      ),
      exportValue: (r) => r.expiry_date ?? "",
      sortValue: (r) => r.expiry_date ?? "",
    },
    {
      id: "days",
      header: "剩餘天數",
      width: 110,
      cell: (r) => {
        if (r.derived_status === "destroyed")
          return (
            <span className="inline-flex px-2 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] text-[11px]">
              已銷毀
            </span>
          );
        if (r.derived_status === "sent")
          return (
            <span className="inline-flex px-2 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] text-[11px]">
              已處置
            </span>
          );
        const label =
          r.days_remaining < 0
            ? `已逾期 ${Math.abs(r.days_remaining)} 天`
            : `剩餘 ${r.days_remaining} 天`;
        const cls =
          r.derived_status === "overdue"
            ? "bg-[#FDECEA] text-[#CC0000]"
            : r.derived_status === "warn"
              ? "bg-[#FDF3E3] text-[#854F0B]"
              : "bg-[#EAF3DE] text-[#3B6D11]";
        return (
          <span
            className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${cls}`}
          >
            {label}
          </span>
        );
      },
      exportValue: (r) =>
        r.derived_status === "destroyed"
          ? "已銷毀"
          : r.derived_status === "sent"
            ? "已處置"
            : r.days_remaining < 0
              ? `已逾期 ${Math.abs(r.days_remaining)} 天`
              : `剩餘 ${r.days_remaining} 天`,
      sortValue: (r) => r.days_remaining,
    },
    {
      id: "directive",
      header: "原廠處置指示",
      width: 130,
      cell: (r) => (
        <span className="text-[11.5px] text-[#5A5955]">
          {r.oem_directive ?? "—"}
        </span>
      ),
      exportValue: (r) => r.oem_directive ?? "",
    },
    {
      id: "status",
      header: "處置狀態",
      width: 130,
      cell: (r) => (
        <span
          className={`inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${DERIVED_STATUS_CHIP[r.derived_status]}`}
        >
          {DERIVED_STATUS_LABEL[r.derived_status]}
        </span>
      ),
      exportValue: (r) => DERIVED_STATUS_LABEL[r.derived_status],
      sortValue: (r) => r.derived_status,
    },
  ];

  const allChecked = selected.size > 0 && selected.size === allIds.length;

  return (
    <main className="px-6 py-5 space-y-3">
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

      {/* Alert banner */}
      {stats.imminentList.length > 0 && (
        <section className="bg-[#FEF5F5] border border-[#F7C1C1] border-l-4 border-l-[#E24B4A] rounded-md p-3 flex items-start gap-2.5">
          <span className="text-[17px]">🔴</span>
          <div className="flex-1">
            <div className="text-[12px] text-[#CC0000] font-medium">
              保固舊件保管期限告警：以下舊件已逾期或即將到期，請依規定執行銷毀或寄回原廠
            </div>
            <div className="flex flex-col gap-1 mt-1.5">
              {stats.imminentList.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center gap-2 px-2 py-1 rounded bg-[#FFF1F1] text-[11px]"
                >
                  <span
                    className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-bold ${
                      it.derived_status === "overdue"
                        ? "bg-[#FDECEA] text-[#CC0000]"
                        : "bg-[#FDF3E3] text-[#854F0B]"
                    }`}
                  >
                    {it.days_remaining < 0
                      ? `已逾期 ${Math.abs(it.days_remaining)} 天`
                      : `剩餘 ${it.days_remaining} 天`}
                  </span>
                  <button
                    onClick={() => openSide(it.id)}
                    className="text-[#CC0000] font-bold underline"
                  >
                    {it.wc_no}
                  </button>
                  <span className="text-[#5A5955]">{it.item_name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Stats strip */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <StatCard num={stats.overdue} label="🔴 已逾期" color="red" />
        <StatCard
          num={stats.warning}
          label="🟠 即將到期（≤7天）"
          color="orange"
        />
        <StatCard num={stats.in_storage} label="🟢 保管中（正常）" color="green" />
        <StatCard num={stats.returned} label="🔵 已寄回原廠" color="blue" />
        <StatCard num={stats.disposed} label="⚫ 已銷毀" color="gray" />
      </section>

      {/* Header */}
      <header className="flex items-center gap-2.5 pt-1 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          保固索賠舊件管理
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          11.4 ★4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          保固維修拆下的舊件不計入可用庫存，獨立管理保管期限與處置（銷毀 / 寄回原廠）
        </span>
      </header>

      {/* ★4 反向跨模組 e2e banner — 保固舊件管理 ↔ 竣工複檢（C8） */}
      <div className="rounded-xl border border-[#BA7517] bg-[#FAEEDA] px-4 py-3 text-[12px] text-[#854F0B] leading-relaxed">
        <p className="font-semibold mb-1">
          🛡️ ★4 跨模組串接：保固舊件管理 ↔ 竣工複檢（C8）
        </p>
        <p>
          竣工複檢標記為
          <span className="mx-1 inline-flex items-center px-1.5 py-0.5 rounded-md bg-white border border-[#BA7517] text-[#854F0B] font-mono text-[11px]">
            ✕ 異常
          </span>
          且屬於原廠保固範圍的舊件，會自動於本頁建立保管紀錄（依 Ducati SRV-SRB-26-014 規定）。請至
          <a
            href="/service/inspection"
            className="mx-1 text-[#185FA5] underline font-medium hover:text-[#0F2A45]"
          >
            竣工複檢
          </a>
          頁查詢觸發來源 RO 工單；此處承接後續保管期限追蹤、寄回原廠或銷毀流程。
        </p>
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <Field label="索賠單號">
            <input
              value={wcNo}
              onChange={(e) => setWcNo(e.target.value)}
              placeholder="WC-"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] w-[150px]"
            />
          </Field>
          <Field label="關聯 RO 工單號">
            <input
              value={roNo}
              onChange={(e) => setRoNo(e.target.value)}
              placeholder="RO-"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] w-[150px]"
            />
          </Field>
          <Field label="零件名稱 / 料號 / 序列號">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="關鍵字"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] w-[180px]"
            />
          </Field>
          <Field label="保管到期日（起）">
            <input
              type="date"
              value={expiryFrom}
              onChange={(e) => setExpiryFrom(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </Field>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={applyFilters}
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
              onClick={() => setInboundOpen(true)}
              disabled={!canEdit || isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增入庫
            </button>
          </div>
        </div>
      </section>

      {/* Pills */}
      <div className="flex gap-1.5 flex-wrap">
        {PILL_FILTERS.map((p) => {
          const isActive = status === p.key;
          const count =
            p.key === "all"
              ? stats.total
              : p.key === "overdue"
                ? stats.overdue
                : p.key === "warn"
                  ? stats.warning
                  : p.key === "ok"
                    ? stats.in_storage
                    : p.key === "sent"
                      ? stats.returned
                      : stats.disposed;
          return (
            <button
              key={p.key}
              onClick={() => setPillStatus(p.key)}
              className={`h-[28px] px-3 rounded-full text-[12px] font-medium border ${
                isActive
                  ? "bg-[#185FA5] text-white border-[#185FA5]"
                  : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#185FA5] hover:text-[#185FA5]"
              }`}
            >
              {p.label}{" "}
              <span
                className={`ml-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold ${
                  isActive
                    ? "bg-white/25 text-white"
                    : "bg-[#F2F2F2] text-[#5A5955]"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆保固舊件
          {selected.size > 0 && (
            <>
              （已選 <b className="text-[#185FA5]">{selected.size}</b> 筆）
            </>
          )}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() => toggleSelectAll(allIds)}
            className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            {allChecked ? "取消全選" : "全選本頁"}
          </button>
          <button
            onClick={() => startBatch("return")}
            disabled={!canEdit || isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            🔵 標記寄回
          </button>
          <button
            onClick={() => startBatch("destroy")}
            disabled={!canEdit || isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            ⚫ 標記銷毀
          </button>
        </div>
      </div>

      {/* DataGrid */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/warranty/used-parts"
        exportFileName="used-parts"
        emptyMessage="沒有符合條件的舊件"
        disabled={isPending}
        rowActionsWidth={220}
        pagination={{
          page: currentPage,
          pageSize,
          totalCount,
          onPageChange: goPage,
        }}
        rowActions={(r) => (
          <div className="flex gap-1 justify-end">
            {(r.derived_status === "overdue" ||
              r.derived_status === "warn" ||
              r.derived_status === "ok") && (
              <>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startQuickReturn(r.id);
                  }}
                  disabled={!canEdit || isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FEF0EB] border border-[#f5c2a8] text-[#D85A30] hover:bg-[#fde0d3] disabled:opacity-50"
                >
                  寄回
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    startQuickDestroy(r.id);
                  }}
                  disabled={!canEdit || isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                >
                  銷毀
                </button>
              </>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                openSide(r.id);
              }}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              查看
            </button>
          </div>
        )}
      />

      {/* Inbound modal */}
      {inboundOpen && (
        <InboundModal
          items={items}
          warehouses={warehouses}
          onClose={() => setInboundOpen(false)}
          onSubmit={(input) => {
            startTransition(async () => {
              const res = await registerOldPart(input);
              if (res.ok) {
                toast({
                  ok: true,
                  msg: `✓ 已登記入庫，編號 ${res.data.wc_no}`,
                });
                setInboundOpen(false);
                router.refresh();
              } else {
                toast({ ok: false, msg: res.error });
              }
            });
          }}
          pending={isPending}
        />
      )}

      {/* Destroy modal */}
      {destroyOpen && (
        <DestroyModal
          onClose={() => {
            setDestroyOpen(false);
            setPendingTargetId(null);
            setBatchMode(false);
          }}
          onSubmit={(input) => {
            startTransition(async () => {
              if (batchMode) {
                const ids = Array.from(selected);
                const res = await batchMarkOldParts(ids, "disposed", input);
                if (res.ok) {
                  toast({
                    ok: true,
                    msg: `✓ 已標記 ${res.data.updated} 筆為已銷毀`,
                  });
                  setDestroyOpen(false);
                  setSelected(new Set());
                  setBatchMode(false);
                  router.refresh();
                } else {
                  toast({ ok: false, msg: res.error });
                }
              } else if (pendingTargetId) {
                const res = await markOldPartDisposed(pendingTargetId, input);
                if (res.ok) {
                  toast({ ok: true, msg: "✓ 已標記銷毀" });
                  setDestroyOpen(false);
                  setPendingTargetId(null);
                  router.refresh();
                } else {
                  toast({ ok: false, msg: res.error });
                }
              }
            });
          }}
          pending={isPending}
          batchCount={batchMode ? selected.size : 1}
        />
      )}

      {/* Return modal */}
      {returnOpen && (
        <ReturnModal
          onClose={() => {
            setReturnOpen(false);
            setPendingTargetId(null);
            setBatchMode(false);
          }}
          onSubmit={(input) => {
            startTransition(async () => {
              if (batchMode) {
                const ids = Array.from(selected);
                const res = await batchMarkOldParts(ids, "returned", input);
                if (res.ok) {
                  toast({
                    ok: true,
                    msg: `✓ 已標記 ${res.data.updated} 筆為已寄回`,
                  });
                  setReturnOpen(false);
                  setSelected(new Set());
                  setBatchMode(false);
                  router.refresh();
                } else {
                  toast({ ok: false, msg: res.error });
                }
              } else if (pendingTargetId) {
                const res = await markOldPartReturned(pendingTargetId, input);
                if (res.ok) {
                  toast({ ok: true, msg: "✓ 已標記寄回原廠" });
                  setReturnOpen(false);
                  setPendingTargetId(null);
                  router.refresh();
                } else {
                  toast({ ok: false, msg: res.error });
                }
              }
            });
          }}
          pending={isPending}
          batchCount={batchMode ? selected.size : 1}
        />
      )}

      {/* Side panel */}
      {activeRow && (
        <>
          <div
            className="fixed inset-0 bg-black/25 z-[200]"
            onClick={closeSide}
          />
          <aside className="fixed top-0 right-0 bottom-0 w-[560px] max-w-[96vw] bg-white shadow-2xl z-[201] flex flex-col">
            <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-3 bg-[#F8F7F4]">
              <span className="text-[20px]">
                {activeRow.derived_status === "overdue"
                  ? "🔴"
                  : activeRow.derived_status === "warn"
                    ? "🟠"
                    : activeRow.derived_status === "sent"
                      ? "🔵"
                      : activeRow.derived_status === "destroyed"
                        ? "⚫"
                        : "🟢"}
              </span>
              <div>
                <div className="text-[15px] font-semibold text-[#2C2C2A]">
                  {activeRow.item_name ?? "—"}
                </div>
                <div className="text-[11px] text-[#9A9890]">
                  索賠件編號：{activeRow.wc_no}
                </div>
              </div>
              <span
                className={`ml-3 inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${DERIVED_STATUS_CHIP[activeRow.derived_status]}`}
              >
                {DERIVED_STATUS_LABEL[activeRow.derived_status]}
              </span>
              <button
                onClick={closeSide}
                className="ml-auto w-7 h-7 rounded-full bg-[#EEECE6] text-[#5A5955] hover:bg-[#D8D6CF]"
              >
                ✕
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <KvSection title="舊件資訊">
                <Kv label="索賠件編號" value={activeRow.wc_no} mono />
                <Kv label="備件代碼" value={activeRow.item_code ?? "—"} mono />
                <Kv label="舊件序列號" value={activeRow.serial_no ?? "—"} mono />
                <Kv
                  label="關聯 RO 工單"
                  value={
                    readMeta(activeRow.metadata, "ro_no") ?? "—"
                  }
                />
                <Kv
                  label="Ducati 索賠單號"
                  value={activeRow.claim_no ?? "—"}
                  mono
                />
                <Kv
                  label="TSB 編號"
                  value={readMeta(activeRow.metadata, "tsb_no") ?? "—"}
                />
                <Kv label="入庫日期" value={activeRow.entry_date} />
                <Kv label="保管到期日" value={activeRow.expiry_date ?? "—"} />
                <Kv
                  label="原廠處置指示"
                  value={activeRow.oem_directive ?? "—"}
                />
                <Kv label="VIN" value={activeRow.vin ?? "—"} mono />
              </KvSection>

              {activeRow.derived_status === "sent" && (
                <KvSection title="寄回紀錄">
                  <Kv
                    label="寄出日期"
                    value={readMeta(activeRow.metadata, "returned_at") ?? "—"}
                  />
                  <Kv
                    label="收件方"
                    value={
                      readMeta(activeRow.metadata, "return_recipient") ?? "—"
                    }
                  />
                  <Kv
                    label="快遞單號"
                    value={
                      readMeta(activeRow.metadata, "return_tracking_no") ?? "—"
                    }
                    mono
                  />
                </KvSection>
              )}
              {activeRow.derived_status === "destroyed" && (
                <KvSection title="銷毀紀錄">
                  <Kv
                    label="銷毀日期"
                    value={readMeta(activeRow.metadata, "destroyed_at") ?? "—"}
                  />
                  <Kv
                    label="銷毀方式"
                    value={readMeta(activeRow.metadata, "destroy_method") ?? "—"}
                  />
                </KvSection>
              )}
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex gap-2 bg-[#F8F7F4]">
              <button
                onClick={closeSide}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
              >
                關閉
              </button>
              {(activeRow.derived_status === "overdue" ||
                activeRow.derived_status === "warn" ||
                activeRow.derived_status === "ok") && (
                <div className="ml-auto flex gap-2">
                  <button
                    onClick={() => startQuickReturn(activeRow.id)}
                    disabled={!canEdit}
                    className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#FEF0EB] border border-[#f5c2a8] text-[#D85A30] disabled:opacity-50"
                  >
                    🔵 標記寄回
                  </button>
                  <button
                    onClick={() => startQuickDestroy(activeRow.id)}
                    disabled={!canEdit}
                    className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] disabled:opacity-50"
                  >
                    ⚫ 標記銷毀
                  </button>
                </div>
              )}
            </footer>
          </aside>
        </>
      )}
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 子元件
// ────────────────────────────────────────────────────────────────────────────

function StatCard({
  num,
  label,
  color,
}: {
  num: number;
  label: string;
  color: "red" | "orange" | "green" | "blue" | "gray";
}) {
  const borderCls = {
    red: "border-t-[#CC0000]",
    orange: "border-t-[#EF9F27]",
    green: "border-t-[#0F6E56]",
    blue: "border-t-[#185FA5]",
    gray: "border-t-[#9A9890]",
  }[color];
  const numCls = {
    red: "text-[#CC0000]",
    orange: "text-[#854F0B]",
    green: "text-[#3B6D11]",
    blue: "text-[#185FA5]",
    gray: "text-[#6B6A68]",
  }[color];
  return (
    <div
      className={`bg-white border border-[#EEECE6] border-t-[3px] ${borderCls} rounded-lg px-4 py-2.5`}
    >
      <div className={`text-[22px] font-bold leading-tight ${numCls}`}>
        {num}
      </div>
      <div className="text-[11px] text-[#5A5955] mt-0.5">{label}</div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}

function readMeta(metadata: unknown, key: string): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata))
    return null;
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === "string" ? v : null;
}

function KvSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-3 py-2 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[12px] font-semibold text-[#2C2C2A]">
          {title}
        </span>
      </header>
      <div className="px-3 py-3 grid grid-cols-2 gap-x-5 gap-y-2">
        {children}
      </div>
    </section>
  );
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] text-[#9A9890] uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Modal: Inbound
// ────────────────────────────────────────────────────────────────────────────

function InboundModal({
  items,
  warehouses,
  onClose,
  onSubmit,
  pending,
}: {
  items: Array<{ id: string; code: string; name: string }>;
  warehouses: Array<{ id: string; code: string; name: string }>;
  onClose: () => void;
  onSubmit: (input: {
    item_id: string;
    serial_no?: string;
    vin?: string;
    ro_no?: string;
    claim_no?: string;
    warehouse_id?: string | null;
    entry_date: string;
    keep_days: number;
    oem_directive: string;
    tsb_no?: string;
    defect_desc?: string;
  }) => void;
  pending: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [entryDate, setEntryDate] = useState(today);
  const [keepDays, setKeepDays] = useState(DEFAULT_KEEP_DAYS);
  const [itemId, setItemId] = useState("");
  const [roNo, setRoNo] = useState("");
  const [claimNo, setClaimNo] = useState("");
  const [serial, setSerial] = useState("");
  const [vin, setVin] = useState("");
  const [whId, setWhId] = useState(warehouses[0]?.id ?? "");
  const [directive, setDirective] = useState<string>(OEM_DIRECTIVE_LIST[0]);
  const [tsbNo, setTsbNo] = useState("");
  const [defect, setDefect] = useState("");

  const expiry = useMemo(() => {
    const d = new Date(entryDate);
    d.setDate(d.getDate() + (keepDays || 0));
    return d.toISOString().slice(0, 10);
  }, [entryDate, keepDays]);

  const canSubmit = itemId && entryDate && keepDays > 0 && directive;

  return (
    <div className="fixed inset-0 bg-black/35 z-[300] flex items-center justify-center">
      <div
        className={`bg-white rounded-lg w-[560px] max-w-[95vw] shadow-2xl overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <span className="text-[18px]">📥</span>
          <span className="text-[14px] font-semibold text-[#2C2C2A]">
            保固舊件入庫登記
          </span>
          <button
            onClick={onClose}
            disabled={pending}
            className="ml-auto w-7 h-7 rounded-full bg-[#F2F2F2] text-[#5A5955] hover:bg-[#E5E3DC]"
          >
            ✕
          </button>
        </header>
        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="bg-[#FEF0EB] border border-[#f5c2a8] text-[#D85A30] rounded-md px-3 py-2 text-[12px]">
            🔧 舊件入庫後<strong>不計入商品可用庫存</strong>
            ，存放於保固索賠暫存倉、不觸發補貨告警，有獨立的保管期限管理。
          </div>
          <FormField label="關聯 RO 工單號">
            <input
              value={roNo}
              onChange={(e) => setRoNo(e.target.value)}
              placeholder="RO-20260505-XXX"
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <FormField label="料件" required>
            <select
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            >
              <option value="">— 選 —</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.code} · {i.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Ducati 索賠單號">
            <input
              value={claimNo}
              onChange={(e) => setClaimNo(e.target.value)}
              placeholder="DCI-…"
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <FormField label="舊件序列號">
            <input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              placeholder="掃描或輸入舊件序列號"
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="入庫日期" required>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              />
            </FormField>
            <FormField label="保管期限（天）" required>
              <input
                type="number"
                value={keepDays}
                onChange={(e) => setKeepDays(parseInt(e.target.value, 10) || 0)}
                className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              />
            </FormField>
            <FormField label="保管到期日">
              <input
                readOnly
                value={`${expiry}（自動計算）`}
                className="w-full h-[32px] border border-[#AAC9F0] rounded px-2 text-[12.5px] bg-[#EEF6FF] text-[#185FA5]"
              />
            </FormField>
            <FormField label="原廠處置指示" required>
              <select
                value={directive}
                onChange={(e) => setDirective(e.target.value)}
                className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
              >
                {OEM_DIRECTIVE_LIST.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="暫存倉">
            <select
              value={whId}
              onChange={(e) => setWhId(e.target.value)}
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            >
              <option value="">— 不指定 —</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} · {w.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="VIN">
            <input
              value={vin}
              onChange={(e) => setVin(e.target.value)}
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <FormField label="相關 TSB 編號">
            <input
              value={tsbNo}
              onChange={(e) => setTsbNo(e.target.value)}
              placeholder="例：SRV-TSB-26-002（選填）"
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <FormField label="零件外觀與缺陷描述">
            <textarea
              value={defect}
              onChange={(e) => setDefect(e.target.value)}
              placeholder="記錄拆下時的外觀狀況與缺陷（選填）⋯"
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] h-[60px] resize-none"
            />
          </FormField>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={pending}
            className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
          >
            取消
          </button>
          <button
            disabled={!canSubmit || pending}
            onClick={() =>
              onSubmit({
                item_id: itemId,
                ro_no: roNo || undefined,
                claim_no: claimNo || undefined,
                serial_no: serial || undefined,
                vin: vin || undefined,
                warehouse_id: whId || null,
                entry_date: entryDate,
                keep_days: keepDays,
                oem_directive: directive,
                tsb_no: tsbNo || undefined,
                defect_desc: defect || undefined,
              })
            }
            className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "建立中⋯" : "✅ 確認入庫登記"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function DestroyModal({
  onClose,
  onSubmit,
  pending,
  batchCount,
}: {
  onClose: () => void;
  onSubmit: (input: {
    destroyed_at: string;
    destroy_method?: string;
    operator?: string;
  }) => void;
  pending: boolean;
  batchCount: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState("");
  const [operator, setOperator] = useState("");

  return (
    <div className="fixed inset-0 bg-black/35 z-[300] flex items-center justify-center">
      <div
        className={`bg-white rounded-lg w-[480px] max-w-[95vw] shadow-2xl overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <span className="text-[18px]">⚫</span>
          <span className="text-[14px] font-semibold text-[#2C2C2A]">
            標記銷毀 {batchCount > 1 ? `（${batchCount} 筆）` : ""}
          </span>
          <button
            onClick={onClose}
            disabled={pending}
            className="ml-auto w-7 h-7 rounded-full bg-[#F2F2F2] text-[#5A5955]"
          >
            ✕
          </button>
        </header>
        <div className="p-5 space-y-3">
          <div className="bg-[#FEF5F5] border border-[#F7C1C1] text-[#CC0000] rounded-md px-3 py-2 text-[12px]">
            ⚠️ 銷毀後無法復原，請確認已依原廠 TSB 規定完成銷毀作業。
          </div>
          <FormField label="銷毀日期" required>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <FormField label="執行人">
            <input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="例：蔡零件"
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <FormField label="銷毀方式說明">
            <textarea
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              placeholder="例：依 SRV-TSB-26-002 規定，拆解後依廢棄物規範處理⋯"
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] h-[60px] resize-none"
            />
          </FormField>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={pending}
            className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
          >
            取消
          </button>
          <button
            disabled={!date || pending}
            onClick={() =>
              onSubmit({
                destroyed_at: date,
                destroy_method: method || undefined,
                operator: operator || undefined,
              })
            }
            className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
          >
            {pending ? "標記中⋯" : "⚫ 確認標記銷毀"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ReturnModal({
  onClose,
  onSubmit,
  pending,
  batchCount,
}: {
  onClose: () => void;
  onSubmit: (input: {
    returned_at: string;
    return_recipient: string;
    return_tracking_no: string;
    operator?: string;
  }) => void;
  pending: boolean;
  batchCount: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [recipient, setRecipient] = useState<string>(RETURN_RECIPIENTS[0]);
  const [tracking, setTracking] = useState("");
  const [operator, setOperator] = useState("");

  return (
    <div className="fixed inset-0 bg-black/35 z-[300] flex items-center justify-center">
      <div
        className={`bg-white rounded-lg w-[480px] max-w-[95vw] shadow-2xl overflow-hidden ${pending ? "opacity-60 pointer-events-none" : ""}`}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2">
          <span className="text-[18px]">🔵</span>
          <span className="text-[14px] font-semibold text-[#2C2C2A]">
            標記寄回原廠 {batchCount > 1 ? `（${batchCount} 筆）` : ""}
          </span>
          <button
            onClick={onClose}
            disabled={pending}
            className="ml-auto w-7 h-7 rounded-full bg-[#F2F2F2] text-[#5A5955]"
          >
            ✕
          </button>
        </header>
        <div className="p-5 space-y-3">
          <FormField label="寄出日期" required>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <FormField label="收件方">
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            >
              {RETURN_RECIPIENTS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="快遞單號" required>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="例：SF1234567890"
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
          <FormField label="執行人">
            <input
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
              placeholder="例：蔡零件"
              className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px]"
            />
          </FormField>
        </div>
        <footer className="px-5 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={pending}
            className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
          >
            取消
          </button>
          <button
            disabled={!date || !tracking.trim() || pending}
            onClick={() =>
              onSubmit({
                returned_at: date,
                return_recipient: recipient,
                return_tracking_no: tracking,
                operator: operator || undefined,
              })
            }
            className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#FEF0EB] border border-[#f5c2a8] text-[#D85A30] hover:bg-[#fde0d3] disabled:opacity-50"
          >
            {pending ? "標記中⋯" : "🔵 確認標記寄回"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function FormField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] text-[#5A5955] font-medium mb-1">
        {label}
        {required && <span className="text-[#CC0000] ml-1">*</span>}
      </label>
      {children}
    </div>
  );
}
