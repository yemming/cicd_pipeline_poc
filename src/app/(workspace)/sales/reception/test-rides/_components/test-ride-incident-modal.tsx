"use client";

/**
 * 試乘事故登記 Modal（新增②）
 *
 * 流程：
 *   - 填寫事故描述（必填）、地點（選填）、是否傷亡、損害說明、庫存車 ID
 *   - 提交 → reportTestRideIncidentAction：
 *       1. 寫 test_ride_incidents
 *       2. 凍結關聯庫存車（incident_hold）
 *       3. 通知店長
 *
 * UI 規範：送出時 pending 鎖 + spinner + disabled。
 */

import { useState, useTransition } from "react";
import { reportTestRideIncidentAction } from "@/lib/sales/test-ride-incident-actions";

export function TestRideIncidentModal({
  testDriveId,
  vehicleInventoryId,
  onSuccess,
  onClose,
}: {
  testDriveId: string;
  /** 若已知試駕車對應的 new_car_inventory.id，可預填自動凍結 */
  vehicleInventoryId?: string | null;
  onSuccess: (incidentId: string) => void;
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [injured, setInjured] = useState(false);
  const [damageDescription, setDamageDescription] = useState("");
  const [inventoryId, setInventoryId] = useState(vehicleInventoryId ?? "");
  const [error, setError] = useState<string | null>(null);

  const canSubmit = description.trim().length > 0;

  function submit() {
    if (!canSubmit) return;
    setError(null);
    startTransition(async () => {
      const res = await reportTestRideIncidentAction({
        test_drive_id: testDriveId,
        description: description.trim(),
        location: location.trim() || null,
        injured,
        damage_description: damageDescription.trim() || null,
        vehicle_inventory_id: inventoryId.trim() || null,
      });
      if (res.ok) {
        onSuccess(res.data.incidentId);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-[520px] max-w-[94vw] max-h-[90vh] overflow-y-auto ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center gap-2.5">
          <span className="text-[18px]">🚨</span>
          <div>
            <h2 className="text-[15px] font-semibold text-[#CC0000]">登記試乘事故</h2>
            <p className="text-[11.5px] text-[#9A9890] mt-0.5">
              登記後將凍結相關車輛並通知店長
            </p>
          </div>
        </header>

        <div className="px-5 py-4 space-y-3.5">
          {/* 事故描述（必填） */}
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
              事故描述 <span className="text-[#CC0000]">*</span>
            </label>
            <textarea
              rows={3}
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white outline-none focus:border-[#185FA5] resize-none"
              placeholder="請描述事故經過（碰撞、倒車、擦撞、事故類型…）"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* 事故地點（選填） */}
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
              事故地點（選填）
            </label>
            <input
              type="text"
              className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]"
              placeholder="例：某路某段路口、停車場出口"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* 是否有人員傷亡 */}
          <div className="flex items-center gap-2.5">
            <input
              id="injured-check"
              type="checkbox"
              className="w-4 h-4 accent-[#CC0000] cursor-pointer"
              checked={injured}
              onChange={(e) => setInjured(e.target.checked)}
              disabled={isPending}
            />
            <label
              htmlFor="injured-check"
              className="text-[12.5px] text-[#2C2C2A] cursor-pointer font-medium"
            >
              有人員受傷（需立即聯繫保險公司與緊急處理）
            </label>
          </div>

          {/* 車輛損害描述（選填） */}
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
              車輛損害描述（選填）
            </label>
            <textarea
              rows={2}
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white outline-none focus:border-[#185FA5] resize-none"
              placeholder="例：右側車身擦傷、後照鏡脫落"
              value={damageDescription}
              onChange={(e) => setDamageDescription(e.target.value)}
              disabled={isPending}
            />
          </div>

          {/* 庫存車 ID（若已知，自動凍結） */}
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
              庫存車輛 ID（選填 — 填入後自動凍結為 incident_hold）
            </label>
            <input
              type="text"
              className="w-full h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] font-mono bg-white outline-none focus:border-[#185FA5]"
              placeholder="new_car_inventory.id（UUID）"
              value={inventoryId}
              onChange={(e) => setInventoryId(e.target.value)}
              disabled={isPending}
            />
            <p className="mt-0.5 text-[11px] text-[#9A9890]">
              凍結後該車輛不可再安排試駕或訂單配對，直到解除為止
            </p>
          </div>

          {/* 錯誤訊息 */}
          {error && (
            <div className="rounded-md bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12px] px-3 py-2">
              {error}
            </div>
          )}

          {/* 警告提醒 */}
          <div className="rounded-md bg-[#FDECEA] border border-[#F5AEAD] text-[12px] text-[#CC0000] px-3 py-2.5 leading-relaxed">
            <p className="font-semibold mb-0.5">⚠️ 注意：此動作不可撤銷</p>
            <ul className="list-disc pl-4 space-y-0.5 text-[11.5px]">
              <li>事故記錄建立後將永久保存</li>
              <li>若填入庫存車 ID，車輛狀態將被凍結（需人工解凍）</li>
              <li>系統將立即通知店長</li>
            </ul>
          </div>
        </div>

        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={isPending || !canSubmit}
            className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A80000] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {isPending && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {isPending ? "登記中⋯" : "🚨 確認登記事故"}
          </button>
        </footer>
      </div>
    </div>
  );
}
