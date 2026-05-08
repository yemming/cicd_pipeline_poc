"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setUsedPartItemStatusAction,
  updateUsedPartsConfigAction,
} from "@/lib/parts-setup/used-parts-flow-actions";

export type UsedPartsConfig = {
  brand_id: string;
  trigger_auto_reserve: boolean;
  trigger_scan_inbound: boolean;
  trigger_manual_no_serial: boolean;
  trigger_require_photo: boolean;
  trigger_auto_barcode: boolean;
  inbound_warehouse: string;
  auto_update_claim: boolean;
  auto_link_cost_recovery: boolean;
};

export type UsedPartItem = {
  id: string;
  barcode: string;
  item_name: string;
  item_code: string | null;
  ro_no: string | null;
  inbound_date: string | null;
  damage_level: string;
  damage_label: string | null;
  status: string;
  status_label: string | null;
  sort_order: number;
};

const STATUS_BADGE: Record<string, string> = {
  awaiting: "bg-[#EBF3FF] text-[#1A3A5C]",
  approved: "bg-[#EAF3DE] text-[#3B6D11]",
  shipped: "bg-[#F0F0F0] text-[#444]",
  disposed: "bg-[#F0F0F0] text-[#444]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
};

type Banner = { ok: boolean; msg: string } | null;

