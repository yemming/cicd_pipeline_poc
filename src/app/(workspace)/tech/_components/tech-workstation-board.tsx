"use client";

/**
 * 技師工作台主控台（client）。
 * 卡片式看板（proposal §2.1，刻意偏離 DataGrid / list+detail，理由見 proposal）。
 * 每個寫入動作走 server action（@/lib/aftersales/tech-workstation-actions），
 * pending 鎖 UI + 進行式文案 + 樂觀更新（CLAUDE.md §UX 互動規範）。
 *
 * 缺口修補（2026-06-15）：
 *   - 效率% KPI 欄位（todayWorkedMinutes / soldMinutes × 100）
 *   - 進行中工單置頂 amber 橫幅（pending Tab 用）
 *   - 深入檢查記錄診斷區塊（kind='inspection'，三段按鈕：正常/需關注/異常）
 *   - 施工備註文字欄（tech_note，SA / 複檢員可見）
 *   - ⏱ 工時記錄 Tab（今日工時統計 + 明細表格）
 */

import { useMemo, useState, useTransition, useEffect, useRef } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  acceptOrderAction,
  toggleWorkItemAction,
  markOrderCompleteAction,
  addAddonAction,
  startLaborTimerAction,
  pauseLaborTimerAction,
  reassignOrderAction,
  setDiagResultAction,
  saveTechNoteAction,
  submitTechUnusedReturnAction,
} from "@/lib/aftersales/tech-workstation-actions";
import type {
  AssignedOrderCard,
  TechnicianRow,
  TechWorkstationKpi,
  OtherTechnicianOption,
  AddonInput,
  AddonItemOption,
  AddonWarehouseOption,
  TimeSessionRow,
  DiagResult,
} from "@/domain/tech-workstation";

type TabKey = "pending" | "in_progress" | "done_today" | "hours";

type Perms = {
  canAccept: boolean;
  canExecute: boolean;
  canPropose: boolean;
  canDispatch: boolean;
};

type Banner = { ok: boolean; msg: string } | null;

const STATUS_PENDING = "進行中";
const STATUS_IN_REPAIR = "維修中";
const STATUS_AWAITING = "待結帳";

function statusChipClass(status: string): string {
  if (status === STATUS_IN_REPAIR) return "bg-[#EAF4FB] text-[#185FA5]";
  if (status === STATUS_PENDING) return "bg-[#FDF3E3] text-[#854F0B]";
  if (status === STATUS_AWAITING) return "bg-[#EAF3DE] text-[#3B6D11]";
  return "bg-[#F2F2F2] text-[#6B6A68]";
}

function safetyChipClass(level: string): string {
  if (level === "safety_critical") return "bg-[#FDECEA] text-[#CC0000]";
  if (level === "safety_related") return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#F2F2F2] text-[#6B6A68]";
}
function safetyLabel(level: string): string {
  if (level === "safety_critical") return "安全關鍵";
  if (level === "safety_related") return "安全相關";
  return "一般";
}

/** 診斷結果標籤 */
function diagLabel(result: DiagResult | null): string {
  if (result === "normal") return "正常";
  if (result === "attention") return "需關注";
  if (result === "abnormal") return "異常";
  return "未標記";
}

/** 診斷結果色彩 */
function diagChipClass(result: DiagResult | null): string {
  if (result === "normal") return "bg-[#EAF3DE] text-[#3B6D11]";
  if (result === "attention") return "bg-[#FDF3E3] text-[#854F0B]";
  if (result === "abnormal") return "bg-[#FDECEA] text-[#CC0000]";
  return "bg-[#F2F2F2] text-[#6B6A68]";
}

/** 讀現在時間（module-level，避免在 component render 路徑被 react-hooks/purity 誤判） */
function nowMs(): number {
  return Date.now();
}

/** 算從 startedAt 到現在經過幾秒（給暫停時樂觀計算用） */
function elapsedSecondsSince(startedAtIso: string): number {
  return Math.max(0, Math.floor((nowMs() - new Date(startedAtIso).getTime()) / 1000));
}

function fmtHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/** 格式化分鐘為 HH:MM 字串 */
function fmtMinutes(minutes: number | null): string {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function TechWorkstationBoard({
  technician,
  initialOrders,
  kpi,
  otherTechnicians,
  itemOptions,
  warehouseOptions,
  perms,
  todaySessions,
  fallbackNotice = null,
}: {
  technician: TechnicianRow;
  initialOrders: AssignedOrderCard[];
  kpi: TechWorkstationKpi;
  otherTechnicians: OtherTechnicianOption[];
  itemOptions: AddonItemOption[];
  warehouseOptions: AddonWarehouseOption[];
  perms: Perms;
  /** ⏱ 工時記錄 Tab 的今日明細（server 端撈好傳進來） */
  todaySessions: TimeSessionRow[];
  /** 非本人（fallback）檢視模式：帶技師名 → 顯示唯讀 debug 橫幅；null = 正常本人模式 */
  fallbackNotice?: { techName: string } | null;
}) {
  const [tab, setTab] = useState<TabKey>(
    initialOrders.some((o) => o.status === STATUS_IN_REPAIR) ? "in_progress" : "pending",
  );
  const [orders, setOrders] = useState<AssignedOrderCard[]>(initialOrders);
  const [banner, setBanner] = useState<Banner>(null);
  const [isPending, startTransition] = useTransition();
  const [addonForRo, setAddonForRo] = useState<string | null>(null);

  // 計算效率%
  const efficiencyPct = kpi.soldMinutes > 0
    ? Math.round((kpi.todayWorkedMinutes / kpi.soldMinutes) * 100)
    : null;

  // 進行中工單數（用於 pending Tab 置頂 amber 橫幅）
  const inProgressOrders = useMemo(
    () => orders.filter((o) => o.status === STATUS_IN_REPAIR),
    [orders],
  );

  useSetPageHeader({
    title: "技師工作台",
    breadcrumb: [{ label: "技師工作台" }],
    hideSearch: true,
    tabs: [
      { label: `待我接單 (${kpi.pendingCount})`, active: tab === "pending", onClick: () => setTab("pending") },
      { label: `進行中 (${kpi.inProgressCount})`, active: tab === "in_progress", onClick: () => setTab("in_progress") },
      { label: `今日完成 (${kpi.doneToday})`, active: tab === "done_today", onClick: () => setTab("done_today") },
      { label: "⏱ 工時記錄", active: tab === "hours", onClick: () => setTab("hours") },
    ],
  });

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) {
      window.setTimeout(() => setBanner(null), 2200);
    }
  }

  // ── 樂觀更新 helper ──
  function patchOrder(roId: string, patch: Partial<AssignedOrderCard>) {
    setOrders((prev) => prev.map((o) => (o.id === roId ? { ...o, ...patch } : o)));
  }
  function removeOrder(roId: string) {
    setOrders((prev) => prev.filter((o) => o.id !== roId));
  }

  const visibleOrders = useMemo(() => {
    if (tab === "pending") return orders.filter((o) => o.status === STATUS_PENDING);
    if (tab === "in_progress") return orders.filter((o) => o.status === STATUS_IN_REPAIR);
    // done_today：本 session 內被標記完成的（待結帳）
    return orders.filter((o) => o.status === STATUS_AWAITING);
  }, [orders, tab]);

  // ── 動作 ──
  function handleAccept(roId: string) {
    startTransition(async () => {
      const res = await acceptOrderAction(roId);
      if (res.ok) {
        patchOrder(roId, { status: STATUS_IN_REPAIR });
        setTab("in_progress");
        showBanner({ ok: true, msg: "✓ 已接單，工單已進入維修中" });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleToggleItem(roId: string, lineId: string, nextDone: boolean) {
    // 樂觀打勾
    const ro = orders.find((o) => o.id === roId);
    if (!ro) return;
    patchOrder(roId, {
      workItems: ro.workItems.map((w) => (w.id === lineId ? { ...w, done: nextDone } : w)),
    });
    startTransition(async () => {
      const res = await toggleWorkItemAction(lineId, nextDone);
      if (!res.ok) {
        // rollback
        patchOrder(roId, {
          workItems: ro.workItems.map((w) => (w.id === lineId ? { ...w, done: !nextDone } : w)),
        });
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleSetDiag(roId: string, lineId: string, result: DiagResult) {
    const ro = orders.find((o) => o.id === roId);
    if (!ro) return;
    // 樂觀更新診斷結果
    patchOrder(roId, {
      workItems: ro.workItems.map((w) => (w.id === lineId ? { ...w, diag_result: result } : w)),
    });
    startTransition(async () => {
      const res = await setDiagResultAction(lineId, result);
      if (!res.ok) {
        // rollback
        patchOrder(roId, {
          workItems: ro.workItems.map((w) => (w.id === lineId ? { ...w, diag_result: ro.workItems.find((x) => x.id === lineId)?.diag_result ?? null } : w)),
        });
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleComplete(roId: string) {
    const ro = orders.find((o) => o.id === roId);
    const laborItems = ro?.workItems.filter((w) => w.kind === "labor") ?? [];
    const undone = laborItems.filter((w) => !w.done);
    if (undone.length > 0) {
      const ok = window.confirm(
        `還有 ${undone.length} 個工項未勾選完成，確定要標記整張單完成嗎？`,
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await markOrderCompleteAction(roId);
      if (res.ok) {
        patchOrder(roId, { status: STATUS_AWAITING, timer: { isRunning: false, accumulatedSeconds: ro?.timer.accumulatedSeconds ?? 0, activeSessionId: null, activeStartedAt: null } });
        setTab("done_today");
        showBanner({ ok: true, msg: "✓ 已標記完成，工單進入待結帳，SA / 複檢員已收到通知" });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleStartTimer(roId: string) {
    const ro = orders.find((o) => o.id === roId);
    if (!ro) return;
    startTransition(async () => {
      const res = await startLaborTimerAction(roId);
      if (res.ok) {
        patchOrder(roId, {
          timer: {
            isRunning: true,
            accumulatedSeconds: ro.timer.accumulatedSeconds,
            activeSessionId: res.data.id,
            activeStartedAt: new Date().toISOString(),
          },
        });
        showBanner({ ok: true, msg: "✓ 開始計時" });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handlePauseTimer(roId: string) {
    const ro = orders.find((o) => o.id === roId);
    if (!ro || !ro.timer.activeStartedAt) return;
    const startedAt = ro.timer.activeStartedAt;
    startTransition(async () => {
      const res = await pauseLaborTimerAction(roId);
      if (res.ok) {
        patchOrder(roId, {
          timer: {
            isRunning: false,
            accumulatedSeconds: ro.timer.accumulatedSeconds + elapsedSecondsSince(startedAt),
            activeSessionId: null,
            activeStartedAt: null,
          },
        });
        showBanner({ ok: true, msg: "✓ 已暫停計時" });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleReassign(roId: string, toTechId: string) {
    if (!toTechId) return;
    startTransition(async () => {
      const res = await reassignOrderAction(roId, toTechId);
      if (res.ok) {
        removeOrder(roId);
        showBanner({ ok: true, msg: "✓ 已轉派，工單已從您的清單移除" });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleAddAddon(roId: string, payload: AddonInput) {
    startTransition(async () => {
      const res = await addAddonAction(roId, payload);
      if (res.ok) {
        setAddonForRo(null);
        // 把新 addon 樂觀塞進卡片（顯示用，addon_no 用本地估）
        const ro = orders.find((o) => o.id === roId);
        if (ro) {
          patchOrder(roId, {
            addons: [
              ...ro.addons,
              {
                id: res.data.id,
                addon_no: (ro.addons.at(-1)?.addon_no ?? 0) + 1,
                name: payload.name,
                addon_type: payload.addon_type,
                safety_level: payload.safety_level,
                tech_reason: payload.tech_reason ?? null,
                estimated_fee: payload.estimated_fee ?? 0,
                customer_decision: "pending",
                reserved_at: res.data.reserved ? new Date().toISOString() : null,
                created_at: new Date().toISOString(),
                customer_supplied: Boolean(payload.customer_supplied),
              },
            ],
          });
        }
        showBanner({
          ok: true,
          msg: payload.customer_supplied
            ? "✓ 已追加（客戶自備料，不出庫），SA 已收到通知，待與客戶確認"
            : res.data.reserved
              ? "✓ 已追加並預留零件，SA 已收到通知，待與客戶確認"
              : "✓ 已追加，SA 已收到通知，待與客戶確認",
        });
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Debug 檢視模式：未綁技師的帳號 fallback 看別人的工作台（唯讀） */}
      {fallbackNotice && (
        <div className="bg-[#FDF3E3] border border-[#F5D9A8] rounded-lg px-4 py-2.5 flex items-start gap-2">
          <span className="material-symbols-outlined text-[#854F0B] text-[18px] leading-none mt-0.5">
            visibility
          </span>
          <p className="text-[12px] text-[#854F0B] leading-relaxed">
            <b>Debug 檢視模式</b>：您的帳號尚未綁定技師，目前顯示技師「{fallbackNotice.techName}」的工作台資料（
            <b>唯讀</b>，不可接單／計時／追加／轉派）。正式使用請到「技師主檔」把您的登入帳號綁到對應技師。
          </p>
        </div>
      )}

      {/* Header：技師 + KPI */}
      <header className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className="w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold text-white"
            style={{ background: technician.avatar_color ?? "#1A3A5C" }}
          >
            {technician.name.slice(0, 1)}
          </span>
          <h1 className="text-[16px] font-semibold text-[#2C2C2A]">{technician.name}</h1>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
            {technician.code}
            {technician.grade ? ` · ${technician.grade}` : ""}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Kpi label="待接單" value={kpi.pendingCount} />
          <Kpi label="進行中" value={kpi.inProgressCount} />
          <Kpi label="今日完成" value={kpi.doneToday} />
          <Kpi label="今日工時" value={`${kpi.todayWorkedMinutes} 分`} />
          {/* 效率% KPI — 需要有賣出工時才顯示 */}
          {efficiencyPct != null && (
            <Kpi
              label="效率%"
              value={`${efficiencyPct}%`}
              highlight={efficiencyPct >= 100 ? "green" : efficiencyPct >= 80 ? undefined : "amber"}
            />
          )}
        </div>
      </header>

      {/* pending Tab：進行中工單置頂 amber 橫幅 */}
      {tab === "pending" && inProgressOrders.length > 0 && (
        <div
          className="bg-[#FDF3E3] border border-[#F5D9A8] rounded-lg px-4 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-[#fcecd3]"
          onClick={() => setTab("in_progress")}
        >
          <span className="material-symbols-outlined text-[#854F0B] text-[18px] leading-none">
            construction
          </span>
          <p className="text-[12px] text-[#854F0B] flex-1">
            <b>目前有 {inProgressOrders.length} 張工單施工中</b>
            {inProgressOrders[0] ? `（${inProgressOrders[0].ro_code}${inProgressOrders.length > 1 ? " 等" : ""}）` : ""}
            ，點此查看施工詳情 →
          </p>
        </div>
      )}

      {/* ⏱ 工時記錄 Tab */}
      {tab === "hours" ? (
        <HoursPanel kpi={kpi} efficiencyPct={efficiencyPct} sessions={todaySessions} />
      ) : (
        /* 卡片清單 */
        <section className={isPending ? "pointer-events-none opacity-60 space-y-3" : "space-y-3"}>
          {visibleOrders.length === 0 ? (
            <div className="bg-white border border-[#EEECE6] rounded-lg px-6 py-10 text-center text-[12.5px] text-[#9A9890]">
              {tab === "pending"
                ? "目前沒有待您接單的工單"
                : tab === "in_progress"
                  ? "目前沒有進行中的工單"
                  : "今日尚無完成的工單"}
            </div>
          ) : (
            visibleOrders.map((ro) => (
              <OrderCard
                key={ro.id}
                ro={ro}
                tab={tab}
                perms={perms}
                otherTechnicians={otherTechnicians}
                busy={isPending}
                onAccept={() => handleAccept(ro.id)}
                onToggleItem={(lineId, done) => handleToggleItem(ro.id, lineId, done)}
                onSetDiag={(lineId, result) => handleSetDiag(ro.id, lineId, result)}
                onComplete={() => handleComplete(ro.id)}
                onStartTimer={() => handleStartTimer(ro.id)}
                onPauseTimer={() => handlePauseTimer(ro.id)}
                onReassign={(toTechId) => handleReassign(ro.id, toTechId)}
                onOpenAddon={() => setAddonForRo(ro.id)}
                onSaveTechNote={(note) =>
                  startTransition(async () => {
                    const res = await saveTechNoteAction(ro.id, note);
                    if (res.ok) {
                      showBanner({ ok: true, msg: "✓ 施工備註已儲存" });
                    } else {
                      showBanner({ ok: false, msg: res.error });
                    }
                  })
                }
                onTechUnusedReturn={(lineId, qty, reason) =>
                  new Promise((resolve) => {
                    startTransition(async () => {
                      const res = await submitTechUnusedReturnAction(lineId, qty, reason);
                      if (res.ok) {
                        showBanner({ ok: true, msg: "✓ 已送出退料申請，待倉管確認後庫存回補" });
                      } else {
                        showBanner({ ok: false, msg: res.error });
                      }
                      resolve(res.ok);
                    });
                  })
                }
              />
            ))
          )}
        </section>
      )}

      {/* 追加項目 modal */}
      {addonForRo && (
        <AddonModal
          busy={isPending}
          itemOptions={itemOptions}
          warehouseOptions={warehouseOptions}
          onClose={() => setAddonForRo(null)}
          onSubmit={(payload) => handleAddAddon(addonForRo, payload)}
        />
      )}

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
    </main>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: "green" | "amber";
}) {
  const numColor =
    highlight === "green"
      ? "text-[#3B6D11]"
      : highlight === "amber"
        ? "text-[#854F0B]"
        : "text-[#1A3A5C]";
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-1.5 min-w-[78px]">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[15px] font-semibold leading-tight ${numColor}`}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// ⏱ 工時記錄 Panel
// ─────────────────────────────────────────────────────────────

function HoursPanel({
  kpi,
  efficiencyPct,
  sessions,
}: {
  kpi: TechWorkstationKpi;
  efficiencyPct: number | null;
  sessions: TimeSessionRow[];
}) {
  return (
    <div className="space-y-3">
      {/* 今日工時統計 stat chips */}
      <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-4">
        <div className="text-[13px] font-semibold text-[#2C2C2A] mb-3">今日工時統計</div>
        <div className="flex flex-wrap gap-3">
          <StatChip label="今日實際工時" value={fmtMinutes(kpi.todayWorkedMinutes)} />
          <StatChip label="賣出工時（標準）" value={fmtMinutes(kpi.soldMinutes)} />
          <StatChip
            label="效率%"
            value={efficiencyPct != null ? `${efficiencyPct}%` : "—"}
            color={
              efficiencyPct == null
                ? undefined
                : efficiencyPct >= 100
                  ? "green"
                  : efficiencyPct >= 80
                    ? undefined
                    : "amber"
            }
          />
          <StatChip label="完成工單數" value={String(kpi.doneToday)} />
        </div>
      </div>

      {/* 工時明細表格 */}
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">工時明細</span>
        </div>
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-[12.5px] text-[#9A9890]">今日尚無工時記錄</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EEECE6]">
                  {["工單號", "業務類型", "開始時間", "結束時間", "標準 LU", "實際工時", "效率%"].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-medium whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F2F2F2]">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-[#F8F7F4]">
                    <td className="px-3 py-2 font-mono text-[12px] text-[#1A3A5C]">{s.ro_code}</td>
                    <td className="px-3 py-2 text-[12px] text-[#5A5955]">{s.service_type ?? "—"}</td>
                    <td className="px-3 py-2 text-[12px] text-[#5A5955] whitespace-nowrap">
                      {s.started_at ? new Date(s.started_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }) : "—"}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[#5A5955] whitespace-nowrap">
                      {s.ended_at
                        ? new Date(s.ended_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false })
                        : <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">進行中</span>}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[#5A5955] text-right">
                      {s.standard_lu != null ? `${s.standard_lu} LU` : "—"}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[#2C2C2A] text-right whitespace-nowrap">
                      {fmtMinutes(s.actual_minutes)}
                    </td>
                    <td className="px-3 py-2 text-[12px] text-right">
                      {s.efficiency_pct != null ? (
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[11px] ${
                            s.efficiency_pct >= 100
                              ? "bg-[#EAF3DE] text-[#3B6D11]"
                              : s.efficiency_pct >= 80
                                ? "bg-[#EAF4FB] text-[#185FA5]"
                                : "bg-[#FDF3E3] text-[#854F0B]"
                          }`}
                        >
                          {s.efficiency_pct}%
                        </span>
                      ) : (
                        <span className="text-[#9A9890]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatChip({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: "green" | "amber";
}) {
  const numColor =
    color === "green"
      ? "text-[#3B6D11]"
      : color === "amber"
        ? "text-[#854F0B]"
        : "text-[#2C2C2A]";
  return (
    <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3 min-w-[120px]">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[18px] font-semibold leading-tight mt-0.5 ${numColor}`}>{value}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 單張 RO 卡片
// ─────────────────────────────────────────────────────────────

function OrderCard({
  ro,
  tab,
  perms,
  otherTechnicians,
  busy,
  onAccept,
  onToggleItem,
  onSetDiag,
  onComplete,
  onStartTimer,
  onPauseTimer,
  onReassign,
  onOpenAddon,
  onSaveTechNote,
  onTechUnusedReturn,
}: {
  ro: AssignedOrderCard;
  tab: TabKey;
  perms: Perms;
  otherTechnicians: OtherTechnicianOption[];
  busy: boolean;
  onAccept: () => void;
  onToggleItem: (lineId: string, done: boolean) => void;
  onSetDiag: (lineId: string, result: DiagResult) => void;
  onComplete: () => void;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onReassign: (toTechId: string) => void;
  onOpenAddon: () => void;
  onSaveTechNote: (note: string) => void;
  onTechUnusedReturn: (lineId: string, qty: number, reason: string) => Promise<boolean>;
}) {
  const liveSeconds = useLiveTimer(ro.timer.isRunning, ro.timer.activeStartedAt, ro.timer.accumulatedSeconds);
  const laborItems = ro.workItems.filter((w) => w.kind === "labor");
  const partItems = ro.workItems.filter((w) => w.kind !== "labor" && w.kind !== "inspection");
  const inspectionItems = ro.workItems.filter((w) => w.kind === "inspection");

  const isPendingTab = tab === "pending";
  const isInProgress = ro.status === STATUS_IN_REPAIR;

  // 施工備註 state（展開 / 收合）
  const [showTechNote, setShowTechNote] = useState(false);
  const [techNote, setTechNote] = useState(
    (ro as unknown as { metadata?: { tech_note?: string } }).metadata?.tech_note ?? "",
  );
  const [noteSaving, setNoteSaving] = useState(false);

  // 退料閉環場景三：技師領料後說用不到，主動退回
  const [returnOpenLineId, setReturnOpenLineId] = useState<string | null>(null);
  const [returnQty, setReturnQty] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [returnSubmitting, setReturnSubmitting] = useState(false);
  const [returnedLineIds, setReturnedLineIds] = useState<Set<string>>(new Set());

  function openReturnForm(lineId: string, maxQty: number) {
    setReturnOpenLineId(lineId);
    setReturnQty(String(maxQty));
    setReturnReason("");
  }
  async function handleSubmitReturn(lineId: string) {
    const qty = Number(returnQty);
    if (!(qty > 0)) return;
    setReturnSubmitting(true);
    const ok = await onTechUnusedReturn(lineId, qty, returnReason);
    setReturnSubmitting(false);
    if (ok) {
      setReturnedLineIds((prev) => new Set(prev).add(lineId));
      setReturnOpenLineId(null);
    }
  }

  function handleSaveNote() {
    setNoteSaving(true);
    onSaveTechNote(techNote);
    // 儲存完畢的回饋由 banner 處理，這裡只 reset 儲存中狀態
    window.setTimeout(() => setNoteSaving(false), 1500);
  }

  return (
    <article className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      {/* 卡頭 */}
      <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center gap-3 flex-wrap bg-[#F8F7F4]">
        <span className="font-mono font-semibold text-[13px] text-[#1A3A5C]">{ro.ro_code}</span>
        <span className={`px-1.5 py-0.5 rounded-md text-[11px] ${statusChipClass(ro.status)}`}>
          {ro.status}
        </span>
        {isInProgress && (
          <span
            className={`px-2 py-0.5 rounded-md text-[11px] font-mono ${
              ro.timer.isRunning ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"
            }`}
            title="本單累計工時"
          >
            ⏱ {fmtHMS(liveSeconds)} {ro.timer.isRunning ? "計時中" : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {/* 接單（pending tab + 有權限） */}
          {isPendingTab && perms.canAccept && (
            <button
              onClick={onAccept}
              disabled={busy}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
            >
              {busy ? "接單中⋯" : "接單"}
            </button>
          )}
          {/* 計時（in_progress） */}
          {isInProgress && perms.canExecute && (
            <>
              {ro.timer.isRunning ? (
                <button
                  onClick={onPauseTimer}
                  disabled={busy}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
                >
                  {busy ? "⋯" : "暫停計時"}
                </button>
              ) : (
                <button
                  onClick={onStartTimer}
                  disabled={busy}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                >
                  {busy ? "⋯" : "開始計時"}
                </button>
              )}
              <button
                onClick={onComplete}
                disabled={busy}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {busy ? "完成中⋯" : "標記完成"}
              </button>
            </>
          )}
        </div>
      </header>

      {/* 卡身 */}
      <div className="px-4 py-3 space-y-3">
        {/* 客戶 / 車輛 */}
        <div className="flex items-center gap-x-6 gap-y-1 flex-wrap text-[12.5px]">
          <KvInline label="客戶" value={ro.customer_name} />
          <KvInline label="車牌" value={ro.vehicle_license_plate} mono />
          <KvInline label="車型" value={ro.vehicle_model_name} />
          <KvInline label="服務專員" value={ro.sa_name} />
          {ro.estimated_labor_units != null && (
            <KvInline label="預估 LU" value={String(ro.estimated_labor_units)} />
          )}
        </div>

        {/* 工項清單 */}
        {laborItems.length > 0 && (
          <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-[#F8F7F4] text-[11px] font-semibold text-[#5A5955]">
              工項（{laborItems.filter((w) => w.done).length}/{laborItems.length} 完成）
            </div>
            <ul className="divide-y divide-[#F2F2F2]">
              {laborItems.map((w) => (
                <li key={w.id} className="px-3 py-2 flex items-center gap-2.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={w.done}
                    disabled={!isInProgress || !perms.canExecute || busy}
                    onChange={(e) => onToggleItem(w.id, e.target.checked)}
                    className="w-4 h-4 accent-[#0F6E56] disabled:opacity-50"
                  />
                  <span className={w.done ? "line-through text-[#9A9890]" : "text-[#2C2C2A]"}>
                    {w.name}
                  </span>
                  {w.labor_units != null && (
                    <span className="text-[11px] text-[#9A9890]">{w.labor_units} LU</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 深入檢查記錄（kind='inspection'） */}
        {inspectionItems.length > 0 && (
          <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-[#F8F7F4] text-[11px] font-semibold text-[#5A5955]">
              深入檢查記錄（{inspectionItems.filter((w) => w.diag_result != null).length}/{inspectionItems.length} 已標記）
            </div>
            <ul className="divide-y divide-[#F2F2F2]">
              {inspectionItems.map((w) => (
                <li key={w.id} className="px-3 py-2 flex items-center gap-2 flex-wrap text-[12.5px]">
                  <span className="text-[#2C2C2A] flex-1 min-w-[120px]">{w.name}</span>
                  {/* 目前結果 chip */}
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] ${diagChipClass(w.diag_result)}`}>
                    {diagLabel(w.diag_result)}
                  </span>
                  {/* 三顆診斷按鈕（施工中且有執行權限才可點） */}
                  {isInProgress && perms.canExecute && (
                    <div className="flex items-center gap-1">
                      {(["normal", "attention", "abnormal"] as DiagResult[]).map((r) => (
                        <button
                          key={r}
                          disabled={busy}
                          onClick={() => onSetDiag(w.id, r)}
                          className={`h-[24px] px-2 rounded text-[11px] border transition-colors disabled:opacity-50 ${
                            w.diag_result === r
                              ? r === "normal"
                                ? "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F] font-semibold"
                                : r === "attention"
                                  ? "bg-[#FDF3E3] text-[#854F0B] border-[#F5D9A8] font-semibold"
                                  : "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD] font-semibold"
                              : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                          }`}
                        >
                          {diagLabel(r)}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 零件（發料軌追蹤 + 領料後用不到可主動退料） */}
        {partItems.length > 0 && (
          <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-[#F8F7F4] text-[11px] font-semibold text-[#5A5955]">
              零件
            </div>
            <ul className="divide-y divide-[#F2F2F2]">
              {partItems.map((w) => (
                <li key={w.id} className="px-3 py-2 text-[12.5px]">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[#2C2C2A] flex-1">{w.name}</span>
                    {w.qty != null && <span className="text-[11px] text-[#9A9890]">× {w.qty}</span>}
                    {returnedLineIds.has(w.id) ? (
                      <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]">
                        已送出退料
                      </span>
                    ) : isInProgress && w.qty != null && w.qty > 0 ? (
                      <button
                        onClick={() =>
                          returnOpenLineId === w.id
                            ? setReturnOpenLineId(null)
                            : openReturnForm(w.id, w.qty as number)
                        }
                        className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      >
                        用不到，退料
                      </button>
                    ) : null}
                  </div>
                  {returnOpenLineId === w.id && (
                    <div className="mt-2 p-2.5 bg-[#F8F7F4] border border-[#EEECE6] rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] text-[#9A9890] font-medium">退料數量</label>
                        <input
                          type="number"
                          min={1}
                          max={w.qty ?? undefined}
                          value={returnQty}
                          disabled={returnSubmitting}
                          onChange={(e) => setReturnQty(e.target.value)}
                          className="w-[70px] h-[26px] border border-[#D5D3CB] rounded px-2 text-[11.5px] focus:border-[#185FA5] disabled:opacity-60"
                        />
                      </div>
                      <textarea
                        value={returnReason}
                        disabled={returnSubmitting}
                        onChange={(e) => setReturnReason(e.target.value)}
                        placeholder="退料原因（選填，例如：診斷後確認不需要更換）"
                        className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[11.5px] focus:border-[#185FA5] disabled:opacity-60 min-h-[50px] resize-none"
                      />
                      <div className="flex justify-end gap-1.5">
                        <button
                          onClick={() => setReturnOpenLineId(null)}
                          disabled={returnSubmitting}
                          className="h-[24px] px-2.5 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] disabled:opacity-60"
                        >
                          取消
                        </button>
                        <button
                          onClick={() => handleSubmitReturn(w.id)}
                          disabled={returnSubmitting || !(Number(returnQty) > 0)}
                          className="h-[24px] px-2.5 rounded text-[11px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                        >
                          {returnSubmitting ? "送出中⋯" : "確認退料"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 追加項目 */}
        {ro.addons.length > 0 && (
          <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-[#F8F7F4] text-[11px] font-semibold text-[#5A5955]">
              追加項目
            </div>
            <ul className="divide-y divide-[#F2F2F2]">
              {ro.addons.map((a) => (
                <li key={a.id} className="px-3 py-2 flex items-center gap-2 text-[12.5px] flex-wrap">
                  <span className="font-mono text-[11px] text-[#9A9890]">#{a.addon_no}</span>
                  <span className="text-[#2C2C2A]">{a.name}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[11px] ${safetyChipClass(a.safety_level)}`}>
                    {safetyLabel(a.safety_level)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    {a.customer_decision === "pending" ? "待確認" : a.customer_decision}
                  </span>
                  {a.reserved_at && (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                      已預留
                    </span>
                  )}
                  {a.customer_supplied && (
                    <span
                      className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]"
                      title="客戶自帶零件，不執行庫存出庫"
                    >
                      客戶自備
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 施工備註（施工中可編輯；done 時唯讀顯示） */}
        {(isInProgress || tab === "done_today") && (
          <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
            <div className="px-3 py-1.5 bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#5A5955] flex-1">
                施工備註
                <span className="ml-1 text-[10px] text-[#9A9890] font-normal">（SA / 複檢員可見）</span>
              </span>
              {isInProgress && (
                <button
                  onClick={() => setShowTechNote((v) => !v)}
                  className="text-[11px] text-[#185FA5] hover:underline"
                >
                  {showTechNote ? "收合" : "展開"}
                </button>
              )}
            </div>
            {/* done_today 直接顯示備註內容（唯讀） */}
            {tab === "done_today" && techNote && (
              <div className="px-3 py-2 text-[12.5px] text-[#5A5955] whitespace-pre-wrap">{techNote}</div>
            )}
            {/* 施工中：展開後顯示 textarea */}
            {isInProgress && showTechNote && (
              <div className="px-3 py-3 space-y-2">
                <textarea
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60 min-h-[80px] resize-none"
                  value={techNote}
                  disabled={busy || noteSaving}
                  onChange={(e) => setTechNote(e.target.value)}
                  placeholder="施工說明、發現問題、特殊情況等（SA 和複檢員可見）"
                />
                <div className="flex justify-end">
                  <button
                    onClick={handleSaveNote}
                    disabled={busy || noteSaving}
                    className="h-[28px] px-3.5 rounded text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                  >
                    {noteSaving ? "儲存中⋯" : "儲存備註"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 卡腳：追加 / 轉派 */}
        {isInProgress && (
          <div className="flex items-center gap-2 flex-wrap pt-1">
            {perms.canPropose && (
              <button
                onClick={onOpenAddon}
                disabled={busy}
                className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                ＋ 追加項目
              </button>
            )}
            {perms.canDispatch && otherTechnicians.length > 0 && (
              <ReassignControl busy={busy} options={otherTechnicians} onReassign={onReassign} />
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** 每秒 tick 的即時計時器（client 疊加，不打 server） */
function useLiveTimer(isRunning: boolean, startedAt: string | null, baseSeconds: number): number {
  const [now, setNow] = useState(() => Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isRunning && startedAt) {
      timerRef.current = setInterval(() => setNow(Date.now()), 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return undefined;
  }, [isRunning, startedAt]);

  if (isRunning && startedAt) {
    const elapsed = Math.floor((now - new Date(startedAt).getTime()) / 1000);
    return baseSeconds + Math.max(0, elapsed);
  }
  return baseSeconds;
}

function ReassignControl({
  busy,
  options,
  onReassign,
}: {
  busy: boolean;
  options: OtherTechnicianOption[];
  onReassign: (toTechId: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={val}
        disabled={busy}
        onChange={(e) => setVal(e.target.value)}
        className="h-[26px] border border-[#D5D3CB] rounded px-2 text-[11.5px] focus:border-[#185FA5] disabled:opacity-60"
      >
        <option value="">轉派給⋯</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}（{t.code}）
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          if (val) onReassign(val);
        }}
        disabled={busy || !val}
        className="h-[26px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
      >
        {busy ? "轉派中⋯" : "轉派"}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 追加項目 modal
// ─────────────────────────────────────────────────────────────

function AddonModal({
  busy,
  itemOptions,
  warehouseOptions,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  itemOptions: AddonItemOption[];
  warehouseOptions: AddonWarehouseOption[];
  onClose: () => void;
  onSubmit: (payload: AddonInput) => void;
}) {
  const [name, setName] = useState("");
  const [addonType, setAddonType] = useState<AddonInput["addon_type"]>("labor");
  const [safety, setSafety] = useState<AddonInput["safety_level"]>("normal");
  const [reason, setReason] = useState("");
  const [fee, setFee] = useState("");
  // 零件預留欄位（只在追加含零件時相關 → 餵 reserve_item）
  const [itemId, setItemId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [qty, setQty] = useState("1");
  // B3：客戶自帶零件確認書 — 勾選後不預留庫存、不出庫
  const [customerSupplied, setCustomerSupplied] = useState(false);

  const inputClass =
    "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  // 含零件的類型才顯示「備件預留」區塊（pure labor 不需要選零件）
  const involvesParts = addonType === "parts" || addonType === "labor_and_parts";
  const qtyNum = Number(qty);
  // 有選零件時，倉庫 + 數量必填且 qty > 0；沒選零件（labor-only）→ reserve_item: null
  // 客戶自備料時完全不需要備件預留欄位，跳過驗證
  const reserveInvalid =
    !customerSupplied &&
    involvesParts &&
    itemId !== "" &&
    (warehouseId === "" || !Number.isFinite(qtyNum) || qtyNum <= 0);
  const canSubmit = !!name.trim() && !reserveInvalid;

  function toggleCustomerSupplied(checked: boolean) {
    setCustomerSupplied(checked);
    if (checked) {
      // 客戶自備料 → 清空備件預留欄位，確保不會誤帶 reserve_item
      setItemId("");
      setWarehouseId("");
      setQty("1");
    }
  }

  function submit() {
    if (!name.trim()) return;
    // 只有「含零件」且實際選了零件、倉庫、qty>0，且非客戶自備料 才帶 reserve_item
    const reserve_item =
      !customerSupplied && involvesParts && itemId && warehouseId && qtyNum > 0
        ? { item_id: itemId, warehouse_id: warehouseId, qty: qtyNum }
        : null;
    if (reserveInvalid) return;
    onSubmit({
      name: name.trim(),
      addon_type: addonType,
      safety_level: safety,
      tech_reason: reason.trim() || null,
      estimated_fee: fee.trim() ? Number(fee) : 0,
      reserve_item,
      customer_supplied: customerSupplied,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className={`bg-white rounded-lg shadow-xl w-full max-w-md ${busy ? "pointer-events-none opacity-60" : ""}`}>
        <header className="px-4 py-3 border-b border-[#EEECE6]">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">追加項目</h2>
          <p className="text-[11px] text-[#9A9890] mt-0.5">追加後狀態為「待確認」，由 SA 與客戶確認後生效</p>
        </header>
        <div className="px-4 py-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>項目名稱 *</label>
            <input
              className={inputClass}
              value={name}
              disabled={busy}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：後輪軸承異音檢修"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>類型</label>
              <select
                className={inputClass}
                value={addonType}
                disabled={busy}
                onChange={(e) => setAddonType(e.target.value as AddonInput["addon_type"])}
              >
                <option value="labor">工資</option>
                <option value="parts">零件</option>
                <option value="labor_and_parts">工資+零件</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>安全等級</label>
              <select
                className={inputClass}
                value={safety}
                disabled={busy}
                onChange={(e) => setSafety(e.target.value as AddonInput["safety_level"])}
              >
                <option value="normal">一般</option>
                <option value="safety_related">安全相關</option>
                <option value="safety_critical">安全關鍵</option>
              </select>
            </div>
          </div>
          {/* B3：客戶自帶零件確認書 — 只在含零件的類型顯示 */}
          {involvesParts && (
            <label className="flex items-start gap-2 border border-[#B8D9EF] bg-[#EAF4FB] rounded-lg px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={customerSupplied}
                disabled={busy}
                onChange={(e) => toggleCustomerSupplied(e.target.checked)}
              />
              <span className="text-[12px] text-[#185FA5]">
                <b>客戶自備料</b>：客戶自己攜帶零件安裝，本項目不從店內庫存出庫、庫存數字不變。
                同意後 SA 需與客戶各自簽署一份責任聲明書（於「追加項目」詳情頁簽署）。
              </span>
            </label>
          )}
          {/* 備件預留：只在追加含零件且非客戶自備料時顯示。選了零件才需填倉庫 + 數量、送出帶 reserve_item */}
          {involvesParts && !customerSupplied && (
            <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
              <div className="px-3 py-1.5 bg-[#F8F7F4] text-[11px] font-semibold text-[#5A5955]">
                備件預留（選填）
              </div>
              <div className="px-3 py-3 space-y-3">
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>零件</label>
                  <select
                    className={inputClass}
                    value={itemId}
                    disabled={busy}
                    onChange={(e) => setItemId(e.target.value)}
                  >
                    <option value="">不預留零件</option>
                    {itemOptions.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.code} · {it.name}
                      </option>
                    ))}
                  </select>
                </div>
                {itemId && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className={labelClass}>來源倉庫 *</label>
                      <select
                        className={inputClass}
                        value={warehouseId}
                        disabled={busy}
                        onChange={(e) => setWarehouseId(e.target.value)}
                      >
                        <option value="">請選擇倉庫</option>
                        {warehouseOptions.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.code} · {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={labelClass}>數量 *</label>
                      <input
                        className={inputClass}
                        value={qty}
                        type="number"
                        min={1}
                        disabled={busy}
                        onChange={(e) => setQty(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {reserveInvalid && (
                  <p className="text-[11px] text-[#CC0000]">已選零件時，請選來源倉庫並填寫數量（大於 0）</p>
                )}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>預估費用（NT$）</label>
            <input
              className={inputClass}
              value={fee}
              disabled={busy}
              inputMode="numeric"
              onChange={(e) => setFee(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="0"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>技師說明</label>
            <textarea
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60 min-h-[64px]"
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
              placeholder="為何建議追加？"
            />
          </div>
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={busy}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            onClick={submit}
            disabled={busy || !canSubmit}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {busy ? "新增中⋯" : "確認追加"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function KvInline({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <span className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>{value ?? "—"}</span>
    </span>
  );
}
