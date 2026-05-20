"use client";

/**
 * Warranty RO-Link Board — A 級狀態流主畫面
 *
 * Layout（由上到下）：
 *  1. Page Header (title + sprint chip + caption)
 *  2. KpiCard 列（未送件 / 審核中 / 已過 SLA / 已回收金額）
 *  3. FlowDiagram：RO → 保固申請 → 原廠審核 → 費用回收
 *  4. Filter Bar + DataGrid（claim_no / RO link / 狀態 chip / SLA 倒數 / amount / 操作）
 *  5. DMS 串接設定（既有）— 收合成下方副區塊保留
 *  6. Banner（fixed）+ 駁回 Modal
 *
 * 寫入皆走 server action（Result<T>），pending 鎖 UI、樂觀更新由 router.refresh 取代。
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard, FlowDiagram } from "@/components/visualization";

import type {
  WarrantyClaimRow,
  WarrantyClaimStats,
  WarrantyClaimStatus,
  WarrantyClaimsFilter,
} from "@/domain/parts-warranty";
import {
  testRoLinkConnection,
  updateRoLinkConfig,
  type RoLinkConfigPatch,
  type RoLinkConfigRow,
} from "@/domain/warranty";
import {
  submitClaim,
  markApproved,
  markReimbursed,
  markRejected,
  sendUrgentReminder,
} from "@/lib/parts-warranty/ro-link-actions";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<WarrantyClaimStatus, string> = {
  draft: "草稿",
  submitted: "送件審核",
  approved: "已核准",
  rejected: "已駁回",
  reimbursed: "已撥款",
};

const STATUS_CHIP: Record<WarrantyClaimStatus, string> = {
  draft: "bg-[#F2F2F2] text-[#6B6A68]",
  submitted: "bg-[#FDF3E3] text-[#854F0B]",
  approved: "bg-[#EAF4FB] text-[#185FA5]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
  reimbursed: "bg-[#EAF3DE] text-[#3B6D11]",
};

const STATUS_OPTIONS: { value: WarrantyClaimStatus | "all"; label: string }[] = [
  { value: "all", label: "全部狀態" },
  { value: "draft", label: "草稿" },
  { value: "submitted", label: "送件審核" },
  { value: "approved", label: "已核准" },
  { value: "rejected", label: "已駁回" },
  { value: "reimbursed", label: "已撥款" },
];

const OVERDUE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "yes", label: "🚨 已過 SLA" },
  { value: "no", label: "SLA 內" },
];

const SYNC_FIELDS: { key: keyof RoLinkConfigPatch; label: string }[] = [
  { key: "sync_ro_to_issue", label: "RO 工單號 → 庫存出庫單號自動帶入" },
  { key: "sync_vin_check", label: "車輛序列號（VIN）→ 自動比對保固資格" },
  { key: "sync_warranty_label", label: "保固類型 → 自動標記索賠類別" },
  { key: "sync_technician", label: "技師 ID → 自動記錄負責人" },
  { key: "sync_estimate", label: "估價明細 → 同步至費用回收模組" },
];

export function WarrantyRoLinkBoard({
  claims,
  stats,
  config,
  filter,
  canEdit,
}: {
  claims: WarrantyClaimRow[];
  stats: WarrantyClaimStats;
  config: RoLinkConfigRow | null;
  filter: WarrantyClaimsFilter;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [draftCfg, setDraftCfg] = useState<RoLinkConfigRow | null>(config);
  const [showConfig, setShowConfig] = useState(false);

  // Reject modal
  const [rejectTarget, setRejectTarget] =
    useState<WarrantyClaimRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // local filter draft（filter bar）
  const [fStatus, setFStatus] = useState<string>(filter.status ?? "all");
  const [fOverdue, setFOverdue] = useState<string>(filter.overdue ?? "all");
  const [fFrom, setFFrom] = useState(filter.from ?? "");
  const [fTo, setFTo] = useState(filter.to ?? "");
  const [fKeyword, setFKeyword] = useState(filter.keyword ?? "");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const pushFilter = () => {
    const sp = new URLSearchParams();
    if (fStatus && fStatus !== "all") sp.set("status", fStatus);
    if (fOverdue && fOverdue !== "all") sp.set("overdue", fOverdue);
    if (fFrom) sp.set("from", fFrom);
    if (fTo) sp.set("to", fTo);
    if (fKeyword.trim()) sp.set("q", fKeyword.trim());
    startTransition(() => router.push(`?${sp.toString()}`));
  };

  const resetFilter = () => {
    setFStatus("all");
    setFOverdue("all");
    setFFrom("");
    setFTo("");
    setFKeyword("");
    startTransition(() => router.push("?"));
  };

  // Server action wrappers
  const wrap = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) => {
    startTransition(async () => {
      const res = (await fn()) as
        | { ok: true; data: unknown }
        | { ok: false; error: string };
      if (res.ok) {
        showBanner({ ok: true, msg: okMsg });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const onSubmit = (r: WarrantyClaimRow) =>
    wrap(() => submitClaim(r.id), `✓ ${r.claim_no} 已送件原廠`);
  const onApprove = (r: WarrantyClaimRow) =>
    wrap(() => markApproved(r.id), `✓ ${r.claim_no} 已標記核准`);
  const onReimburse = (r: WarrantyClaimRow) =>
    wrap(() => markReimbursed(r.id), `✓ ${r.claim_no} 已標記撥款`);
  const onUrgent = (r: WarrantyClaimRow) =>
    wrap(
      () => sendUrgentReminder(r.id),
      `✓ 已派送催促 LINE：${r.claim_no}`,
    );
  const submitReject = () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      showBanner({ ok: false, msg: "請填寫駁回原因" });
      return;
    }
    wrap(
      () => markRejected(rejectTarget.id, reason),
      `✓ ${rejectTarget.claim_no} 已駁回`,
    );
    setRejectTarget(null);
    setRejectReason("");
  };

  // DMS config save
  const cfgDirty = useMemo(() => {
    if (!draftCfg || !config) return false;
    return (
      draftCfg.sync_ro_to_issue !== config.sync_ro_to_issue ||
      draftCfg.sync_vin_check !== config.sync_vin_check ||
      draftCfg.sync_warranty_label !== config.sync_warranty_label ||
      draftCfg.sync_technician !== config.sync_technician ||
      draftCfg.sync_estimate !== config.sync_estimate ||
      draftCfg.sync_frequency !== config.sync_frequency ||
      draftCfg.fallback_action !== config.fallback_action ||
      draftCfg.expiry_alert_days !== config.expiry_alert_days
    );
  }, [draftCfg, config]);

  const saveCfg = () => {
    if (!draftCfg) return;
    const patch: RoLinkConfigPatch = {
      sync_ro_to_issue: draftCfg.sync_ro_to_issue,
      sync_vin_check: draftCfg.sync_vin_check,
      sync_warranty_label: draftCfg.sync_warranty_label,
      sync_technician: draftCfg.sync_technician,
      sync_estimate: draftCfg.sync_estimate,
      sync_frequency: draftCfg.sync_frequency,
      fallback_action: draftCfg.fallback_action,
      expiry_alert_days: draftCfg.expiry_alert_days,
    };
    startTransition(async () => {
      const res = await updateRoLinkConfig(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存 DMS 串接設定" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };
  const testConn = () => {
    startTransition(async () => {
      const res = await testRoLinkConnection();
      if (res.ok)
        showBanner({
          ok: true,
          msg: `✓ DMS 連線正常（延遲 ${res.data.latencyMs}ms）`,
        });
      else showBanner({ ok: false, msg: res.error });
    });
  };

  // FlowDiagram nodes（顯示各狀態件數）
  const flowNodes = [
    { id: "ro", label: `RO 工單（${claims.length}）`, tone: "blue" as const },
    {
      id: "submitted",
      label: `保固送件（${stats.submitted_count}）`,
      tone: "amber" as const,
    },
    {
      id: "approved",
      label: `原廠核准（${stats.approved_count}）`,
      tone: "teal" as const,
    },
    {
      id: "reimbursed",
      label: `費用回收（${stats.reimbursed_count}）`,
      tone: "green" as const,
    },
  ];
  const flowEdges = [
    { from: "ro", to: "submitted", label: "送件" },
    { from: "submitted", to: "approved", label: "審核 OK" },
    { from: "approved", to: "reimbursed", label: "撥款" },
  ];

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  // ────────────────────────────────────────────────────────────
  // Columns
  // ────────────────────────────────────────────────────────────
  const columns: DataGridColumn<WarrantyClaimRow>[] = [
    {
      id: "claim_no",
      header: "索賠單號",
      width: 150,
      hideable: false,
      cell: (r) => (
        <span className="font-mono font-semibold text-[#1A3A5C]">
          {r.claim_no}
        </span>
      ),
      exportValue: (r) => r.claim_no,
      sortValue: (r) => r.claim_no,
    },
    {
      id: "ro",
      header: "RO 工單",
      width: 160,
      cell: (r) =>
        r.ro_code || r.ro_no ? (
          <span className="font-mono text-[#185FA5]">
            {r.ro_code ?? r.ro_no}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.ro_code ?? r.ro_no ?? "",
      sortValue: (r) => r.ro_code ?? r.ro_no ?? "",
    },
    {
      id: "item",
      header: "項目",
      width: 200,
      cell: (r) => (
        <div className="leading-tight">
          <div className="text-[12.5px] text-[#2C2C2A]">{r.item_label}</div>
          {r.warranty_type ? (
            <div className="text-[11px] text-[#9A9890] mt-0.5">
              {r.warranty_type}
              {r.hours_label ? ` · ${r.hours_label}` : ""}
            </div>
          ) : null}
        </div>
      ),
      exportValue: (r) =>
        `${r.item_label}${r.warranty_type ? ` (${r.warranty_type})` : ""}`,
      sortValue: (r) => r.item_label,
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
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
      id: "sla",
      header: "SLA 倒數",
      width: 130,
      cell: (r) => {
        if (r.status !== "submitted" || r.sla_remaining_days === null) {
          return <span className="text-[#9A9890]">—</span>;
        }
        const d = r.sla_remaining_days;
        if (d < 0) {
          return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap bg-[#FDECEA] text-[#CC0000]">
              ⚠️ 已過 {Math.abs(d)} 天
            </span>
          );
        }
        if (d <= 3) {
          return (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
              剩 {d} 天
            </span>
          );
        }
        return <span className="text-[12px] text-[#5A5955]">剩 {d} 天</span>;
      },
      exportValue: (r) =>
        r.sla_remaining_days === null ? "" : String(r.sla_remaining_days),
      sortValue: (r) => r.sla_remaining_days ?? 9999,
    },
    {
      id: "apply_amount",
      header: "申請金額",
      width: 110,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[#2C2C2A]">
          ${r.apply_amount.toLocaleString()}
        </span>
      ),
      exportValue: (r) => String(r.apply_amount),
      sortValue: (r) => r.apply_amount,
    },
    {
      id: "approved_amount",
      header: "核准/撥款",
      width: 110,
      align: "right",
      cell: (r) =>
        r.approved_amount > 0 ? (
          <span className="font-mono font-semibold text-[#0F6E56]">
            ${r.approved_amount.toLocaleString()}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => String(r.approved_amount),
      sortValue: (r) => r.approved_amount,
    },
    {
      id: "submitted_at",
      header: "送件日",
      width: 110,
      cell: (r) =>
        r.submitted_at ? (
          <span className="text-[11.5px] text-[#5A5955]">
            {r.submitted_at.slice(0, 10)}
          </span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.submitted_at?.slice(0, 10) ?? "",
      sortValue: (r) => r.submitted_at ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          保固索賠 RO 工單串接
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04L-10
        </span>
        <span className="text-[12px] text-[#9A9890]">
          狀態流：RO → 送件審核 → 原廠核准 → 費用回收
        </span>
        <button
          type="button"
          onClick={() => setShowConfig((v) => !v)}
          className="ml-auto h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          {showConfig ? "▴ 收合 DMS 設定" : "▾ DMS 串接設定"}
        </button>
      </header>

      {/* KPI 列 */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${lockedClass}`}>
        <KpiCard
          tone="gray"
          label="草稿未送件"
          value={stats.draft_count}
        />
        <KpiCard
          tone="amber"
          label="審核中"
          value={stats.submitted_count}
        />
        <KpiCard
          tone="red"
          label="已過 SLA"
          value={stats.overdue_count}
        />
        <KpiCard
          tone="green"
          label="已回收金額"
          value={`$${stats.reimbursed_amount.toLocaleString()}`}
        />
      </div>

      {/* FlowDiagram */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            🔄 索賠狀態流（各階段件數）
          </span>
        </header>
        <div className="px-4 py-3">
          <FlowDiagram nodes={flowNodes} edges={flowEdges} />
        </div>
      </section>

      {/* Filter Bar */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${lockedClass}`}
      >
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              狀態
            </label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              SLA
            </label>
            <select
              value={fOverdue}
              onChange={(e) => setFOverdue(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {OVERDUE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              送件日 起
            </label>
            <input
              type="date"
              value={fFrom}
              onChange={(e) => setFFrom(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              送件日 訖
            </label>
            <input
              type="date"
              value={fTo}
              onChange={(e) => setFTo(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[160px]">
            <label className="text-[11px] text-[#9A9890] font-medium">
              關鍵字
            </label>
            <input
              value={fKeyword}
              onChange={(e) => setFKeyword(e.target.value)}
              placeholder="索賠單號 / RO / 項目"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={pushFilter}
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
          </div>
        </div>
      </section>

      {/* DataGrid + 超期 highlight */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            📋 索賠單列表（共 {claims.length} 筆）
          </span>
          {stats.overdue_count > 0 ? (
            <span className="text-[11.5px] text-[#CC0000] font-medium">
              ⚠️ {stats.overdue_count} 筆已過 SLA、請優先處理
            </span>
          ) : null}
        </header>
        <div className="px-4 py-3">
          <DataGrid<WarrantyClaimRow>
            columns={columns}
            data={claims}
            rowKey={(r) => r.id}
            persistKey="parts/warranty/ro-link/claims"
            exportFileName="ro-link-claims"
            emptyMessage={
              isPending
                ? "查詢中⋯"
                : claims.length === 0
                ? "沒有符合條件的索賠單"
                : ""
            }
            disabled={isPending}
            rowExtraBelow={(r) =>
              r.overdue ? (
                <div className="bg-[#FDECEA] border-l-4 border-[#CC0000] px-3 py-1.5 text-[11.5px] text-[#CC0000] font-medium">
                  ⚠️ 已過 SLA {Math.abs(r.sla_remaining_days ?? 0)} 天
                  {r.notes ? ` — ${r.notes}` : ""}
                  ；建議按下「催促」推 LINE 給原廠窗口
                </div>
              ) : null
            }
            rowActionsWidth={canEdit ? 320 : 80}
            rowActions={(r) => (
              <div className="flex items-center gap-1.5">
                {r.status === "draft" && canEdit ? (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => onSubmit(r)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
                  >
                    送件
                  </button>
                ) : null}
                {r.status === "submitted" && canEdit ? (
                  <>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => onApprove(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
                    >
                      標核准
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => {
                        setRejectTarget(r);
                        setRejectReason("");
                      }}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
                    >
                      駁回
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => onUrgent(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-60"
                      title="送 LINE 推播給原廠窗口"
                    >
                      {isPending ? "派送中⋯" : "🔔 催促"}
                    </button>
                  </>
                ) : null}
                {r.status === "approved" && canEdit ? (
                  <>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => onReimburse(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
                    >
                      標撥款
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => onUrgent(r)}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
                    >
                      🔔 催促
                    </button>
                  </>
                ) : null}
                {r.status === "rejected" || r.status === "reimbursed" ? (
                  <span className="text-[11.5px] text-[#9A9890]">—</span>
                ) : null}
              </div>
            )}
          />
        </div>
      </section>

      {/* DMS 串接設定（收合） */}
      {showConfig && draftCfg ? (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              🔌 DMS 串接設定
            </span>
          </header>
          <div className={`px-4 py-3 space-y-2.5 text-[12.5px] ${lockedClass}`}>
            <div className="px-3 py-2.5 rounded-md bg-[#EAF3DE] border border-[#C5DC9F] flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold text-[#3B6D11]">
                  ✅ {draftCfg.dms_label ?? "DMS"} 已連線
                </div>
                <div className="text-[11px] text-[#5A5955] mt-0.5">
                  API 端點：{draftCfg.dms_endpoint ?? "—"}
                </div>
              </div>
              <button
                type="button"
                onClick={testConn}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                {isPending ? "測試中⋯" : "測試連線"}
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {SYNC_FIELDS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A]"
                >
                  <input
                    type="checkbox"
                    disabled={!canEdit || isPending}
                    checked={Boolean(draftCfg[key as keyof RoLinkConfigRow])}
                    onChange={(e) =>
                      setDraftCfg({
                        ...draftCfg,
                        [key]: e.target.checked,
                      } as RoLinkConfigRow)
                    }
                    style={{ accentColor: "#0F6E56" }}
                  />
                  {label}
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={saveCfg}
              disabled={!canEdit || !cfgDirty || isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
            >
              {isPending ? "儲存中⋯" : "儲存設定"}
            </button>
          </div>
        </section>
      ) : null}

      {/* Reject modal */}
      {rejectTarget ? (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center px-4"
          onClick={() => {
            if (!isPending) setRejectTarget(null);
          }}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
                駁回索賠單 {rejectTarget.claim_no}
              </h2>
            </header>
            <div className="px-4 py-3 space-y-2">
              <label className="text-[11px] text-[#9A9890] font-medium">
                駁回原因（必填）
              </label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={4}
                disabled={isPending}
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                placeholder="例：超過保固里程、人為損壞、單據不全……"
              />
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => setRejectTarget(null)}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isPending || !rejectReason.trim()}
                onClick={submitReject}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-60"
              >
                {isPending ? "處理中⋯" : "確認駁回"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Banner */}
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
