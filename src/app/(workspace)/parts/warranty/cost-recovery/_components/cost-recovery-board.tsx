"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  markClaimPaid,
  updateCostRecoveryConfig,
  type ClaimRow,
  type CostRecoveryConfigRow,
  type CostRecoveryStats,
} from "@/domain/warranty";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

export type CRConfig = CostRecoveryConfigRow;
export type Claim = ClaimRow;

const STATUS_BADGE: Record<string, string> = {
  reviewing: "bg-[#FDF3E3] text-[#854F0B]",
  approved: "bg-[#EBF3FF] text-[#1A3A5C]",
  paid: "bg-[#EAF3DE] text-[#3B6D11]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
};

const STATUS_LABEL_FALLBACK: Record<string, string> = {
  reviewing: "審核中",
  approved: "核准-待收款",
  paid: "已收款",
  rejected: "已拒絕",
};

const WARRANTY_TYPE_BADGE: Record<string, string> = {
  原廠保固: "bg-[#EBF3FF] text-[#1A3A5C]",
  延伸保固: "bg-[#E8F5F0] text-[#0F6E56]",
  TSB: "bg-[#FDF3E3] text-[#854F0B]",
  PDI: "bg-[#F2F2F2] text-[#6B6A68]",
};

const TWD = (n: number) => `NT$${n.toLocaleString("en-US")}`;
const fmtAmount = (n: number) => n.toLocaleString("en-US");

type Banner = { ok: boolean; msg: string } | null;

type FilterState = {
  status: string;
  warranty_type: string;
  month: string;
  keyword: string;
};

