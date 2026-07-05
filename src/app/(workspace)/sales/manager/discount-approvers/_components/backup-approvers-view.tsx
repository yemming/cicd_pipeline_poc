"use client";

/**
 * /sales/manager/discount-approvers — RS_M3 代理審核人設定
 *
 * 折扣審核逾時後，系統自動升級到「代理審核人」。
 * 此頁面讓 sales manager 設定：「主管 X 不在時，誰代為審核折扣」。
 *
 * 資料表：discount_approval_backups
 * 邏輯：每個主管（manager_id）設一個代理（backup_approver_id），多餘的舊設定自動停用。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import {
  upsertBackupApproverAction,
  removeBackupApproverAction,
  updateDiscountAuthoritySettingsAction,
} from "@/lib/sales/discount-approval-actions";
import type { DiscountApprovalBackupRow } from "@/domain/discount-approvals.constants";
import type { DiscountAuthoritySettings } from "@/domain/discount-approvals";

type Banner = { ok: boolean; msg: string } | null;

/** 員工清單選項（從 server 傳下來） */
export type EmployeeOption = {
  user_id: string;
  name: string;
  position: string | null;
};

export type BackupApproversViewProps = {
  backups: DiscountApprovalBackupRow[];
  employees: EmployeeOption[];
  canEdit: boolean;
  discountSettings: DiscountAuthoritySettings;
};

const inputCls =
  "h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none bg-white w-full";

