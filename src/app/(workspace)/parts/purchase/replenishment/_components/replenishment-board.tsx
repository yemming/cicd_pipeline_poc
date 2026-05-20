"use client";

/**
 * /parts/purchase/replenishment Run List Board（A 級）
 *
 * 主視角：KpiCard 4 顆 → Filter Bar → DataGrid（runs）→ 點 row 開 Detail Panel（lines）
 * 動作：trigger（重算）/ approve / reject / generate PO
 *
 * 為什麼 detail panel 用 inline right-rail（不開新頁）：
 *   - run 是「審批中的快照」、生命週期短，detail page 太重
 *   - 點 row 即看 lines、approve / reject / 生 PO 都在 panel 內、router.refresh 後狀態回流
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";

import {
  approveRun,
  generatePoFromRun,
  rejectRun,
  triggerReplenishmentRun,
} from "@/lib/parts-purchase/replenishment-actions";

import {
  PRIORITY_BADGE,
  PRIORITY_LABEL,
  RUN_STATUS_LABEL,
  TRIGGER_KIND_LABEL,
  type ReplenishmentKpis,
  type ReplenishmentRunLineRow,
  type ReplenishmentRunRow,
  type RunListStatus,
} from "@/domain/parts-replenishment.constants";

type Banner = { ok: boolean; msg: string } | null;

export function ReplenishmentBoard({
  runs,
  warehouses,
  kpis,
  filters,
  selectedRunId,
  selectedRunDetail,
  canRun,
  canCreatePO,
}: {
  runs: ReplenishmentRunRow[];
  warehouses: Array<{ id: string; code: string; name: string }>;
  kpis: ReplenishmentKpis;
  filters: { status: string; warehouseId: string; month: string };
  selectedRunId: string | null;
  selectedRunDetail: { run: ReplenishmentRunRow; lines: ReplenishmentRunLineRow[] } | null;
  canRun: boolean;
  canCreatePO: boolean;
}) {
  const router = useRouter();
  const [statusF, setStatusF] = useState(filters.status);
  const [whF, setWhF] = useState(filters.warehouseId);
  const [monthF, setMonthF] = useState(filters.month);
  const [triggerWh, setTriggerWh] = useState<string>("");
  const [triggerHorizon, setTriggerHorizon] = useState<number>(7);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [banner, setBanner] = useState<Banner>(null);
  const [isPending, startTransition] = useTransition();

  // 推 URL（filter / 選擇）
  function navigate(next: Partial<{ status: string; warehouseId: string; month: string; runId: string | null }>) {
    const sp = new URLSearchParams();
    const status = next.status ?? statusF;
    const wh = next.warehouseId ?? whF;
    const month = next.month ?? monthF;
    const runId = next.runId !== undefined ? next.runId : selectedRunId;
    if (status && status !== "all") sp.set("status", status);
    if (wh && wh !== "all") sp.set("warehouseId", wh);
    if (month) sp.set("month", month);
    if (runId) sp.set("runId", runId);
    const qs = sp.toString();
    router.push(`/parts/purchase/replenishment${qs ? "?" + qs : ""}`);
  }

  function applyFilters() {
    navigate({ runId: null });
  }
  function resetFilters() {
    setStatusF("all");
    setWhF("all");
    setMonthF("");
    router.push("/parts/purchase/replenishment");
  }

  function handleTrigger() {
    setBanner(null);
    startTransition(async () => {
      const res = await triggerReplenishmentRun(triggerWh || null, triggerHorizon);
      if (!res.ok) {
        setBanner({ ok: false, msg: `重算失敗：${res.error}` });
        return;
      }
      setBanner({
        ok: true,
        msg: `已計算 ${res.data.lines} 項建議（預估 NT$ ${Number(res.data.amount).toLocaleString("en-US")}）`,
      });
      router.refresh();
    });
  }

  function handleApprove(runId: string) {
    setBanner(null);
    startTransition(async () => {
      const res = await approveRun(runId, null);
      if (!res.ok) setBanner({ ok: false, msg: `核准失敗：${res.error}` });
      else {
        setBanner({ ok: true, msg: "已核准此補貨批次" });
        router.refresh();
      }
    });
  }

  function openRejectModal(runId: string) {
    setRejectingId(runId);
    setRejectReason("");
  }
  function confirmReject() {
    if (!rejectingId) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setBanner({ ok: false, msg: "請填寫駁回原因" });
      return;
    }
    setBanner(null);
    startTransition(async () => {
      const res = await rejectRun(rejectingId, reason);
      if (!res.ok) setBanner({ ok: false, msg: `駁回失敗：${res.error}` });
      else {
        setBanner({ ok: true, msg: "已駁回此補貨批次" });
        setRejectingId(null);
        setRejectReason("");
        router.refresh();
      }
    });
  }

  function handleGeneratePO(runId: string) {
    setBanner(null);
    startTransition(async () => {
      const res = await generatePoFromRun(runId);
      if (!res.ok) {
        setBanner({ ok: false, msg: `生 PO 失敗：${res.error}` });
        return;
      }
      const summary = res.data.createdPos.map((p) => `${p.po_no}（${p.lines} 行）`).join("、");
      setBanner({
        ok: true,
        msg: `已建立 ${res.data.createdPos.length} 張採購單：${summary}`,
      });
      router.refresh();
    });
  }

  // 月份下拉：最近 6 個月
  const monthOptions = useMemo(() => {
    const arr: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const v = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      arr.push({ value: v, label: `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}` });
    }
    return arr;
  }, []);

  const columns: DataGridColumn<ReplenishmentRunRow>[] = [
    {
      id: "created_label",
      header: "建立時間",
      width: 140,
      cell: (r) => <span className="font-mono text-[12px]">{r.created_label}</span>,
      exportValue: (r) => r.created_label,
      sortValue: (r) => r.created_at,
    },
    {
      id: "warehouse_label",
      header: "倉庫",
      width: 160,
      cell: (r) => r.warehouse_label ?? <span className="text-[#9A9890]">全部</span>,
      exportValue: (r) => r.warehouse_label ?? "全部",
      sortValue: (r) => r.warehouse_label ?? "",
    },
    {
      id: "trigger_kind",
      header: "觸發",
      width: 80,
      cell: (r) => TRIGGER_KIND_LABEL[r.trigger_kind] ?? r.trigger_kind,
      exportValue: (r) => TRIGGER_KIND_LABEL[r.trigger_kind] ?? r.trigger_kind,
      sortValue: (r) => r.trigger_kind,
    },
    {
      id: "horizon_days",
      header: "視野(天)",
      width: 70,
      align: "right",
      cell: (r) => <span className="font-mono">{r.horizon_days}</span>,
      exportValue: (r) => r.horizon_days,
      sortValue: (r) => r.horizon_days,
    },
    {
      id: "total_lines",
      header: "建議數",
      width: 70,
      align: "right",
      cell: (r) => <span className="font-mono">{r.total_lines}</span>,
      exportValue: (r) => r.total_lines,
      sortValue: (r) => r.total_lines,
    },
    {
      id: "total_amount",
      header: "預估金額",
      align: "right",
      cell: (r) => (
        <span className="font-mono">{`NT$${Number(r.total_amount).toLocaleString("en-US")}`}</span>
      ),
      exportValue: (r) => Number(r.total_amount),
      sortValue: (r) => Number(r.total_amount),
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => {
        const s = RUN_STATUS_LABEL[r.status] ?? { label: r.status, tone: "bg-[#F2F2F2] text-[#6B6A68]" };
        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${s.tone}`}>
            {s.label}
          </span>
        );
      },
      exportValue: (r) => RUN_STATUS_LABEL[r.status]?.label ?? r.status,
      sortValue: (r) => r.status,
    },
    {
      id: "generated_po_ids",
      header: "已生 PO",
      width: 70,
      align: "right",
      cell: (r) => (
        <span className={`font-mono ${r.generated_po_ids.length > 0 ? "text-[#0F6E56]" : "text-[#9A9890]"}`}>
          {r.generated_po_ids.length}
        </span>
      ),
      exportValue: (r) => r.generated_po_ids.length,
      sortValue: (r) => r.generated_po_ids.length,
    },
  ];

  return (
    <>
      <main className="px-6 py-5 space-y-3">
        {/* Page Header */}
        <header className="flex items-center gap-2.5">
          <h1 className="text-[16px] font-semibold text-[#2C2C2A]">日常補貨計畫</h1>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
            4.2
          </span>
          <span className="text-[12px] text-[#9A9890]">
            審核補貨批次、核准後一鍵生 PO（連動 4.4 商品採購）
          </span>
        </header>

        {/* Banner */}
        {banner && (
          <div
            className={`px-3 py-2 rounded text-[12.5px] border ${
              banner.ok
                ? "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F]"
                : "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]"
            }`}
          >
            {banner.msg}
          </div>
        )}

        {/* KPI Row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="本月 Run 次數"
            value={kpis.monthRuns}
            tone="blue"
            icon={<span className="text-[18px]">🧮</span>}
          />
          <KpiCard
            label="待 review"
            value={kpis.pendingReview}
            tone="amber"
            icon={<span className="text-[18px]">⏳</span>}
          />
          <KpiCard
            label="已生 PO"
            value={kpis.generatedPo}
            tone="teal"
            icon={<span className="text-[18px]">📦</span>}
          />
          <KpiCard
            label="本月平均金額"
            value={`NT$${Number(kpis.avgAmount).toLocaleString("en-US")}`}
            tone="purple"
            icon={<span className="text-[18px]">💰</span>}
          />
        </section>

        {/* Filter Bar */}
        <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
              <select
                value={statusF}
                onChange={(e) => setStatusF(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              >
                <option value="all">全部</option>
                {(Object.keys(RUN_STATUS_LABEL) as RunListStatus[]).map((k) => (
                  <option key={k} value={k}>{RUN_STATUS_LABEL[k].label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">倉庫</label>
              <select
                value={whF}
                onChange={(e) => setWhF(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] min-w-[170px]"
              >
                <option value="all">全部倉庫</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{`${w.code} ${w.name}`}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">月份</label>
              <select
                value={monthF}
                onChange={(e) => setMonthF(e.target.value)}
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
              >
                <option value="">全部</option>
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={applyFilters}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              >
                查詢
              </button>
              <button
                type="button"
                onClick={resetFilters}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                重置
              </button>
            </div>
          </div>
        </section>

        {/* Trigger Bar */}
        <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex flex-wrap gap-2 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">手動觸發 — 倉庫</label>
            <select
              value={triggerWh}
              onChange={(e) => setTriggerWh(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] min-w-[200px]"
            >
              <option value="">全部倉庫</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>{`${w.code} ${w.name}`}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">需求視野（天）</label>
            <input
              type="number"
              min={1}
              value={triggerHorizon}
              onChange={(e) => setTriggerHorizon(Math.max(1, parseInt(e.target.value || "7", 10)))}
              className="h-[30px] w-24 border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5]"
            />
          </div>
          <button
            type="button"
            disabled={!canRun || isPending}
            onClick={handleTrigger}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {isPending ? "計算中⋯" : "＋ 重新計算建議"}
          </button>
          <div className="ml-auto text-[11.5px] text-[#9A9890]">
            提示：跑完一輪計算會新增一筆 run，請至列表審核後生 PO。
          </div>
        </section>

        {/* Two-column layout */}
        <div className="flex gap-3 items-start">
          {/* Run List */}
          <div className="flex-1 min-w-0 space-y-2">
            <div className="text-[12px] text-[#9A9890]">
              共 <b className="text-[#2C2C2A]">{runs.length}</b> 筆補貨批次
              {selectedRunId && (
                <>
                  {` ・ 已選 `}
                  <b className="text-[#185FA5]">1</b>
                  {` 筆`}
                </>
              )}
            </div>
            {runs.length === 0 ? (
              <div className="bg-white border border-[#EEECE6] rounded-lg p-8 text-center text-[#9A9890] text-[12.5px]">
                目前沒有符合條件的補貨批次。
                {canRun && (
                  <>
                    {" "}
                    點上方<b className="text-[#0F6E56]">「＋ 重新計算建議」</b>立即產生第一輪。
                  </>
                )}
              </div>
            ) : (
              <DataGrid
                columns={columns}
                data={runs}
                rowKey={(r) => r.id}
                persistKey="parts/purchase/replenishment/runs"
                exportFileName="replenishment-runs"
                emptyMessage="目前沒有符合條件的補貨批次"
                disabled={isPending}
                rowActionsHeader="檢視"
                rowActionsWidth={84}
                rowActions={(r) => (
                  <button
                    type="button"
                    onClick={() => navigate({ runId: r.id })}
                    className={`h-[26px] px-2.5 rounded text-[11.5px] ${
                      r.id === selectedRunId
                        ? "bg-[#1A3A5C] text-white"
                        : "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    }`}
                  >
                    {r.id === selectedRunId ? "檢視中" : "查看"}
                  </button>
                )}
              />
            )}
          </div>

          {/* Detail Panel */}
          <aside className="w-[420px] shrink-0">
            {selectedRunDetail ? (
              <DetailPanel
                detail={selectedRunDetail}
                onClose={() => navigate({ runId: null })}
                onApprove={() => handleApprove(selectedRunDetail.run.id)}
                onReject={() => openRejectModal(selectedRunDetail.run.id)}
                onGeneratePO={() => handleGeneratePO(selectedRunDetail.run.id)}
                canRun={canRun}
                canCreatePO={canCreatePO}
                isPending={isPending}
              />
            ) : (
              <section className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[12.5px] text-[#9A9890]">
                點左側任一筆 run 查看建議明細與審批
              </section>
            )}
          </aside>
        </div>
      </main>

      {/* Reject Modal */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl w-[420px] p-5 space-y-3">
            <h2 className="text-[14px] font-semibold text-[#2C2C2A]">駁回補貨批次</h2>
            <p className="text-[12px] text-[#5A5955]">
              請說明駁回原因，將記錄到批次 metadata 供後續追蹤。
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="例：本季預算上限已到 / 需求重評估 / 供應商調整中…"
              className="w-full h-24 border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] resize-none"
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRejectingId(null);
                  setRejectReason("");
                }}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmReject}
                disabled={isPending || !rejectReason.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A60000] disabled:opacity-60"
              >
                {isPending ? "駁回中⋯" : "確認駁回"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DetailPanel({
  detail,
  onClose,
  onApprove,
  onReject,
  onGeneratePO,
  canRun,
  canCreatePO,
  isPending,
}: {
  detail: { run: ReplenishmentRunRow; lines: ReplenishmentRunLineRow[] };
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onGeneratePO: () => void;
  canRun: boolean;
  canCreatePO: boolean;
  isPending: boolean;
}) {
  const { run, lines } = detail;
  const statusInfo = RUN_STATUS_LABEL[run.status] ?? { label: run.status, tone: "bg-[#F2F2F2] text-[#6B6A68]" };

  const canApprove = run.status === "open" && canRun;
  const canRejectAction = (run.status === "open" || run.status === "approved") && canRun;
  const canGen = (run.status === "approved" || run.status === "partially_converted") && canCreatePO;

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">補貨批次詳情</span>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${statusInfo.tone}`}>
          {statusInfo.label}
        </span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto h-[24px] px-2 rounded text-[11.5px] text-[#5A5955] hover:bg-[#EEECE6]"
        >
          ✕
        </button>
      </header>

      <div className="px-4 py-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
        <Kv label="建立時間" value={run.created_label} />
        <Kv label="觸發方式" value={TRIGGER_KIND_LABEL[run.trigger_kind] ?? run.trigger_kind} />
        <Kv label="倉庫" value={run.warehouse_label ?? "全部"} />
        <Kv label="視野" value={`${run.horizon_days} 天`} />
        <Kv label="建議數" value={`${run.total_lines} 項`} />
        <Kv label="預估金額" value={`NT$${Number(run.total_amount).toLocaleString("en-US")}`} />
        {run.approved_at && (
          <Kv label="核准" value={`${run.approved_by_label ?? "—"}${run.approval_note ? `（${run.approval_note}）` : ""}`} colSpan />
        )}
        {run.rejected_at && (
          <Kv label="駁回" value={`${run.rejected_by_label ?? "—"}${detail.run.approval_note ? "" : ""}`} colSpan />
        )}
        {run.generated_po_ids.length > 0 && (
          <Kv label="已生 PO" value={`${run.generated_po_ids.length} 張`} colSpan />
        )}
      </div>

      {/* Actions */}
      <div className="px-4 pb-3 flex gap-2 flex-wrap">
        <button
          type="button"
          disabled={!canApprove || isPending}
          onClick={onApprove}
          className="h-[28px] px-3 rounded text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          {isPending ? "處理中⋯" : "核准"}
        </button>
        <button
          type="button"
          disabled={!canRejectAction || isPending}
          onClick={onReject}
          className="h-[28px] px-3 rounded text-[12px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
        >
          駁回
        </button>
        <button
          type="button"
          disabled={!canGen || isPending}
          onClick={onGeneratePO}
          className="h-[28px] px-3 rounded text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
        >
          {isPending ? "生 PO 中⋯" : "一鍵生 PO"}
        </button>
      </div>

      {/* Lines */}
      <div className="border-t border-[#EEECE6]">
        <div className="px-4 py-2 bg-[#F8F7F4] text-[11.5px] font-semibold text-[#5A5955]">
          建議明細（{lines.length}）
        </div>
        <div className="max-h-[480px] overflow-y-auto">
          {lines.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-[#9A9890]">
              此批次無明細
            </div>
          ) : (
            <ul className="divide-y divide-[#EEECE6]">
              {lines.map((l) => (
                <li key={l.id} className="px-4 py-2.5 hover:bg-[#F8F7F4]">
                  <div className="flex items-start gap-2">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] ${PRIORITY_BADGE[l.priority]} shrink-0 mt-0.5`}
                    >
                      {PRIORITY_LABEL[l.priority]}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-[11.5px] text-[#185FA5]">{l.item_code}</span>
                        <span className="text-[12px] text-[#2C2C2A] truncate">{l.item_name}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-[#5A5955]">
                        <span>
                          在手 <b className={l.on_hand_qty <= l.reorder_point ? "text-[#CC0000]" : ""}>{l.on_hand_qty}</b>
                        </span>
                        <span>ROP {l.reorder_point}</span>
                        <span>
                          建議 <b className="text-[#0F6E56]">{l.suggested_qty}</b>
                        </span>
                        <span className="font-mono">NT${Number(l.est_amount).toLocaleString("en-US")}</span>
                      </div>
                      {l.supplier_name && (
                        <div className="text-[11px] text-[#9A9890] mt-0.5">
                          {l.supplier_name}
                          {l.lead_time_days != null && ` ・ LT ${l.lead_time_days}d`}
                          {l.required_date && ` ・ 需求 ${l.required_date}`}
                        </div>
                      )}
                    </div>
                    <span
                      className={`text-[10.5px] px-1.5 py-0.5 rounded-md shrink-0 ${
                        l.status === "converted"
                          ? "bg-[#E8F5F0] text-[#0F6E56]"
                          : l.status === "ignored"
                          ? "bg-[#F2F2F2] text-[#6B6A68]"
                          : "bg-[#FDF3E3] text-[#854F0B]"
                      }`}
                    >
                      {l.status === "converted" ? "已轉" : l.status === "ignored" ? "忽略" : "待轉"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function Kv({ label, value, colSpan = false }: { label: string; value: string; colSpan?: boolean }) {
  return (
    <div className={colSpan ? "col-span-2" : ""}>
      <div className="text-[10.5px] text-[#9A9890]">{label}</div>
      <div className="text-[12px] text-[#2C2C2A]">{value}</div>
    </div>
  );
}