export function CostRecoveryBoard({
  config,
  claims,
  stats,
  warrantyTypes,
  canEdit,
  initialFilter,
}: {
  config: CRConfig | null;
  claims: Claim[];
  stats: CostRecoveryStats;
  warrantyTypes: string[];
  canEdit: boolean;
  initialFilter: FilterState;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [filter, setFilter] = useState<FilterState>(initialFilter);

  const totalAmount = useMemo(
    () =>
      claims.reduce(
        (s, c) =>
          s + (c.status === "rejected" ? c.apply_amount : c.approved_amount),
        0,
      ),
    [claims],
  );

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const pushFilter = (next: FilterState) => {
    const params = new URLSearchParams();
    if (next.status && next.status !== "all") params.set("status", next.status);
    if (next.warranty_type && next.warranty_type !== "all")
      params.set("warranty_type", next.warranty_type);
    if (next.month) params.set("month", next.month);
    if (next.keyword.trim()) params.set("keyword", next.keyword.trim());
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  };

  const onQuery = () => pushFilter(filter);
  const onReset = () => {
    const fresh: FilterState = {
      status: "all",
      warranty_type: "all",
      month: "",
      keyword: "",
    };
    setFilter(fresh);
    pushFilter(fresh);
  };

  const updateCfg = (patch: Partial<CRConfig>) => {
    startTransition(async () => {
      const res = await updateCostRecoveryConfig(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const markPaid = (id: string, no: string) => {
    startTransition(async () => {
      const res = await markClaimPaid(id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${no} 已標記為已收款` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<Claim>[] = [
    {
      id: "claim_no",
      header: "索賠單號",
      width: 140,
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
      id: "ro_no",
      header: "RO 工單",
      width: 130,
      cell: (r) => (
        <span className="font-mono text-[#5A5955]">{r.ro_no ?? "—"}</span>
      ),
      exportValue: (r) => r.ro_no ?? "",
      sortValue: (r) => r.ro_no ?? "",
    },
    {
      id: "item",
      header: "品名（主要零件）",
      cell: (r) => (
        <div>
          <div>{r.item_label}</div>
          {r.hours_label ? (
            <div className="text-[11px] text-[#9A9890]">{r.hours_label}</div>
          ) : null}
        </div>
      ),
      exportValue: (r) =>
        r.hours_label ? `${r.item_label}（${r.hours_label}）` : r.item_label,
      sortValue: (r) => r.item_label,
    },
    {
      id: "warranty_type",
      header: "類型",
      width: 110,
      cell: (r) =>
        r.warranty_type ? (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${
              WARRANTY_TYPE_BADGE[r.warranty_type] ??
              "bg-[#EBF3FF] text-[#1A3A5C]"
            }`}
          >
            {r.warranty_type}
          </span>
        ) : (
          <span className="text-[11px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.warranty_type ?? "",
      sortValue: (r) => r.warranty_type ?? "",
    },
    {
      id: "apply_amount",
      header: "申請金額",
      width: 110,
      align: "right",
      cell: (r) => (
        <span className="font-mono">{fmtAmount(r.apply_amount)}</span>
      ),
      exportValue: (r) => String(r.apply_amount),
      sortValue: (r) => r.apply_amount,
    },
    {
      id: "approved_amount",
      header: "核准金額",
      width: 110,
      align: "right",
      cell: (r) => (
        <span className="font-mono">{fmtAmount(r.approved_amount)}</span>
      ),
      exportValue: (r) => String(r.approved_amount),
      sortValue: (r) => r.approved_amount,
    },
    {
      id: "status",
      header: "狀態",
      width: 110,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
            STATUS_BADGE[r.status] ?? STATUS_BADGE.reviewing
          }`}
        >
          {r.status_label ?? STATUS_LABEL_FALLBACK[r.status] ?? r.status}
        </span>
      ),
      exportValue: (r) =>
        r.status_label ?? STATUS_LABEL_FALLBACK[r.status] ?? r.status,
      sortValue: (r) => r.status,
    },
    {
      id: "expected_pay_date",
      header: "預計收款日",
      width: 110,
      cell: (r) => r.expected_pay_date ?? "—",
      exportValue: (r) => r.expected_pay_date ?? "",
      sortValue: (r) => r.expected_pay_date ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          索賠費用回收追蹤
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          11.6
        </span>
        <span className="text-[12px] text-[#9A9890]">
          費用回收狀態追蹤 · 收款提醒 · 自動成本沖銷
        </span>
      </header>

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

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "本月待收款",
            value: stats.pending_amount,
            count: stats.pending_count,
            color: "text-[#1A3A5C]",
          },
          {
            label: "本月已收款",
            value: stats.paid_amount,
            count: stats.paid_count,
            color: "text-[#3B6D11]",
          },
          {
            label: "審核中金額",
            value: stats.reviewing_amount,
            count: stats.reviewing_count,
            color: "text-[#854F0B]",
          },
          {
            label: "本月拒絕金額",
            value: stats.rejected_amount,
            count: stats.rejected_count,
            color: "text-[#CC0000]",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3"
          >
            <div className="text-[11px] text-[#9A9890]">{s.label}</div>
            <div className={`text-[20px] font-bold mt-1 ${s.color}`}>
              {TWD(s.value)}
            </div>
            <div className="text-[11px] text-[#9A9890]">{`${s.count} 件`}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              狀態
            </label>
            <select
              value={filter.status}
              onChange={(e) =>
                setFilter((f) => ({ ...f, status: e.target.value }))
              }
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="all">全部狀態</option>
              <option value="reviewing">審核中</option>
              <option value="approved">核准-待收款</option>
              <option value="paid">已收款</option>
              <option value="rejected">已拒絕</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              索賠類型
            </label>
            <select
              value={filter.warranty_type}
              onChange={(e) =>
                setFilter((f) => ({ ...f, warranty_type: e.target.value }))
              }
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="all">全部類型</option>
              {warrantyTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              期間（預計收款月）
            </label>
            <input
              type="month"
              value={filter.month}
              onChange={(e) =>
                setFilter((f) => ({ ...f, month: e.target.value }))
              }
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              關鍵字
            </label>
            <input
              type="text"
              placeholder="單號 / 工單 / 品名"
              value={filter.keyword}
              onChange={(e) =>
                setFilter((f) => ({ ...f, keyword: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") onQuery();
              }}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-44"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              disabled={isPending}
              onClick={onQuery}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={onReset}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          💰 索賠費用回收明細 · 共{" "}
          <b className="text-[#2C2C2A]">{claims.length}</b> 筆 · 合計{" "}
          <b className="text-[#2C2C2A]">{TWD(totalAmount)}</b>
        </span>
      </div>

      {/* DataGrid */}
      <div className={lockedClass}>
        <DataGrid
          columns={columns}
          data={claims}
          rowKey={(r) => r.id}
          persistKey="parts/warranty/cost-recovery"
          exportFileName="cost-recovery"
          emptyMessage="無索賠記錄"
          disabled={isPending}
          rowActionsWidth={140}
          rowActions={(r) =>
            r.status === "approved" ? (
              <button
                type="button"
                disabled={!canEdit || isPending}
                onClick={() => markPaid(r.id, r.claim_no)}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "處理中⋯" : "標記已收款"}
              </button>
            ) : (
              <span className="text-[11px] text-[#9A9890]">—</span>
            )
          }
        />
      </div>

      {/* 自動化設定 */}
      {config ? (
        <section
          className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
        >
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              ⚙️ 費用回收自動化設定
            </h2>
          </header>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3 text-[12.5px]">
            <ConfigGroup title="收款提醒">
              <ConfigCheckbox
                checked={config.remind_7_days_before}
                disabled={!canEdit || isPending}
                onChange={(v) => updateCfg({ remind_7_days_before: v })}
                label="預計收款日前 7 天發送提醒"
              />
              <ConfigCheckbox
                checked={config.alert_on_overdue}
                disabled={!canEdit || isPending}
                onChange={(v) => updateCfg({ alert_on_overdue: v })}
                label="超過預計收款日仍未收款，升級告警"
              />
            </ConfigGroup>
            <ConfigGroup title="成本沖銷">
              <ConfigCheckbox
                checked={config.auto_settle_cost}
                disabled={!canEdit || isPending}
                onChange={(v) => updateCfg({ auto_settle_cost: v })}
                label="標記「已收款」時，自動沖銷零件暫估成本"
              />
              <ConfigCheckbox
                checked={config.sync_finance_system}
                disabled={!canEdit || isPending}
                onChange={(v) => updateCfg({ sync_finance_system: v })}
                label="同步至財務系統（需財務模組連線）"
              />
            </ConfigGroup>
            <ConfigGroup title="月結報告">
              <ConfigCheckbox
                checked={config.monthly_report_auto}
                disabled={!canEdit || isPending}
                onChange={(v) => updateCfg({ monthly_report_auto: v })}
                label="每月 1 日自動產生費用回收月報"
              />
              <ConfigCheckbox
                checked={config.monthly_report_to_manager}
                disabled={!canEdit || isPending}
                onChange={(v) => updateCfg({ monthly_report_to_manager: v })}
                label="寄送給：服務經理、財務主管"
              />
            </ConfigGroup>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ConfigGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-semibold text-[#9A9890] uppercase tracking-wider">
        {title}
      </div>
      {children}
    </div>
  );
}

function ConfigCheckbox({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] text-[#2C2C2A] leading-snug">
      <input
        type="checkbox"
        disabled={disabled}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-[#0F6E56]"
      />
      {label}
    </label>
  );
}
