"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  saveReconChecklistAction,
  saveReconLinesAction,
  approveReconAction,
  type ApproveReconResult,
} from "@/lib/vehicle-inventory/recon-workorder-actions";
import {
  RECON_CHECKLIST_CATEGORIES,
  RECON_CHECKLIST_TOTAL,
  countChecklistDone,
  checklistProgress,
  partsTotal,
  laborTotal,
  type ReconChecklistItemState,
  type ReconChecklistResult,
  type ReconPartLine,
  type ReconLaborLine,
} from "@/domain/recon-workorder.constants";
import type { ReconWorkorderData } from "@/domain/recon-workorder";

const nt = (n: number) => `NT$${Math.round(n).toLocaleString("en-US")}`;

const SOURCE_LABELS: Record<string, string> = {
  trade_in: "置換收購（TRADE_IN）",
  direct_buy: "直接收購（DIRECT_BUY）",
  auction: "拍賣場（AUCTION）",
  other: "其他",
};

type TabKey = 0 | 1 | 2 | 3 | 4;
const TABS: { key: TabKey; label: string }[] = [
  { key: 0, label: "📋 工單資訊" },
  { key: 1, label: "🔧 整備檢查清單（24項）" },
  { key: 2, label: "🔩 零件與工時記錄" },
  { key: 3, label: "💰 費用彙總" },
  { key: 4, label: "✅ 完成核准" },
];

const CAT_COLORS: Record<string, string> = {
  A: "bg-[#185FA5]",
  B: "bg-[#0F6E56]",
  C: "bg-[#854F0B]",
  D: "bg-[#534AB7]",
};

function Ib({ label, value, mono, tone }: { label: string; value: ReactNode; mono?: boolean; tone?: "teal" | "red" }) {
  const valCls = tone === "teal" ? "text-[#0F6E56]" : tone === "red" ? "text-[#CC0000]" : "text-[#2C2C2A]";
  return (
    <div className="bg-[#F4F3F0] rounded-md px-3 py-2">
      <div className="text-[10.5px] text-[#9A9890] mb-0.5">{label}</div>
      <div className={`text-[13px] font-semibold ${valCls} ${mono ? "font-mono" : ""}`}>
        {value ?? <span className="text-[#9A9890]">—</span>}
      </div>
    </div>
  );
}