export function UsedPartsFlowBoard({
  config,
  items,
  canEdit,
}: {
  config: UsedPartsConfig | null;
  items: UsedPartItem[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const updateCfg = (patch: Record<string, unknown>) => {
    startTransition(async () => {
      const res = await updateUsedPartsConfigAction(patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const setStatus = (id: string, status: string, label: string, ro: string) => {
    startTransition(async () => {
      const res = await setUsedPartItemStatusAction(id, status, label);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${ro} → ${label}` });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  if (!config) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#888]">尚未初始化舊件設定</p>
      </main>
    );
  }

  const triggers: Array<{ key: keyof UsedPartsConfig; label: string }> = [
    { key: "trigger_auto_reserve", label: "RO 工單標記「保固」時，自動建立舊件入庫預約" },
    { key: "trigger_scan_inbound", label: "掃碼確認拆下後，觸發正式入庫" },
    { key: "trigger_manual_no_serial", label: "無序列號舊件允許人工登記（需主管核准）" },
    { key: "trigger_require_photo", label: "入庫時強制拍照（最少 1 張）" },
    { key: "trigger_auto_barcode", label: "自動生成舊件條碼 WR-年份-RO 號-序列" },
  ];

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">舊件出入庫邏輯設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          11.2
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          保固拆件入庫規則、舊件出庫觸發條件、在途狀態追蹤
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
        📦 舊件（拆下的保固零件）的出入庫邏輯需連結 RO 工單並追蹤暫存狀態，直到原廠核准或銷毀。
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${lockedClass}`}>
        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1]">
            <h2 className="font-semibold text-[14px]">⚙️ 舊件入庫邏輯設定</h2>
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            <div className="text-[11px] font-semibold text-[#666] uppercase">觸發條件</div>
            <div className="space-y-1">
              {triggers.map((t) => (
                <label key={t.key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={Boolean(config[t.key])}
                    onChange={(e) => updateCfg({ [t.key]: e.target.checked })}
                  />
                  {t.label}
                </label>
              ))}
            </div>
            <div className="text-[11px] font-semibold text-[#666] uppercase mt-2">
              入庫目標倉庫
            </div>
            <select
              disabled={!canEdit}
              value={config.inbound_warehouse}
              onChange={(e) => updateCfg({ inbound_warehouse: e.target.value })}
              className="h-8 border border-[#DADADA] rounded px-2 text-[12.5px]"
            >
              <option value="warranty_staging">保固暫存倉（預設）</option>
              <option value="store_local">各門店暫存區</option>
            </select>
            <div className="text-[11px] font-semibold text-[#666] uppercase mt-2">
              損壞等級標記（必填）
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2 py-1 rounded border border-[#E1E1E1] text-[12px]">
                🟢 輕微磨損
              </span>
              <span className="px-2 py-1 rounded border border-[#854F0B] bg-[#FDF3E3] text-[#854F0B] text-[12px]">
                🟡 明顯損壞
              </span>
              <span className="px-2 py-1 rounded border border-[#CC0000] bg-[#FDECEA] text-[#CC0000] text-[12px]">
                🔴 嚴重毀損
              </span>
            </div>
          </div>
        </section>

        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1]">
            <h2 className="font-semibold text-[14px]">📤 舊件出庫邏輯設定</h2>
          </header>
          <div className="p-4 space-y-3 text-[12.5px]">
            <div className="text-[11px] font-semibold text-[#666] uppercase">
              出庫觸發條件（三選一）
            </div>
            <div className="space-y-1">
              <div className="px-3 py-2 rounded border border-[#E1E1E1] flex items-center justify-between">
                <span>🚚 寄回原廠：原廠核准後，產生出庫單＋物流標籤</span>
                <span className="px-2 py-0.5 rounded bg-[#EBF3FF] text-[#1A3A5C] text-[11px]">
                  主要
                </span>
              </div>
              <div className="px-3 py-2 rounded border border-[#E1E1E1] flex items-center justify-between">
                <span>🗑 就地銷毀：原廠指示銷毀，上傳銷毀證明後出庫</span>
                <span className="px-2 py-0.5 rounded bg-[#F0F0F0] text-[#444] text-[11px]">
                  次要
                </span>
              </div>
              <div className="px-3 py-2 rounded border border-[#E1E1E1] flex items-center justify-between">
                <span>❌ 索賠拒絕：原廠拒絕，轉入廢品倉或退還客戶</span>
                <span className="px-2 py-0.5 rounded bg-[#FDECEA] text-[#CC0000] text-[11px]">
                  例外
                </span>
              </div>
            </div>
            <div className="text-[11px] font-semibold text-[#666] uppercase mt-2">
              自動化設定
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={config.auto_update_claim}
                onChange={(e) => updateCfg({ auto_update_claim: e.target.checked })}
              />
              出庫後自動更新索賠單狀態為「舊件已處置」
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={config.auto_link_cost_recovery}
                onChange={(e) =>
                  updateCfg({ auto_link_cost_recovery: e.target.checked })
                }
              />
              連動費用回收：出庫後進入「待收款」狀態
            </label>
          </div>
        </section>
      </div>

      <section className={`rounded-md border border-[#E1E1E1] bg-white ${lockedClass}`}>
        <header className="px-4 py-3 border-b border-[#E1E1E1]">
          <h2 className="font-semibold text-[14px]">📋 舊件在途狀態查詢</h2>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">舊件條碼</th>
                <th className="px-3 py-2 text-left">品名/料號</th>
                <th className="px-3 py-2 text-left">RO 工單</th>
                <th className="px-3 py-2 text-left">入庫日</th>
                <th className="px-3 py-2 text-left">損壞等級</th>
                <th className="px-3 py-2 text-left">目前狀態</th>
                <th className="px-3 py-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td className="px-3 py-2 font-mono">{it.barcode}</td>
                  <td className="px-3 py-2">
                    <div>{it.item_name}</div>
                    <div className="text-[11px] text-[#888]">{it.item_code ?? ""}</div>
                  </td>
                  <td className="px-3 py-2 font-mono">{it.ro_no ?? "—"}</td>
                  <td className="px-3 py-2">{it.inbound_date ?? "—"}</td>
                  <td className="px-3 py-2">{it.damage_label ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        STATUS_BADGE[it.status] ?? STATUS_BADGE.awaiting
                      }`}
                    >
                      {it.status_label ?? it.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 space-x-1">
                    {it.status === "awaiting" ? (
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          setStatus(it.id, "approved", "核准-待寄回", it.barcode)
                        }
                        className="px-2 py-1 text-[11.5px] rounded bg-[#0F6E56] text-white disabled:opacity-50"
                      >
                        核准
                      </button>
                    ) : it.status === "approved" ? (
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() =>
                          setStatus(it.id, "shipped", "已寄出", it.barcode)
                        }
                        className="px-2 py-1 text-[11.5px] rounded bg-[#1A3A5C] text-white disabled:opacity-50"
                      >
                        寄出
                      </button>
                    ) : (
                      <span className="text-[11px] text-[#888]">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[#888]">
                    尚無在途舊件
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