export function BackupApproversView({
  backups,
  employees,
  canEdit,
  discountSettings,
}: BackupApproversViewProps) {
  useSetPageHeader({
    breadcrumb: [
      { label: "主管工作台", href: "/sales/manager" },
      { label: "折扣設定" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // 折扣門檻設定 state
  const [isSavingThresholds, startThresholdTransition] = useTransition();
  const [thresholds, setThresholds] = useState({
    sales_consultant_max_pct: String(discountSettings.sales_consultant_max_pct ?? ""),
    rs_manager_max_pct: String(discountSettings.rs_manager_max_pct ?? ""),
    counter_offer_timeout_hours: String(discountSettings.counter_offer_timeout_hours),
  });

  const handleSaveThresholds = () => {
    const scPct = Number(thresholds.sales_consultant_max_pct);
    const rmPct = Number(thresholds.rs_manager_max_pct);
    const hours = Number(thresholds.counter_offer_timeout_hours);
    if (!thresholds.sales_consultant_max_pct.trim() || Number.isNaN(scPct)) {
      showBanner({ ok: false, msg: "請輸入有效的業務員折扣授權上限" });
      return;
    }
    if (!thresholds.rs_manager_max_pct.trim() || Number.isNaN(rmPct)) {
      showBanner({ ok: false, msg: "請輸入有效的店長折扣授權上限" });
      return;
    }
    if (!thresholds.counter_offer_timeout_hours.trim() || Number.isNaN(hours)) {
      showBanner({ ok: false, msg: "請輸入有效的反價等待逾時小時數" });
      return;
    }
    startThresholdTransition(async () => {
      const res = await updateDiscountAuthoritySettingsAction({
        sales_consultant_max_pct: scPct,
        rs_manager_max_pct: rmPct,
        counter_offer_timeout_hours: hours,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存折扣門檻設定" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // 新增表單 state
  const [form, setForm] = useState<{ manager_id: string; backup_approver_id: string }>({
    manager_id: "",
    backup_approver_id: "",
  });

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const handleAdd = () => {
    if (!form.manager_id || !form.backup_approver_id) {
      showBanner({ ok: false, msg: "請選擇主管與代理審核人" });
      return;
    }
    if (form.manager_id === form.backup_approver_id) {
      showBanner({ ok: false, msg: "主管與代理審核人不可為同一人" });
      return;
    }
    startTransition(async () => {
      const res = await upsertBackupApproverAction({
        manager_id: form.manager_id,
        backup_approver_id: form.backup_approver_id,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存代理審核人設定" });
        setForm({ manager_id: "", backup_approver_id: "" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleRemove = (id: string, managerName: string | null) => {
    if (!confirm(`確定移除 ${managerName ?? "此主管"} 的代理審核設定？`)) return;
    startTransition(async () => {
      const res = await removeBackupApproverAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已移除代理設定" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const empName = (userId: string) =>
    employees.find((e) => e.user_id === userId)?.name ?? userId.slice(0, 8);

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <div className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">折扣設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_M3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          折扣授權門檻 · 審核逾時規則 · 代理審核人
        </span>
        {!canEdit && (
          <span className="ml-auto px-2 py-0.5 text-[11px] rounded-md bg-[#F2F2F2] text-[#6B6A68]">
            唯讀視角
          </span>
        )}
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

      {/* 折扣門檻設定（RS04 第五件） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 折扣門檻設定</span>
        </header>
        <div className="px-4 py-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">業務員折扣授權上限 %</label>
              {canEdit ? (
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputCls}
                  value={thresholds.sales_consultant_max_pct}
                  disabled={isSavingThresholds}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, sales_consultant_max_pct: e.target.value })
                  }
                  placeholder="例：3"
                />
              ) : (
                <div className="h-[30px] flex items-center text-[12.5px] text-[#2C2C2A]">
                  {discountSettings.sales_consultant_max_pct ?? "—"}%
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">店長折扣授權上限 %</label>
              {canEdit ? (
                <input
                  type="text"
                  inputMode="decimal"
                  className={inputCls}
                  value={thresholds.rs_manager_max_pct}
                  disabled={isSavingThresholds}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, rs_manager_max_pct: e.target.value })
                  }
                  placeholder="例：10"
                />
              ) : (
                <div className="h-[30px] flex items-center text-[12.5px] text-[#2C2C2A]">
                  {discountSettings.rs_manager_max_pct ?? "—"}%
                </div>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">反價等待逾時 小時</label>
              {canEdit ? (
                <input
                  type="text"
                  inputMode="numeric"
                  className={inputCls}
                  value={thresholds.counter_offer_timeout_hours}
                  disabled={isSavingThresholds}
                  onChange={(e) =>
                    setThresholds({ ...thresholds, counter_offer_timeout_hours: e.target.value })
                  }
                  placeholder="例：24"
                />
              ) : (
                <div className="h-[30px] flex items-center text-[12.5px] text-[#2C2C2A]">
                  {discountSettings.counter_offer_timeout_hours} 小時
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-[#F8F7F4]">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">
                折扣審核逾時（在場）— 沿用現有機制
              </label>
              <div className="h-[30px] flex items-center text-[12.5px] text-[#5A5955]">
                {discountSettings.in_store_timeout_minutes} 分鐘
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">
                折扣審核逾時（不在場）— 沿用現有機制
              </label>
              <div className="h-[30px] flex items-center text-[12.5px] text-[#5A5955]">
                {discountSettings.normal_timeout_minutes} 分鐘
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="flex justify-end pt-1">
              <button
                onClick={handleSaveThresholds}
                disabled={isSavingThresholds}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              >
                {isSavingThresholds ? "儲存中⋯" : "儲存門檻設定"}
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 說明區 */}
      <section className="bg-[#EAF4FB] border border-[#B3D4EF] rounded-lg px-4 py-3 text-[12.5px] text-[#185FA5]">
        <div className="font-semibold mb-1">運作邏輯</div>
        <ul className="list-disc list-inside space-y-0.5 text-[12px]">
          <li>客戶在場申請：主管 <b>10 分鐘</b>內未回應 → 自動升級至代理審核人</li>
          <li>一般申請：主管 <b>30 分鐘</b>內未回應 → 自動升級至代理審核人</li>
          <li>每位主管只能設定一位代理（後設的會覆蓋前設的）</li>
          <li>代理審核人可用 LINE 或直接開啟佇列頁審核</li>
        </ul>
      </section>

      {/* 新增設定表單 */}
      {canEdit && (
        <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[13px] font-semibold text-[#2C2C2A] mb-3">新增 / 更新代理設定</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">主管（審核人）</label>
              <select
                className={inputCls}
                value={form.manager_id}
                onChange={(e) => setForm({ ...form, manager_id: e.target.value })}
              >
                <option value="">— 選擇主管 —</option>
                {employees.map((e) => (
                  <option key={e.user_id} value={e.user_id}>
                    {e.name}
                    {e.position ? ` (${e.position})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-[#9A9890] font-medium">代理審核人（逾時後接手）</label>
              <select
                className={inputCls}
                value={form.backup_approver_id}
                onChange={(e) => setForm({ ...form, backup_approver_id: e.target.value })}
              >
                <option value="">— 選擇代理人 —</option>
                {employees
                  .filter((e) => e.user_id !== form.manager_id)
                  .map((e) => (
                    <option key={e.user_id} value={e.user_id}>
                      {e.name}
                      {e.position ? ` (${e.position})` : ""}
                    </option>
                  ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleAdd}
              disabled={isPending || !form.manager_id || !form.backup_approver_id}
              className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              {isPending ? "儲存中⋯" : "儲存設定"}
            </button>
          </div>
        </section>
      )}

      {/* 目前設定列表 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 目前設定（{backups.length} 筆）
          </span>
        </header>
        {backups.length === 0 ? (
          <div className="px-4 py-6 text-[12px] text-[#9A9890] text-center">
            尚未設定代理審核人
          </div>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-[#F8F7F4]">
              <tr>
                <th className="text-left px-4 py-2.5 text-[11px] text-[#9A9890] font-medium">
                  主管（審核人）
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] text-[#9A9890] font-medium">
                  逾時代理
                </th>
                <th className="text-left px-4 py-2.5 text-[11px] text-[#9A9890] font-medium">
                  設定時間
                </th>
                {canEdit && (
                  <th className="text-right px-4 py-2.5 text-[11px] text-[#9A9890] font-medium">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {backups.map((b) => (
                <tr key={b.id} className="border-t border-[#F8F7F4] hover:bg-[#FAFAF8]">
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-[#2C2C2A]">
                      {b.manager_name ?? empName(b.manager_id)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-[#185FA5] font-medium">
                      {b.backup_name ?? empName(b.backup_approver_id)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-[11.5px] text-[#9A9890]">
                      {new Date(b.created_at).toLocaleDateString("zh-TW")}
                    </span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => handleRemove(b.id, b.manager_name ?? null)}
                        disabled={isPending}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                      >
                        移除
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
