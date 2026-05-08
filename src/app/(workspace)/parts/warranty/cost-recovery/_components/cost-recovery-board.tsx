"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  markClaimPaidAction,
  updateCostRecoveryConfigAction,
} from "@/lib/parts-setup/cost-recovery-actions";

export type CRConfig = {
  brand_id: string;
  remind_7_days_before: boolean;
  alert_on_overdue: boolean;
  auto_settle_cost: boolean;
  sync_finance_system: boolean;
  monthly_report_auto: boolean;
  monthly_report_to_manager: boolean;
};

export type Claim = {
  id: string;
  claim_no: string;
  ro_no: string | null;
  item_label: string;
  hours_label: string | null;
  warranty_type: string | null;
  apply_amount: number;
  approved_amount: number;
  status: string;
  status_label: string | null;
  expected_pay_date: string | null;
  sort_order: number;
};

const STATUS_BADGE: Record<string, string> = {
  reviewing: "bg-[#FDF3E3] text-[#854F0B]",
  approved: "bg-[#EBF3FF] text-[#1A3A5C]",
  paid: "bg-[#EAF3DE] text-[#3B6D11]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
};

const TWD = (n: number) => `NT$${n.toLocaleString("en-US")}`;

type Banner = { ok: boolean; msg: string } | null;

export function CostRecoveryBoard({
  config,
  claims,
  canEdit,
}: {
  config: CRConfig | null;
  claims: Claim[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const stats = useMemo(() => {
    const pending = claims
      .filter((c) => c.status === "approved")
      .reduce((s, c) => s + c.approved_amount, 0);
    const paid = claims
      .filter((c) => c.status === "paid")
      .reduce((s, c) => s + c.approved_amount, 0);
    const reviewing = claims
      .filter((c) => c.status === "reviewing")
      .reduce((s, c) => s + c.apply_amount, 0);
    const rejected = claims
      .filter((c) => c.status === "rejected")
      .reduce((s, c) => s + c.apply_amount, 0);
    return { pending, paid, reviewing, rejected };
  }, [claims]);

  const filtered = useMemo(() => {
    if (statusFilter === "all") return claims;
    return claims.filter((c) => c.status === statusFilter);
  }, [claims, statusFilter]);

  const total = filtered.reduce(
    (s, c) => s + (c.status === "rejected" ? c.apply_amount : c.approved_amount),
    0,
  );

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const updateCfg = (patch: Record<string, unknown>) => {
    startTransition(async () => {
      const res = await updateCostRecoveryConfigAction(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const markPaid = (id: string, no: string) => {
    startTransition(async () => {
      const res = await markClaimPaidAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${no} 已標記為已收款` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">索賠費用回收追蹤</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          11.6
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          費用回收狀態追蹤、收款提醒、自動成本沖銷
        </span>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "本月待收款", value: stats.pending, color: "text-[#1A3A5C]", sub: "approved" },
          { label: "本月已收款", value: stats.paid, color: "text-[#3B6D11]", sub: "paid" },
          { label: "審核中金額", value: stats.reviewing, color: "text-[#854F0B]", sub: "reviewing" },
          { label: "本月拒絕金額", value: stats.rejected, color: "text-[#CC0000]", sub: "rejected" },
        ].map((s) => (
          <div
            key={s.label}
            className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3"
          >
            <div className="text-[11px] text-[#888]">{s.label}</div>
            <div className={`text-[20px] font-bold mt-1 ${s.color}`}>
              {TWD(s.value)}
            </div>
            <div className="text-[11px] text-[#888]">{`${
              claims.filter((c) => c.status === s.sub).length
            } 件`}</div>
          </div>
        ))}
      </div>

      <div className="bg-white border border-[#E1E1E1] rounded-md p-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px]">
          <span className="text-[#666]">狀態</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-7 border border-[#DADADA] rounded px-2 text-[12px]"
          >
            <option value="all">全部狀態</option>
            <option value="reviewing">審核中</option>
            <option value="approved">核准-待收款</option>
            <option value="paid">已收款</option>
            <option value="rejected">已拒絕</option>
          </select>
        </label>
      </div>

      <section className={`rounded-md border border-[#E1E1E1] bg-white ${lockedClass}`}>
        <header className="px-4 py-3 border-b border-[#E1E1E1] flex items-center gap-2 text-[13px]">
          <span className="font-semibold">💰 索賠費用回收明細</span>
          <span className="ml-auto text-[#666]">
            共 <b>{filtered.length}</b> 筆 · 合計 <b>{TWD(total)}</b>
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">索賠單號</th>
                <th className="px-3 py-2 text-left">RO 工單</th>
                <th className="px-3 py-2 text-left">品名</th>
                <th className="px-3 py-2 text-left">類型</th>
                <th className="px-3 py-2 text-right">申請金額</th>
                <th className="px-3 py-2 text-right">核准金額</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-left">預計收款日</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="px-3 py-2 font-mono">{c.claim_no}</td>
                  <td className="px-3 py-2 font-mono">{c.ro_no ?? "—"}</td>
                  <td className="px-3 py-2">
                    <div>{c.item_label}</div>
                    <div className="text-[11px] text-[#888]">{c.hours_label ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">{c.warranty_type ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {c.apply_amount.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {c.approved_amount.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        STATUS_BADGE[c.status] ?? STATUS_BADGE.reviewing
                      }`}
                    >
                      {c.status_label ?? c.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{c.expected_pay_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    {c.status === "approved" ? (
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => markPaid(c.id, c.claim_no)}
                        className="px-2 py-1 text-[11.5px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
                      >
                        標記已收款
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#888]">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[#888]">
                    無索賠記錄
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {config ? (
        <section className={`rounded-md border border-[#E1E1E1] bg-white ${lockedClass}`}>
          <header className="px-4 py-3 border-b border-[#E1E1E1]">
            <h2 className="font-semibold text-[14px]">⚙️ 費用回收自動化設定</h2>
          </header>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-[12.5px]">
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-[#666] uppercase">收款提醒</div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={config.remind_7_days_before}
                  onChange={(e) => updateCfg({ remind_7_days_before: e.target.checked })}
                />
                預計收款日前 7 天發送提醒
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={config.alert_on_overdue}
                  onChange={(e) => updateCfg({ alert_on_overdue: e.target.checked })}
                />
                超過預計收款日仍未收款，升級告警
              </label>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-[#666] uppercase">成本沖銷</div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={config.auto_settle_cost}
                  onChange={(e) => updateCfg({ auto_settle_cost: e.target.checked })}
                />
                標記「已收款」時，自動沖銷零件暫估成本
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={config.sync_finance_system}
                  onChange={(e) => updateCfg({ sync_finance_system: e.target.checked })}
                />
                同步至財務系統（需財務模組連線）
              </label>
            </div>
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-[#666] uppercase">月結報告</div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={config.monthly_report_auto}
                  onChange={(e) => updateCfg({ monthly_report_auto: e.target.checked })}
                />
                每月 1 日自動產生費用回收月報
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={config.monthly_report_to_manager}
                  onChange={(e) =>
                    updateCfg({ monthly_report_to_manager: e.target.checked })
                  }
                />
                寄送給：服務經理、財務主管
              </label>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
