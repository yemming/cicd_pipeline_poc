"use client";

/**
 * PendingItemsSidebar — 待處理項目常駐側欄
 *
 * 顯示當前車輛的所有待處理項目（緊急/警示/建議分色），
 * 並支援 SA 手動新增（呼叫已有的 addVehiclePendingItemAction）。
 *
 * 在 PreInspectionWizard 詳情頁右側常駐，wizard 操作全程可見。
 */

import { useState, useTransition } from "react";
import { addVehiclePendingItemAction } from "@/lib/aftersales/vehicle-pending-actions";
import type { VehiclePendingItem } from "@/domain/service-quotes";

type SafetyLevel = "緊急" | "警示" | "建議";

const SAFETY_COLOR: Record<SafetyLevel, string> = {
  緊急: "bg-[#FDECEA] border-[#F5AEAD] text-[#CC0000]",
  警示: "bg-[#FDF3E3] border-[#E8C682] text-[#854F0B]",
  建議: "bg-[#EAF4FB] border-[#A8CEE9] text-[#185FA5]",
};

const SAFETY_DOT: Record<SafetyLevel, string> = {
  緊急: "bg-[#CC0000]",
  警示: "bg-[#854F0B]",
  建議: "bg-[#185FA5]",
};

type Props = {
  vehicleId: string;
  pendingItems: VehiclePendingItem[];
  locked?: boolean;
};

export function PendingItemsSidebar({ vehicleId, pendingItems, locked }: Props) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [desc, setDesc] = useState("");
  const [safetyLevel, setSafetyLevel] = useState<SafetyLevel>("建議");
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // 按安全等級分群
  const urgent = pendingItems.filter((p) => p.safetyLevel === "緊急");
  const warning = pendingItems.filter((p) => p.safetyLevel === "警示");
  const advice = pendingItems.filter((p) => p.safetyLevel === "建議");

  function handleAdd() {
    if (!desc.trim()) {
      setBanner({ ok: false, msg: "請填寫項目說明" });
      return;
    }
    startTransition(async () => {
      const res = await addVehiclePendingItemAction({
        vehicle_id: vehicleId,
        item_desc: desc.trim(),
        safety_level: safetyLevel,
        reason: reason.trim() || null,
      });
      if (res.ok) {
        setBanner({ ok: true, msg: "✓ 已新增待處理項目" });
        setDesc("");
        setReason("");
        setSafetyLevel("建議");
        setShowAddForm(false);
        setTimeout(() => setBanner(null), 2200);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  function renderItems(items: VehiclePendingItem[], level: SafetyLevel) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${SAFETY_DOT[level]}`} />
          <span className="text-[11px] font-semibold text-[#2C2C2A]">{level}</span>
          <span className="text-[10.5px] text-[#9A9890]">（{items.length}）</span>
        </div>
        {items.map((p) => (
          <div
            key={p.id}
            className={`px-2.5 py-2 border rounded text-[11.5px] ${SAFETY_COLOR[level]}`}
          >
            <div className="font-medium leading-snug">{p.itemDesc}</div>
            {p.reason && (
              <div className="mt-0.5 text-[11px] opacity-75">{p.reason}</div>
            )}
            {p.rejectCount > 0 && (
              <div className="mt-0.5 text-[10.5px] opacity-75">
                已拒絕 {p.rejectCount} 次
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <aside className="w-[260px] shrink-0 flex flex-col gap-2">
      {/* 側欄標題 */}
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-3 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[12.5px] font-semibold text-[#2C2C2A]">待處理項目</span>
          <span className="text-[10.5px] text-[#9A9890]">{pendingItems.length} 筆</span>
        </header>

        <div className="px-3 py-2.5 space-y-3 max-h-[calc(100vh-320px)] overflow-y-auto">
          {pendingItems.length === 0 ? (
            <p className="text-[11.5px] text-[#9A9890] text-center py-2">此車無待處理項目</p>
          ) : (
            <>
              {renderItems(urgent, "緊急")}
              {renderItems(warning, "警示")}
              {renderItems(advice, "建議")}
            </>
          )}
        </div>

        {/* 手動新增按鈕 */}
        {!locked && (
          <div className="px-3 py-2.5 border-t border-[#EEECE6]">
            {!showAddForm ? (
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="w-full h-[28px] rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                + 新增至待處理清單
              </button>
            ) : (
              <div
                className={`space-y-2 ${isPending ? "opacity-60 pointer-events-none" : ""}`}
              >
                <input
                  value={desc}
                  onChange={(e) => setDesc(e.target.value)}
                  placeholder="項目說明"
                  className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none"
                />
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="原因（選填）"
                  className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] focus:border-[#185FA5] outline-none"
                />
                <select
                  value={safetyLevel}
                  onChange={(e) => setSafetyLevel(e.target.value as SafetyLevel)}
                  className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] bg-white"
                >
                  <option value="緊急">🔴 緊急</option>
                  <option value="警示">🟡 警示</option>
                  <option value="建議">🔵 建議</option>
                </select>

                {banner && (
                  <div
                    className={`px-2 py-1 rounded text-[11px] ${
                      banner.ok
                        ? "bg-[#EAF3DE] text-[#3B6D11]"
                        : "bg-[#FDECEA] text-[#CC0000]"
                    }`}
                  >
                    {banner.msg}
                  </div>
                )}

                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddForm(false);
                      setDesc("");
                      setReason("");
                      setBanner(null);
                    }}
                    className="flex-1 h-[28px] rounded text-[11.5px] border border-[#D5D3CB] text-[#5A5955] bg-white hover:border-[#9A9890]"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleAdd}
                    disabled={isPending}
                    className="flex-1 h-[28px] rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    {isPending ? "新增中⋯" : "確認新增"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