export function ReconWorkorderView({
  data,
  canExecute,
  canApprove,
}: {
  data: ReconWorkorderData;
  canExecute: boolean;
  canApprove: boolean;
}) {
  useSetPageHeader({
    title: `中古車整備工單 ${data.ro_code}`,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "工單查詢", href: "/parts/aftersales/ro-search" },
      { label: data.ro_code },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(0);
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [done, setDone] = useState<ApproveReconResult | null>(null);

  const locked = data.is_closed || !canExecute;

  // ── state：checklist / parts / labor ──
  const [checklist, setChecklist] = useState<ReconChecklistItemState[]>(data.checklist);
  const [parts, setParts] = useState<ReconPartLine[]>(data.parts);
  const [labor, setLabor] = useState<ReconLaborLine[]>(data.labor);

  const [completedDate, setCompletedDate] = useState<string>(
    data.completed_date ?? new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10),
  );
  const [approvalNote, setApprovalNote] = useState<string>(data.approval_note ?? "");
  const [techSigned, setTechSigned] = useState(data.is_closed);
  const [mgrSigned, setMgrSigned] = useState(data.is_closed);

  const doneCount = countChecklistDone(checklist);
  const progress = checklistProgress(checklist);
  const laborCost = useMemo(() => laborTotal(labor), [labor]);
  const partsCost = useMemo(() => partsTotal(parts), [parts]);
  const feeTotal = laborCost + partsCost;

  // 收購價為整備前底；其它分攤（運費 / 鈑烤）若關單後已計入 total_cost
  const baseCost = data.vehicle?.acquisition_price ?? 0;
  const otherCost =
    (data.vehicle?.transfer_freight_cost ?? 0) +
    (data.vehicle?.bodywork_cost ?? 0) +
    Math.max(
      0,
      (data.vehicle?.total_cost ?? baseCost) -
        baseCost -
        (data.vehicle?.transfer_freight_cost ?? 0) -
        (data.vehicle?.bodywork_cost ?? 0) -
        (data.is_closed ? feeTotal : 0),
    );
  const totalCostPreview = baseCost + otherCost + feeTotal;

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2600);
  }

  // ── checklist 操作 ──
  function setItem(idx: number, patch: Partial<ReconChecklistItemState>) {
    if (locked) return;
    setChecklist((prev) => prev.map((c) => (c.idx === idx ? { ...c, ...patch } : c)));
  }
  function pickResult(idx: number, result: ReconChecklistResult | null) {
    if (locked) return;
    setItem(idx, { result });
  }
  function checkAllOk() {
    if (locked) return;
    setChecklist((prev) => prev.map((c) => (c.result === null ? { ...c, result: "ok" } : c)));
  }

  function saveChecklist() {
    if (locked) return;
    startTransition(async () => {
      const res = await saveReconChecklistAction(data.id, checklist);
      if (res.ok) showBanner({ ok: true, msg: `✓ 已儲存檢查清單（${res.data.progress}%）` });
      else showBanner({ ok: false, msg: res.error });
    });
  }

  // ── parts / labor 操作 ──
  function addPart() {
    if (locked) return;
    setParts((p) => [...p, { part_no: "", name: "", qty: 1, unit_price: 0 }]);
  }
  function setPart(i: number, patch: Partial<ReconPartLine>) {
    setParts((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removePart(i: number) {
    setParts((p) => p.filter((_, idx) => idx !== i));
  }
  function addLabor() {
    if (locked) return;
    setLabor((l) => [...l, { name: "", technician: data.lead_technician_name ?? "", lu: 0, rate: 800 }]);
  }
  function setLaborRow(i: number, patch: Partial<ReconLaborLine>) {
    setLabor((l) => l.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
  function removeLabor(i: number) {
    setLabor((l) => l.filter((_, idx) => idx !== i));
  }
  function saveLines() {
    if (locked) return;
    startTransition(async () => {
      const res = await saveReconLinesAction(data.id, parts, labor);
      if (res.ok)
        showBanner({
          ok: true,
          msg: `✓ 已儲存：工時 ${nt(res.data.labor_cost)}・零件 ${nt(res.data.parts_cost)}`,
        });
      else showBanner({ ok: false, msg: res.error });
    });
  }

  // ── 核准完工 ──
  function approve() {
    if (data.is_closed) return;
    if (!canApprove) {
      showBanner({ ok: false, msg: "需要售後主管權限（service.ro.approve）才能核准完工" });
      return;
    }
    if (doneCount < RECON_CHECKLIST_TOTAL) {
      setTab(1);
      showBanner({
        ok: false,
        msg: `尚有 ${RECON_CHECKLIST_TOTAL - doneCount} 項未填，請先完成檢查清單`,
      });
      return;
    }
    if (!techSigned || !mgrSigned) {
      showBanner({ ok: false, msg: "請先完成技師簽名與主管核准（兩格簽署）" });
      return;
    }
    startTransition(async () => {
      const res = await approveReconAction(data.id, {
        checklist,
        parts,
        labor,
        approval_note: approvalNote || null,
        completed_date: completedDate,
      });
      if (res.ok) {
        setDone(res.data);
        showBanner({ ok: true, msg: "🎉 整備核准完成！整車成本已更新、車輛轉為可售" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + 返回 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/aftersales/ro-search" className="hover:text-[#185FA5]">
            工單查詢
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{data.ro_code}</span>
          <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#6B3A00]">
            PD-UC 中古整備
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/ro-search"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回工單查詢
          </Link>
          {data.used_car_id && (
            <Link
              href="/sales/showroom/used-cars"
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
            >
              查看中古庫存
            </Link>
          )}
        </div>
      </div>

      {/* 費用歸屬橫幅 */}
      <div className="rounded-lg border border-[#5DCAA5] bg-[#E1F5EE] px-4 py-3 flex items-center gap-3 flex-wrap">
        <div className="text-[12.5px] text-[#085041] flex-1 min-w-[280px]">
          <b>中古車整備工單（PD-UC）費用說明：</b>本工單費用歸屬為<b>整車在庫成本</b>，
          不向客戶收取任何費用。完工核准後，費用自動寫回中古車車輛主檔並更新整車成本，
          車輛狀態更新為「可售（AVAILABLE）」。
        </div>
        <span className="inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]">
          內部結算（IN）
        </span>
        <span className="inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]">
          車主應付：NT$0
        </span>
      </div>

      {/* Tab bar */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                {t.label}
                {t.key === 1 && (
                  <span
                    className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] ${
                      doneCount === RECON_CHECKLIST_TOTAL
                        ? "bg-[#E1F5EE] text-[#0F6E56]"
                        : "bg-[#F1EFE8] text-[#9A9890]"
                    }`}
                  >
                    {doneCount}/{RECON_CHECKLIST_TOTAL}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={`bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3 ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        {/* ── TAB 0：工單資訊 ── */}
        {tab === 0 && (
          <div className="space-y-3">
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
                <div>
                  <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 整備工單基本資訊</span>
                  <span className="text-[11px] text-[#9A9890] ml-2">
                    由 RS06 收購決策 或 RS_INV05 直購申請 自動建立
                  </span>
                </div>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-md text-[10.5px] font-semibold ${
                    data.is_closed
                      ? "bg-[#EAF3DE] text-[#3B6D11]"
                      : "bg-[#FDF3E3] text-[#854F0B]"
                  }`}
                >
                  {data.status}
                </span>
              </header>
              <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                <Ib label="工單號" value={data.ro_code} mono tone="teal" />
                <Ib label="業務類型" value="PD-UC — 中古整備" />
                <Ib label="付款性質" value={`${data.prefix_p2} — 內部結算`} />
                <Ib label="費用歸屬" value="整車成本" tone="teal" />
                <Ib
                  label="收購來源"
                  value={
                    data.vehicle?.acquisition_source
                      ? SOURCE_LABELS[data.vehicle.acquisition_source] ?? data.vehicle.acquisition_source
                      : null
                  }
                />
                <Ib label="建立日期" value={data.issue_date} />
                <Ib label="預計完工" value={data.estimated_completion} />
                <Ib label="指派技師" value={data.lead_technician_name} />
              </div>
            </section>

            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 車輛資料（關聯中古車主檔）</span>
              </header>
              {data.vehicle ? (
                <div className="px-4 py-4 grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <Ib label="車型" value={data.vehicle.model_name} />
                  <Ib label="年份" value={data.vehicle.year} />
                  <Ib label="顏色" value={data.vehicle.color} />
                  <Ib label="車牌" value={data.vehicle.license_plate} mono />
                  <Ib label="VIN（車架號）" value={data.vehicle.vin} mono />
                  <Ib
                    label="里程"
                    value={data.vehicle.mileage_km != null ? `${data.vehicle.mileage_km.toLocaleString("en-US")} km` : null}
                    mono
                  />
                  <Ib
                    label="收購價格"
                    value={data.vehicle.acquisition_price != null ? nt(data.vehicle.acquisition_price) : null}
                    mono
                  />
                  <Ib label="車輛狀態" value={data.vehicle.status} />
                </div>
              ) : (
                <div className="px-4 py-4 text-[12.5px] text-[#9A9890]">
                  此工單未關聯中古車主檔（related_used_car_id 為空）
                </div>
              )}
            </section>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setTab(1)}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                開始整備作業 →
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 1：24 項 checklist ── */}
        {tab === 1 && (
          <div className="space-y-3">
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
                <div>
                  <span className="text-[13px] font-semibold text-[#2C2C2A]">
                    ▼ 中古車整備檢查清單（{RECON_CHECKLIST_TOTAL} 項）
                  </span>
                  <span className="text-[11px] text-[#9A9890] ml-2">
                    依車況等級執行整備，發現額外問題可標記異常並加入維修項目
                  </span>
                </div>
                <span
                  className={`inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium ${
                    doneCount === RECON_CHECKLIST_TOTAL
                      ? "bg-[#E1F5EE] text-[#0F6E56]"
                      : "bg-[#F1EFE8] text-[#9A9890]"
                  }`}
                >
                  {doneCount} / {RECON_CHECKLIST_TOTAL}
                </span>
              </header>
              <div className="px-4 py-4">
                {/* 進度條 */}
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[11.5px] font-medium text-[#2C2C2A] whitespace-nowrap">整備進度</span>
                  <div className="flex-1 h-2 bg-[#EEECE6] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progress}%`, background: "linear-gradient(90deg,#0F6E56,#5DCAA5)" }}
                    />
                  </div>
                  <span className="text-[12px] font-bold font-mono text-[#0F6E56]">{progress}%</span>
                </div>

                {/* 分類清單 */}
                {(() => {
                  let runningIdx = -1;
                  return RECON_CHECKLIST_CATEGORIES.map((cat) => (
                    <div key={cat.cat} className="mb-2">
                      <div
                        className={`text-[11px] font-bold text-white px-2.5 py-1 rounded mb-1.5 mt-2 ${CAT_COLORS[cat.cat]}`}
                      >
                        {cat.catName}
                      </div>
                      {cat.items.map((text) => {
                        runningIdx++;
                        const idx = runningIdx;
                        const state = checklist[idx] ?? { idx, result: null, note: "" };
                        const flagged = state.result === "flagged";
                        const isNa = state.result === "na";
                        const ok = state.result === "ok";
                        const rowBg = flagged
                          ? "bg-[#FDF3E3] border-[#F0C97E]"
                          : ok
                            ? "bg-[#E1F5EE] border-[#5DCAA5]"
                            : isNa
                              ? "bg-[#F2F2F2] border-[#E0DFDB]"
                              : "bg-white border-[#EEECE6]";
                        return (
                          <div
                            key={idx}
                            className={`flex items-start gap-2 px-2.5 py-2 rounded-md border mb-1 ${rowBg}`}
                          >
                            <span className="font-mono text-[10.5px] text-[#9A9890] min-w-[22px] mt-1">
                              {idx + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12.5px] leading-relaxed text-[#2C2C2A]">{text}</div>
                              {flagged && (
                                <input
                                  type="text"
                                  value={state.note}
                                  disabled={locked}
                                  onChange={(e) => setItem(idx, { note: e.target.value })}
                                  placeholder="填寫異常說明…"
                                  className="mt-1.5 w-full h-[28px] border border-[#F0C97E] rounded px-2 text-[11.5px] bg-white outline-none focus:border-[#854F0B] disabled:opacity-60"
                                />
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => pickResult(idx, ok ? null : "ok")}
                                className={`h-[24px] px-2 rounded text-[10.5px] border disabled:opacity-50 ${
                                  ok
                                    ? "bg-[#0F6E56] text-white border-[#0F6E56]"
                                    : "bg-white text-[#0F6E56] border-[#5DCAA5] hover:bg-[#E1F5EE]"
                                }`}
                              >
                                ✓ 正常
                              </button>
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => pickResult(idx, flagged ? null : "flagged")}
                                className={`h-[24px] px-2 rounded text-[10.5px] border disabled:opacity-50 ${
                                  flagged
                                    ? "bg-[#854F0B] text-white border-[#854F0B]"
                                    : "bg-white text-[#854F0B] border-[#F0C97E] hover:bg-[#FDF3E3]"
                                }`}
                              >
                                ⚑ 異常
                              </button>
                              <button
                                type="button"
                                disabled={locked}
                                onClick={() => pickResult(idx, isNa ? null : "na")}
                                className={`h-[24px] px-2 rounded text-[10.5px] border disabled:opacity-50 ${
                                  isNa
                                    ? "bg-[#6B6A68] text-white border-[#6B6A68]"
                                    : "bg-white text-[#6B6A68] border-[#D5D3CB] hover:bg-[#F2F2F2]"
                                }`}
                              >
                                N/A
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ));
                })()}
              </div>
            </section>

            <div className="flex items-center justify-end gap-2 flex-wrap">
              {!locked && (
                <button
                  type="button"
                  onClick={checkAllOk}
                  className="h-[30px] px-3 rounded text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  ✓ 未填項全標正常
                </button>
              )}
              {!locked && (
                <button
                  type="button"
                  onClick={saveChecklist}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                >
                  {isPending ? "儲存中⋯" : "儲存檢查清單"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab(2)}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                零件與工時記錄 →
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 2：零件與工時 ── */}
        {tab === 2 && (
          <div className="space-y-3">
            {/* 工時 */}
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 工時記錄</span>
                <span className="text-[11px] text-[#9A9890] ml-2">整備工時，費用計入整車成本</span>
              </header>
              <div className="px-4 py-3 overflow-x-auto">
                <table className="w-full text-[12px] border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-[#1A3A5C] text-white text-[11px]">
                      <th className="text-left px-2.5 py-1.5 font-semibold">作業項目</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold w-[130px]">技師</th>
                      <th className="text-right px-2.5 py-1.5 font-semibold w-[90px]">工時(LU)</th>
                      <th className="text-right px-2.5 py-1.5 font-semibold w-[100px]">單價/LU</th>
                      <th className="text-right px-2.5 py-1.5 font-semibold w-[110px]">小計</th>
                      <th className="w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {labor.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-2.5 py-4 text-center text-[#9A9890]">
                          尚無工時列，點下方「＋ 新增工時」加入
                        </td>
                      </tr>
                    )}
                    {labor.map((l, i) => (
                      <tr key={i} className="border-b border-[#F4F3F0]">
                        <td className="px-2.5 py-1.5">
                          <input
                            value={l.name}
                            disabled={locked}
                            onChange={(e) => setLaborRow(i, { name: e.target.value })}
                            placeholder="作業項目說明"
                            className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] outline-none focus:border-[#185FA5] disabled:opacity-60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <input
                            value={l.technician}
                            disabled={locked}
                            onChange={(e) => setLaborRow(i, { technician: e.target.value })}
                            placeholder="技師"
                            className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] outline-none focus:border-[#185FA5] disabled:opacity-60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={l.lu}
                            disabled={locked}
                            onChange={(e) => setLaborRow(i, { lu: Number(e.target.value) })}
                            className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right outline-none focus:border-[#185FA5] disabled:opacity-60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={l.rate}
                            disabled={locked}
                            onChange={(e) => setLaborRow(i, { rate: Number(e.target.value) })}
                            className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right outline-none focus:border-[#185FA5] disabled:opacity-60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-semibold">
                          {nt(Number(l.lu || 0) * Number(l.rate || 0))}
                        </td>
                        <td className="px-2.5 py-1.5 text-center">
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => removeLabor(i)}
                              className="h-[24px] w-[24px] rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#F4F3F0] font-semibold text-[12.5px]">
                      <td colSpan={4} className="px-2.5 py-2 text-right">工時費用合計</td>
                      <td className="px-2.5 py-2 text-right font-mono">{nt(laborCost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                {!locked && (
                  <button
                    type="button"
                    onClick={addLabor}
                    className="mt-2 h-[28px] px-3 rounded text-[12px] bg-white border border-dashed border-[#D5D3CB] text-[#5A5955] hover:border-[#185FA5]"
                  >
                    ＋ 新增工時
                  </button>
                )}
              </div>
            </section>

            {/* 零件 */}
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 零件使用記錄</span>
                <span className="text-[11px] text-[#9A9890] ml-2">整備作業使用的零件，費用計入整車成本</span>
              </header>
              <div className="px-4 py-3 overflow-x-auto">
                <table className="w-full text-[12px] border-collapse min-w-[640px]">
                  <thead>
                    <tr className="bg-[#1A3A5C] text-white text-[11px]">
                      <th className="text-left px-2.5 py-1.5 font-semibold w-[150px]">零件料號</th>
                      <th className="text-left px-2.5 py-1.5 font-semibold">零件名稱</th>
                      <th className="text-right px-2.5 py-1.5 font-semibold w-[80px]">數量</th>
                      <th className="text-right px-2.5 py-1.5 font-semibold w-[100px]">單價</th>
                      <th className="text-right px-2.5 py-1.5 font-semibold w-[110px]">小計</th>
                      <th className="w-[40px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {parts.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-2.5 py-4 text-center text-[#9A9890]">
                          尚無零件列，點下方「＋ 新增零件」加入
                        </td>
                      </tr>
                    )}
                    {parts.map((p, i) => (
                      <tr key={i} className="border-b border-[#F4F3F0]">
                        <td className="px-2.5 py-1.5">
                          <input
                            value={p.part_no}
                            disabled={locked}
                            onChange={(e) => setPart(i, { part_no: e.target.value })}
                            placeholder="料號"
                            className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[11.5px] font-mono outline-none focus:border-[#185FA5] disabled:opacity-60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <input
                            value={p.name}
                            disabled={locked}
                            onChange={(e) => setPart(i, { name: e.target.value })}
                            placeholder="零件名稱"
                            className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] outline-none focus:border-[#185FA5] disabled:opacity-60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={p.qty}
                            disabled={locked}
                            onChange={(e) => setPart(i, { qty: Number(e.target.value) })}
                            className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right outline-none focus:border-[#185FA5] disabled:opacity-60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5">
                          <input
                            type="number"
                            min={0}
                            value={p.unit_price}
                            disabled={locked}
                            onChange={(e) => setPart(i, { unit_price: Number(e.target.value) })}
                            className="w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] text-right outline-none focus:border-[#185FA5] disabled:opacity-60"
                          />
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono font-semibold">
                          {nt(Number(p.qty || 0) * Number(p.unit_price || 0))}
                        </td>
                        <td className="px-2.5 py-1.5 text-center">
                          {!locked && (
                            <button
                              type="button"
                              onClick={() => removePart(i)}
                              className="h-[24px] w-[24px] rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                            >
                              ✕
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#F4F3F0] font-semibold text-[12.5px]">
                      <td colSpan={4} className="px-2.5 py-2 text-right">零件費用合計</td>
                      <td className="px-2.5 py-2 text-right font-mono">{nt(partsCost)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                {!locked && (
                  <button
                    type="button"
                    onClick={addPart}
                    className="mt-2 h-[28px] px-3 rounded text-[12px] bg-white border border-dashed border-[#D5D3CB] text-[#5A5955] hover:border-[#185FA5]"
                  >
                    ＋ 新增零件
                  </button>
                )}
              </div>
            </section>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTab(1)}
                className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                ← 檢查清單
              </button>
              {!locked && (
                <button
                  type="button"
                  onClick={saveLines}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                >
                  {isPending ? "儲存中⋯" : "儲存零件工時"}
                </button>
              )}
              <button
                type="button"
                onClick={() => setTab(3)}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                費用彙總 →
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 3：費用彙總 ── */}
        {tab === 3 && (
          <div className="space-y-3">
            <div className="rounded-lg bg-[#1A3A5C] px-5 py-4 flex items-center justify-between flex-wrap gap-3">
              <div className="text-center">
                <div className="text-[10px] text-white/60 mb-0.5">工時費用</div>
                <div className="text-[14px] font-bold font-mono text-white">{nt(laborCost)}</div>
              </div>
              <div className="w-px h-9 bg-white/20" />
              <div className="text-center">
                <div className="text-[10px] text-white/60 mb-0.5">零件費用</div>
                <div className="text-[14px] font-bold font-mono text-white">{nt(partsCost)}</div>
              </div>
              <div className="w-px h-9 bg-white/20" />
              <div className="text-center">
                <div className="text-[10px] text-white/60 mb-0.5">整備費用合計</div>
                <div className="text-[18px] font-bold font-mono text-[#5DCAA5]">{nt(feeTotal)}</div>
              </div>
              <div className="w-px h-9 bg-white/20" />
              <div className="text-center">
                <div className="text-[10px] text-white/60 mb-0.5">車主應付</div>
                <div className="text-[14px] font-bold font-mono text-[#5DCAA5]">NT$0</div>
              </div>
            </div>

            <div className="rounded-lg border border-[#5DCAA5] bg-[#E1F5EE] px-4 py-3 text-[12px] text-[#085041] leading-relaxed">
              <b>費用歸屬說明（財務科目）</b>
              <br />
              借：整車在庫成本 {nt(feeTotal)}（流動資產）
              <br />
              貸：售後部門內部服務收入 {nt(laborCost)}（工時）＋ 零件庫存 {nt(partsCost)}（零件）
              <br />
              <br />
              工單完成核准後，系統自動將整備費用寫回車輛主檔 recon_labor_cost 與 recon_parts_cost，
              並重新計算 total_cost（整車成本合計）。
            </div>

            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 整車成本更新預覽</span>
                <span className="text-[11px] text-[#9A9890] ml-2">整備完成後車輛主檔的成本變化</span>
              </header>
              <div className="px-4 py-3">
                <table className="w-full text-[12.5px] border-collapse">
                  <tbody>
                    <tr className="border-b border-[#F4F3F0]">
                      <td className="px-2.5 py-1.5">收購價格</td>
                      <td className="px-2.5 py-1.5 text-right font-mono">{nt(baseCost)}</td>
                    </tr>
                    {otherCost > 0 && (
                      <tr className="border-b border-[#F4F3F0]">
                        <td className="px-2.5 py-1.5">其它分攤（運費 / 鈑烤 / 調撥）</td>
                        <td className="px-2.5 py-1.5 text-right font-mono">{nt(otherCost)}</td>
                      </tr>
                    )}
                    <tr className="bg-[#E1F5EE]">
                      <td className="px-2.5 py-1.5 text-[#0F6E56] font-semibold border-b border-[#5DCAA5]">
                        ＋ 整備工時費用（本工單）
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-[#0F6E56] font-semibold border-b border-[#5DCAA5]">
                        {nt(laborCost)}
                      </td>
                    </tr>
                    <tr className="bg-[#E1F5EE]">
                      <td className="px-2.5 py-1.5 text-[#0F6E56] font-semibold border-b-2 border-[#5DCAA5]">
                        ＋ 整備零件費用（本工單）
                      </td>
                      <td className="px-2.5 py-1.5 text-right font-mono text-[#0F6E56] font-semibold border-b-2 border-[#5DCAA5]">
                        {nt(partsCost)}
                      </td>
                    </tr>
                    <tr className="bg-[#1A3A5C]">
                      <td className="px-2.5 py-2 text-white font-bold text-[13px]">整車成本合計（更新後）</td>
                      <td className="px-2.5 py-2 text-right font-mono text-[#5DCAA5] font-bold text-[15px]">
                        {nt(totalCostPreview)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setTab(2)}
                className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                ← 零件工時
              </button>
              <button
                type="button"
                onClick={() => setTab(4)}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                完成核准 →
              </button>
            </div>
          </div>
        )}

        {/* ── TAB 4：完成核准 ── */}
        {tab === 4 && (
          <div className="space-y-3">
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 整備完成確認與核准</span>
                <span className="text-[11px] text-[#9A9890] ml-2">
                  技師簽名 + 主管核准後工單關閉，費用寫回整車成本，車輛轉為可售
                </span>
              </header>
              <div className="px-4 py-4 space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                  <Ib label="工單號" value={data.ro_code} mono tone="teal" />
                  <Ib label="完成項目" value={`${doneCount} / ${RECON_CHECKLIST_TOTAL} 項`} tone={doneCount === RECON_CHECKLIST_TOTAL ? "teal" : undefined} />
                  <Ib label="整備費用合計" value={nt(feeTotal)} tone="teal" mono />
                  <Ib label="完工後車輛狀態" value="可售（available）" tone="teal" />
                </div>

                <div>
                  <div className="text-[11.5px] font-semibold text-[#4A4A48] mb-1">完工備注與特殊狀況</div>
                  <textarea
                    value={approvalNote}
                    disabled={locked}
                    onChange={(e) => setApprovalNote(e.target.value)}
                    placeholder="整備完成備注、發現的特殊狀況說明…"
                    className="w-full h-[70px] resize-none border border-[#D5D3CB] rounded px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#185FA5] disabled:opacity-60"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <div className="text-[11.5px] font-semibold text-[#4A4A48] mb-1">
                      實際完工日期 <span className="text-[#CC0000]">*</span>
                    </div>
                    <input
                      type="date"
                      value={completedDate}
                      disabled={locked}
                      onChange={(e) => setCompletedDate(e.target.value)}
                      className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] outline-none focus:border-[#185FA5] disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <div className="text-[11.5px] font-semibold text-[#4A4A48] mb-1">里程確認</div>
                    <input
                      type="text"
                      value={data.vehicle?.mileage_km != null ? `${data.vehicle.mileage_km.toLocaleString("en-US")} km` : "—"}
                      readOnly
                      className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-[#F4F3F0] text-[#9A9890]"
                    />
                  </div>
                </div>

                {/* 三方簽署 */}
                <div className="text-[11.5px] font-semibold text-[#4A4A48]">三方簽署</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => setTechSigned((s) => !s)}
                    className={`rounded-lg border p-4 text-center flex flex-col items-center justify-center gap-1 min-h-[80px] disabled:opacity-60 ${
                      techSigned
                        ? "border-[#5DCAA5] bg-[#E1F5EE] border-solid"
                        : "border-dashed border-[#D5D3CB] bg-[#FAFAF8] hover:border-[#185FA5]"
                    }`}
                  >
                    <span className="text-[20px]">{techSigned ? "✅" : "🔧"}</span>
                    <span className="text-[12px] font-semibold text-[#4A4A48]">
                      技師簽名{techSigned ? "（已簽）" : ""}
                    </span>
                    <span className="text-[10.5px] text-[#9A9890]">
                      {data.lead_technician_name ?? "—"}・整備 24 項全數完成確認
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={locked || !canApprove}
                    onClick={() => setMgrSigned((s) => !s)}
                    className={`rounded-lg border p-4 text-center flex flex-col items-center justify-center gap-1 min-h-[80px] disabled:opacity-60 ${
                      mgrSigned
                        ? "border-[#5DCAA5] bg-[#E1F5EE] border-solid"
                        : "border-dashed border-[#D5D3CB] bg-[#FAFAF8] hover:border-[#185FA5]"
                    }`}
                  >
                    <span className="text-[20px]">{mgrSigned ? "✅" : "🛡️"}</span>
                    <span className="text-[12px] font-semibold text-[#4A4A48]">
                      售後主管核准{mgrSigned ? "（已核准）" : ""}
                    </span>
                    <span className="text-[10.5px] text-[#9A9890]">
                      {canApprove ? "核准後費用寫回整車成本，車輛可售" : "需主管權限"}
                    </span>
                  </button>
                </div>
              </div>
            </section>

            {!data.is_closed && (
              <div className="flex items-center justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => setTab(3)}
                  className="h-[30px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  ← 費用彙總
                </button>
                <button
                  type="button"
                  onClick={approve}
                  disabled={isPending || !canApprove}
                  className="h-[34px] px-6 rounded text-[13px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                >
                  {isPending ? "核准中⋯" : "✅ 核准完工 — 費用寫回整車成本"}
                </button>
              </div>
            )}

            {/* 完成卡 */}
            {(done || data.is_closed) && (
              <div className="rounded-xl p-5 text-white" style={{ background: "linear-gradient(135deg,#085041,#0F6E56)" }}>
                <div className="text-[18px] font-bold mb-1">🎉 整備完成！車輛現已可售</div>
                <div className="text-[12px] opacity-85 mb-3 leading-relaxed">
                  工單 {data.ro_code} 已關閉・費用已寫回中古車主檔・車輛狀態已更新為可售
                </div>
                <div className="rounded-lg bg-white/10 border border-white/25 px-3.5 py-3 text-[12px] leading-loose mb-3">
                  <b>✅ 系統已執行：</b>
                  <br />
                  1 · 工單狀態 → <b className="text-[#5DCAA5]">已關單</b>
                  <br />
                  2 · recon_labor_cost = <b className="text-[#5DCAA5]">{nt(done?.labor_cost ?? laborCost)}</b>、
                  recon_parts_cost = <b className="text-[#5DCAA5]">{nt(done?.parts_cost ?? partsCost)}</b> 已寫入車輛主檔
                  <br />
                  3 · total_cost（整車成本）更新為{" "}
                  <b className="text-[#5DCAA5]">
                    {done?.total_cost_after != null ? nt(done.total_cost_after) : nt(totalCostPreview)}
                  </b>
                  <br />
                  4 · 車輛主檔狀態 →{" "}
                  <b className="text-[#5DCAA5]">{done?.status_after ?? "available"}（可售）</b>
                  <br />
                  5 · RS03B 中古車庫存看板此車狀態即時更新為「在庫可售」
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Link
                    href="/sales/showroom/used-cars"
                    className="px-4 py-2 rounded-lg text-[12.5px] font-semibold bg-white text-[#085041] hover:bg-[#E1F5EE]"
                  >
                    📋 查看中古庫存
                  </Link>
                  <Link
                    href="/parts/aftersales/ro-search"
                    className="px-4 py-2 rounded-lg text-[12.5px] font-semibold bg-white/15 text-white border border-white/30 hover:bg-white/25"
                  >
                    ← 工單查詢
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 max-w-[360px] whitespace-pre-line ${
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
