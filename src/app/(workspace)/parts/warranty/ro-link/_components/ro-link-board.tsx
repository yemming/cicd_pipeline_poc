"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  updateRoLinkConfigAction,
  verifyRoLinkRecordAction,
  type RoLinkConfigPatch,
} from "@/lib/parts-setup/warranty-ro-link-actions";

export type RoLinkConfig = {
  brand_id: string;
  dms_label: string | null;
  dms_endpoint: string | null;
  dms_connected: boolean;
  sync_ro_to_issue: boolean;
  sync_vin_check: boolean;
  sync_warranty_label: boolean;
  sync_technician: boolean;
  sync_estimate: boolean;
  sync_frequency: string;
  fallback_action: string;
  expiry_alert_days: number;
};

export type RoLinkRecord = {
  id: string;
  ro_no: string;
  vin: string | null;
  model: string | null;
  warranty_type: string | null;
  sync_status: string;
  sync_status_label: string | null;
  out_no: string | null;
  claim_no: string | null;
  sort_order: number;
};

const STATUS_BADGE: Record<string, string> = {
  done: "bg-[#EAF3DE] text-[#3B6D11]",
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  customer: "bg-[#F0F0F0] text-[#444]",
};

type Banner = { ok: boolean; msg: string } | null;

export function RoLinkBoard({
  config,
  records,
  canEdit,
}: {
  config: RoLinkConfig | null;
  records: RoLinkRecord[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const updateCfg = (patch: RoLinkConfigPatch) => {
    startTransition(async () => {
      const res = await updateRoLinkConfigAction(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const verify = (id: string, ro: string) => {
    startTransition(async () => {
      const res = await verifyRoLinkRecordAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${ro} 已驗證並同步` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  if (!config) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#888]">尚未初始化串接設定</p>
      </main>
    );
  }

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">與 RO 工單串接設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          11.5
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          DMS 串接、保固自動判斷規則、同步記錄查詢
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

      <div className="px-3 py-2 rounded bg-[#EBF3FF] border border-[#B5D4F4] text-[12px] text-[#1A3A5C]">
        🔗 RO 工單（Repair Order）與庫存系統的串接設定，確保保固零件出入庫與維修工單自動同步。
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${lockedClass}`}>
        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1]">
            <h2 className="font-semibold text-[14px]">🔌 串接系統設定</h2>
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            <div className="px-3 py-2 rounded bg-[#EAF3DE] border border-[#B5D4B0] flex items-center justify-between">
              <div>
                <div className="text-[12px] font-semibold text-[#3B6D11]">
                  {`✅ ${config.dms_label ?? "DMS"} 已連線`}
                </div>
                <div className="text-[11px] text-[#666] mt-0.5">
                  {`API 端點：${config.dms_endpoint ?? "—"}`}
                </div>
              </div>
            </div>

            <div className="text-[11px] font-semibold text-[#666] uppercase">
              同步欄位設定
            </div>
            <div className="space-y-1">
              {[
                { key: "sync_ro_to_issue", label: "RO 工單號 → 庫存出庫單號自動帶入" },
                { key: "sync_vin_check", label: "車輛序列號（VIN）→ 自動比對保固資格" },
                { key: "sync_warranty_label", label: "保固類型 → 自動標記索賠類別" },
                { key: "sync_technician", label: "技師 ID → 自動記錄負責人" },
                { key: "sync_estimate", label: "估價明細 → 同步至費用回收模組" },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 text-[12.5px]">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={Boolean(config[key as keyof RoLinkConfig] as boolean)}
                    onChange={(e) =>
                      updateCfg({ [key]: e.target.checked } as RoLinkConfigPatch)
                    }
                  />
                  {label}
                </label>
              ))}
            </div>

            <div className="text-[11px] font-semibold text-[#666] uppercase mt-2">
              同步頻率
            </div>
            <select
              disabled={!canEdit}
              value={config.sync_frequency}
              onChange={(e) => updateCfg({ sync_frequency: e.target.value })}
              className="h-8 border border-[#DADADA] rounded px-2 text-[12.5px]"
            >
              <option value="realtime">即時同步（Webhook 推送）</option>
              <option value="poll5">每 5 分鐘輪詢</option>
              <option value="poll60">每小時同步</option>
            </select>
          </div>
        </section>

        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1]">
            <h2 className="font-semibold text-[14px]">⚙️ 保固觸發規則</h2>
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            <div className="text-[11px] font-semibold text-[#666] uppercase">
              自動保固判斷
            </div>
            {[
              { t: "條件 1：VIN 保固有效", d: "車輛出廠日 + 2 年 ≤ 今日，且里程 ≤ 20,000 km" },
              { t: "條件 2：零件屬保固範圍", d: "料號在原廠保固零件清單內（自動對照）" },
              { t: "條件 3：非人為損壞", d: "技師需勾選「非人為/改裝造成」，方可啟動保固" },
            ].map((c) => (
              <div
                key={c.t}
                className="px-3 py-2 rounded bg-[#F8F8F8] border border-[#E1E1E1]"
              >
                <div className="font-semibold mb-1">{c.t}</div>
                <div className="text-[#666]">{c.d}</div>
              </div>
            ))}

            <div className="text-[11px] font-semibold text-[#666] uppercase mt-2">
              不符合保固時的處理
            </div>
            <select
              disabled={!canEdit}
              value={config.fallback_action}
              onChange={(e) => updateCfg({ fallback_action: e.target.value })}
              className="h-8 border border-[#DADADA] rounded px-2 text-[12.5px]"
            >
              <option value="customer_pay">改走一般維修出庫（客付）</option>
              <option value="prompt_tech">提示技師確認並手動選擇</option>
            </select>

            <div className="text-[11px] font-semibold text-[#666] uppercase mt-2">
              保固到期告警（提前天數）
            </div>
            <div className="flex items-center gap-2">
              <span>保固到期前</span>
              <input
                type="number"
                min={0}
                disabled={!canEdit}
                value={config.expiry_alert_days}
                onChange={(e) =>
                  updateCfg({ expiry_alert_days: Number(e.target.value) })
                }
                className="w-16 h-7 border border-[#DADADA] rounded px-2 text-center"
              />
              <span>天，通知服務顧問</span>
            </div>
          </div>
        </section>
      </div>

      <section className={`rounded-md border border-[#E1E1E1] bg-white ${lockedClass}`}>
        <header className="px-4 py-3 border-b border-[#E1E1E1] flex items-center gap-2">
          <h2 className="font-semibold text-[14px]">📋 近期 RO 工單-保固串接記錄</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">RO 工單號</th>
                <th className="px-3 py-2 text-left">VIN/車型</th>
                <th className="px-3 py-2 text-left">保固類型</th>
                <th className="px-3 py-2 text-left">串接狀態</th>
                <th className="px-3 py-2 text-left">出庫單</th>
                <th className="px-3 py-2 text-left">索賠單</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono">{r.ro_no}</td>
                  <td className="px-3 py-2">
                    <div className="font-mono">{r.vin ?? "—"}</div>
                    <div className="text-[11px] text-[#888]">{r.model ?? ""}</div>
                  </td>
                  <td className="px-3 py-2">{r.warranty_type ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        STATUS_BADGE[r.sync_status] ?? STATUS_BADGE.pending
                      }`}
                    >
                      {r.sync_status_label ?? r.sync_status}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{r.out_no ?? "—"}</td>
                  <td className="px-3 py-2 font-mono">{r.claim_no ?? "—"}</td>
                  <td className="px-3 py-2">
                    {r.sync_status === "pending" ? (
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => verify(r.id, r.ro_no)}
                        className="px-2 py-1 text-[11.5px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
                      >
                        手動驗證
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#888]">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {records.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[#888]">
                    尚無串接記錄
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
