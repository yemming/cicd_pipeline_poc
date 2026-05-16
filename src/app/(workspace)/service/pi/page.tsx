"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { SignatureCanvas } from "@/components/signature-canvas";
import {
  useServiceDemo,
  SAFETY_LABEL,
  SAFETY_COLOR,
  CATEGORY_LABEL,
} from "@/lib/service-demo/context";

// ── 環車檢查項目清單 ──────────────────────────────────────
const EXTERIOR_ITEMS = [
  { id: "body", label: "車身外觀（刮傷/凹痕）" },
  { id: "lights", label: "前後燈光功能" },
  { id: "mirrors", label: "後照鏡" },
  { id: "front_tire", label: "前輪胎（胎紋/胎壁/氣壓）" },
  { id: "rear_tire", label: "後輪胎（胎紋/胎壁/氣壓）" },
  { id: "front_brake", label: "前煞車來令片" },
  { id: "rear_brake", label: "後煞車來令片" },
  { id: "chain", label: "鏈條（鬆緊/潤滑）" },
];

type ExteriorStatus = "ok" | "caution" | "damage";

const EXTERIOR_BTNS: { value: ExteriorStatus; label: string; icon: string; style: string; active: string }[] = [
  {
    value: "ok",
    label: "正常",
    icon: "check",
    style: "border-neutral-200 text-neutral-500 hover:border-green-400 hover:text-green-700",
    active: "border-green-500 bg-green-50 text-green-700 font-semibold",
  },
  {
    value: "caution",
    label: "注意",
    icon: "warning",
    style: "border-neutral-200 text-neutral-500 hover:border-amber-400 hover:text-amber-700",
    active: "border-amber-500 bg-amber-50 text-amber-700 font-semibold",
  },
  {
    value: "damage",
    label: "損傷",
    icon: "close",
    style: "border-neutral-200 text-neutral-500 hover:border-red-400 hover:text-red-700",
    active: "border-red-500 bg-red-50 text-red-700 font-semibold",
  },
];

// ── 來意詢問用途清單 ──────────────────────────────────────
const PURPOSE_OPTIONS = [
  "定期保養",
  "里程保養",
  "Desmo保養",
  "故障維修",
  "改裝安裝",
  "疑似保固",
  "公報召回",
  "其他",
];

// ── SA 詢問三態 ───────────────────────────────────────────
type SAAnswer = "yes" | "no" | "na";

const SA_ANSWER_BTNS: { value: SAAnswer; label: string; style: string; active: string }[] = [
  {
    value: "yes",
    label: "是 ✓",
    style: "border-neutral-200 text-neutral-500 hover:border-green-400",
    active: "border-green-500 bg-green-50 text-green-700 font-semibold",
  },
  {
    value: "no",
    label: "否 ✗",
    style: "border-neutral-200 text-neutral-500 hover:border-red-400",
    active: "border-red-500 bg-red-50 text-red-700 font-semibold",
  },
  {
    value: "na",
    label: "略 —",
    style: "border-neutral-200 text-neutral-500 hover:border-neutral-400",
    active: "border-neutral-400 bg-neutral-100 text-neutral-600 font-semibold",
  },
];

// ── 技師決策三態 ──────────────────────────────────────────
const TECH_DECISION_BTNS = [
  {
    value: "agreed" as const,
    label: "同意 ✓",
    active: "border-green-500 bg-green-50 text-green-700 font-semibold",
    hover: "hover:border-green-400",
  },
  {
    value: "deferred" as const,
    label: "暫緩 ⏸",
    active: "border-amber-500 bg-amber-50 text-amber-700 font-semibold",
    hover: "hover:border-amber-400",
  },
  {
    value: "rejected" as const,
    label: "拒絕 ✕",
    active: "border-red-500 bg-red-50 text-red-700 font-semibold",
    hover: "hover:border-red-400",
  },
];

// ── Tab 定義 ──────────────────────────────────────────────
const TABS = ["環車檢查", "來意詢問", "技師深入檢查", "報價", "確認簽名"];

// ── 刪除 SA 項目 Modal ────────────────────────────────────
function DeleteModal({
  itemName,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 className="font-bold text-neutral-800 text-lg mb-1">確認刪除項目</h3>
        <p className="text-sm text-neutral-500 mb-4">
          刪除「{itemName}」前，請輸入車主告知的拒絕原因（將記錄在簽名頁）
        </p>
        <textarea
          className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#CC0000] min-h-[80px]"
          placeholder="例：車主表示預算不足，下次回廠再處理"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex gap-3 mt-4">
          <button
            onClick={onCancel}
            className="flex-1 border border-neutral-200 text-neutral-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-neutral-50"
          >
            取消
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:bg-red-200 text-white rounded-xl py-2.5 text-sm font-semibold transition-colors"
          >
            確認刪除
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 主頁面 ────────────────────────────────────────────────
export default function PIPage() {
  const { state, dispatch, luCost } = useServiceDemo();
  const router = useRouter();
  const pi = state.pi;

  useSetPageHeader({
    breadcrumb: [{ label: "維修管理" }, { label: "接待預檢" }],
  });

  // ── 局部 state ────────────────────────────────────────
  const [exteriorStatus, setExteriorStatus] = useState<Record<string, ExteriorStatus>>(
    () => Object.fromEntries(EXTERIOR_ITEMS.map((i) => [i.id, "ok" as ExteriorStatus]))
  );
  const [exteriorNote, setExteriorNote] = useState("");

  const [purposes, setPurposes] = useState<string[]>(pi.purposes);

  const [saAsks, setSaAsks] = useState<Record<string, SAAnswer>>(
    () => pi.saAsks as Record<string, SAAnswer>
  );

  const [ownerDesc, setOwnerDesc] = useState(pi.ownerDescription);

  const [rejectReasonDraft, setRejectReasonDraft] = useState<Record<string, string>>({});

  const [deleteModal, setDeleteModal] = useState<{ id: string; name: string } | null>(null);

  const [isTransferring, setIsTransferring] = useState(false);
  const [saSignImg, setSaSignImg] = useState<string | null>(null);
  const [customerSignImg, setCustomerSignImg] = useState<string | null>(null);

  const currentTab = pi.currentTab;

  // ── 費用計算 ──────────────────────────────────────────
  const activeSaItems = pi.saItems.filter((s) => !s.deleted);
  const agreedTechItems = pi.techItems.filter((t) => t.decision === "agreed");

  const saLaborCost = activeSaItems.reduce((sum, s) => sum + luCost(s.lu), 0);
  const saPartsCost = activeSaItems.reduce((sum, s) => sum + s.partsCost, 0);
  const techLaborCost = agreedTechItems.reduce((sum, t) => sum + luCost(t.lu), 0);
  const techPartsCost = agreedTechItems.reduce((sum, t) => sum + t.partsCost, 0);

  const subtotal = saLaborCost + saPartsCost + techLaborCost + techPartsCost;
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  // ── 轉 RO 處理 ────────────────────────────────────────
  async function handleTransferRO() {
    setIsTransferring(true);
    await new Promise((r) => setTimeout(r, 900));
    dispatch({ type: "PI_TRANSFER_TO_RO" });
    router.push("/service/workorders");
  }

  // ── Tab 0：環車檢查 ───────────────────────────────────
  function renderTab0() {
    return (
      <div className="grid md:grid-cols-2 gap-6">
        {/* 左：車輛資訊 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#CC0000]">two_wheeler</span>
            車輛 / 客戶資訊
          </h3>
          <dl className="space-y-3">
            {[
              { label: "車主姓名", value: pi.customer.name },
              { label: "聯絡電話", value: pi.customer.phone },
              { label: "車型", value: pi.vehicle.model },
              { label: "車牌", value: pi.vehicle.plate },
              { label: "VIN", value: pi.vehicle.vin },
              { label: "入廠里程", value: `${pi.vehicle.mileage.toLocaleString()} km` },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-start justify-between gap-4">
                <dt className="text-xs text-neutral-500 shrink-0 pt-0.5 w-20">{label}</dt>
                <dd className="text-sm font-semibold text-neutral-800 text-right font-mono">{value}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* 右：8 項環檢 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#CC0000]">search</span>
            環車外觀檢查
          </h3>
          <div className="space-y-3">
            {EXTERIOR_ITEMS.map((item) => {
              const cur = exteriorStatus[item.id];
              return (
                <div key={item.id} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-neutral-700 flex-1 min-w-0">{item.label}</span>
                  <div className="flex gap-1 shrink-0">
                    {EXTERIOR_BTNS.map((btn) => (
                      <button
                        key={btn.value}
                        onClick={() =>
                          setExteriorStatus((prev) => ({ ...prev, [item.id]: btn.value }))
                        }
                        className={`border rounded-lg px-2 py-1 text-xs flex items-center gap-0.5 transition-colors ${
                          cur === btn.value ? btn.active : btn.style
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs leading-none">{btn.icon}</span>
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-5">
            <label className="text-xs text-neutral-500 block mb-1.5">備註說明</label>
            <textarea
              value={exteriorNote}
              onChange={(e) => setExteriorNote(e.target.value)}
              placeholder="記錄外觀損傷位置、照片編號等…"
              className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#CC0000] min-h-[72px]"
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Tab 1：來意詢問 ───────────────────────────────────
  function renderTab1() {
    return (
      <div className="space-y-6">
        {/* 來廠目的 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#CC0000]">checklist</span>
            來廠目的（可複選）
          </h3>
          <div className="flex flex-wrap gap-2">
            {PURPOSE_OPTIONS.map((p) => {
              const active = purposes.includes(p);
              return (
                <button
                  key={p}
                  onClick={() =>
                    setPurposes((prev) =>
                      active ? prev.filter((x) => x !== p) : [...prev, p]
                    )
                  }
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    active
                      ? "bg-[#CC0000] border-[#CC0000] text-white font-semibold"
                      : "border-neutral-200 text-neutral-600 hover:border-[#CC0000] hover:text-[#CC0000]"
                  }`}
                >
                  {p}
                </button>
              );
            })}
          </div>
        </div>

        {/* 車主描述 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#CC0000]">record_voice_over</span>
            車主描述問題
          </h3>
          <textarea
            value={ownerDesc}
            onChange={(e) => setOwnerDesc(e.target.value)}
            className="w-full border border-neutral-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#CC0000] min-h-[96px]"
            placeholder="車主原話記錄…"
          />
        </div>

        {/* SA 主動詢問 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#CC0000]">quiz</span>
            SA 主動詢問清單（第一次商機挖掘）
          </h3>
          <div className="space-y-3">
            {Object.keys(pi.saAsks).map((q) => {
              const cur = saAsks[q] ?? "na";
              return (
                <div key={q} className="flex items-center justify-between gap-4">
                  <span className="text-sm text-neutral-700 flex-1">{q}</span>
                  <div className="flex gap-1.5 shrink-0">
                    {SA_ANSWER_BTNS.map((btn) => (
                      <button
                        key={btn.value}
                        onClick={() =>
                          setSaAsks((prev) => ({ ...prev, [q]: btn.value }))
                        }
                        className={`border rounded-lg px-2.5 py-1 text-xs transition-colors ${
                          cur === btn.value ? btn.active : btn.style
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ── Tab 2：車間檢查 ───────────────────────────────────
  function renderTab2() {
    const agreedCount = pi.techItems.filter((t) => t.decision === "agreed").length;
    const rejectedCount = pi.techItems.filter((t) => t.decision === "rejected").length;

    return (
      <div className="space-y-4">
        {/* 技師作業提示 */}
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <span className="material-symbols-outlined text-cyan-600">engineering</span>
          <div>
            <p className="text-sm font-semibold text-cyan-800">技師作業區</p>
            <p className="text-xs text-cyan-600">
              以下為技師診斷結果，SA 協助與車主確認每項決策
            </p>
          </div>
        </div>

        {/* 技師項目 */}
        {pi.techItems.map((item) => {
          const decisionColor =
            item.decision === "agreed"
              ? "border-green-300 bg-green-50/50"
              : item.decision === "deferred"
              ? "border-amber-300 bg-amber-50/50"
              : item.decision === "rejected"
              ? "border-red-300 bg-red-50/50"
              : "border-neutral-200";

          return (
            <div
              key={item.id}
              className={`bg-white rounded-xl border-2 p-4 transition-colors ${decisionColor}`}
            >
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                {/* 左：分類 + 診斷 */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xs text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded-md">
                      {CATEGORY_LABEL[item.category]}
                    </span>
                    <span
                      className={`text-xs border px-2 py-0.5 rounded-full ${SAFETY_COLOR[item.safetyLevel]}`}
                    >
                      {SAFETY_LABEL[item.safetyLevel]}
                    </span>
                  </div>
                  <p className="font-semibold text-neutral-800 text-sm">{item.title}</p>
                  <p className="text-xs text-neutral-500 mt-1 leading-relaxed">{item.diagnosis}</p>
                  <p className="text-xs text-neutral-400 mt-2 font-mono">
                    工時 {item.lu} LU ({item.lu} × 6 min) · 零件 ${item.partsCost.toLocaleString()} · 料號 {item.partNumber}
                  </p>
                </div>

                {/* 右：決策按鈕 */}
                <div className="flex flex-col gap-2 md:items-end shrink-0">
                  <div className="flex gap-1.5">
                    {TECH_DECISION_BTNS.map((btn) => (
                      <button
                        key={btn.value}
                        onClick={() =>
                          dispatch({
                            type: "PI_SET_TECH_DECISION",
                            id: item.id,
                            decision: btn.value,
                            reason:
                              btn.value === "rejected"
                                ? rejectReasonDraft[item.id] ?? item.rejectReason
                                : undefined,
                          })
                        }
                        className={`border rounded-lg px-2.5 py-1 text-xs transition-colors ${btn.hover} ${
                          item.decision === btn.value
                            ? btn.active
                            : "border-neutral-200 text-neutral-500"
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>

                  {/* 拒絕原因輸入 */}
                  {item.decision === "rejected" && (
                    <input
                      className="w-full md:w-56 border border-red-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-500 bg-white"
                      placeholder="拒絕原因（必填）"
                      defaultValue={item.rejectReason ?? ""}
                      onChange={(e) =>
                        setRejectReasonDraft((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      onBlur={(e) => {
                        if (e.target.value.trim()) {
                          dispatch({
                            type: "PI_SET_TECH_DECISION",
                            id: item.id,
                            decision: "rejected",
                            reason: e.target.value.trim(),
                          });
                        }
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* 底部統計 */}
        <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 flex gap-6">
          <div className="text-center">
            <p className="text-2xl font-black text-green-700">{agreedCount}</p>
            <p className="text-xs text-neutral-500">同意項</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-red-600">{rejectedCount}</p>
            <p className="text-xs text-neutral-500">拒絕項</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-black text-neutral-400">
              {pi.techItems.length - agreedCount - rejectedCount}
            </p>
            <p className="text-xs text-neutral-500">暫緩項</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Tab 3：報價 ───────────────────────────────────────
  function renderTab3() {
    const deletedItems = pi.saItems.filter((s) => s.deleted);
    const hasRejectedHigh = pi.techItems.some(
      (t) => t.decision === "rejected" && t.safetyLevel === "critical"
    );
    const subtotalForChip = subtotal;

    return (
      <div className="space-y-5">
        {/* v2 報價狀態提示 chip */}
        <div className="flex flex-wrap items-center gap-2">
          {hasRejectedHigh && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
              🔴 需主管陪同報價（含安全等級 1 拒絕項）
            </span>
          )}
          {subtotalForChip >= 30000 && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              🔵 需要詳細報價單（小計 ≥ NT$30,000）
            </span>
          )}
          <span className="text-xs text-neutral-500 ml-auto">
            SA 可隨時編輯｜切換 Tab 3 查看技師診斷
          </span>
        </div>

        {/* SA 預載項目 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#CC0000]">receipt_long</span>
            SA 預載項目
          </h3>
          {activeSaItems.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-4">無未刪除的 SA 項目</p>
          ) : (
            <div className="space-y-3">
              {activeSaItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 bg-neutral-50 rounded-xl border border-neutral-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-800">{item.name}</p>
                    <p className="text-xs text-neutral-400 font-mono mt-0.5">{item.partNumber}</p>
                    <div className="flex gap-4 mt-1.5 text-xs text-neutral-500">
                      <span>工時 {item.lu} LU → <span className="text-neutral-700 font-semibold">${luCost(item.lu).toLocaleString()}</span></span>
                      <span>零件 <span className="text-neutral-700 font-semibold">${item.partsCost.toLocaleString()}</span></span>
                    </div>
                  </div>
                  <button
                    onClick={() => setDeleteModal({ id: item.id, name: item.name })}
                    className="shrink-0 text-xs text-red-600 border border-red-200 hover:bg-red-50 rounded-lg px-2.5 py-1 transition-colors"
                  >
                    刪除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 技師診斷（已同意） */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#185FA5]">engineering</span>
            技師診斷（已同意）
          </h3>
          {agreedTechItems.length === 0 ? (
            <p className="text-sm text-neutral-400 text-center py-4">尚無同意的技師項目</p>
          ) : (
            <div className="space-y-3">
              {agreedTechItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-800">{item.title}</p>
                    <p className="text-xs text-neutral-400 font-mono mt-0.5">{item.partNumber}</p>
                    <div className="flex gap-4 mt-1.5 text-xs text-neutral-500">
                      <span>工時 {item.lu} LU → <span className="text-neutral-700 font-semibold">${luCost(item.lu).toLocaleString()}</span></span>
                      <span>零件 <span className="text-neutral-700 font-semibold">${item.partsCost.toLocaleString()}</span></span>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-blue-600 bg-blue-100 rounded-full px-2 py-0.5">不可刪</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 已刪除項目 */}
        {deletedItems.length > 0 && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-5">
            <h3 className="font-semibold text-red-700 text-sm mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">delete</span>
              已刪除項目（車主拒絕）
            </h3>
            <div className="space-y-2">
              {deletedItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-red-400 text-sm mt-0.5">cancel</span>
                  <div className="min-w-0">
                    <p className="text-sm text-red-700 font-semibold line-through opacity-60">{item.name}</p>
                    {item.deleteReason && (
                      <p className="text-xs text-red-500 mt-0.5">原因：{item.deleteReason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 費用小計 sticky */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-4">費用小計</h3>
          <div className="space-y-2.5 text-sm">
            {[
              { label: "工時費（SA）", value: saLaborCost },
              { label: "零件費（SA）", value: saPartsCost },
              { label: "工時費（技師）", value: techLaborCost },
              { label: "零件費（技師）", value: techPartsCost },
            ].map(({ label, value }) => (
              <div key={label} className="flex justify-between text-neutral-500">
                <span>{label}</span>
                <span className="font-mono">${value.toLocaleString()}</span>
              </div>
            ))}
            <div className="border-t border-neutral-100 pt-2.5 flex justify-between text-neutral-600">
              <span>小計</span>
              <span className="font-mono">${subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-neutral-500 text-xs">
              <span>稅額（5%）</span>
              <span className="font-mono">${tax.toLocaleString()}</span>
            </div>
            <div className="border-t-2 border-neutral-200 pt-3 flex justify-between items-center">
              <span className="font-bold text-neutral-800">總費用</span>
              <span className="text-2xl font-black text-[#CC0000] font-mono">
                NT${total.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Tab 4：確認簽名 ───────────────────────────────────
  function renderTab4() {
    const deletedItems = pi.saItems.filter((s) => s.deleted);
    const rejectedTechItems = pi.techItems.filter((t) => t.decision === "rejected");

    return (
      <div className="space-y-5">
        {/* v2 簽核審批提示 */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-xs text-amber-800 leading-relaxed">
          <span className="material-symbols-outlined text-amber-600 text-sm align-middle mr-1">info</span>
          以上均須進入正式工單（RO）後由售後主管簽核審批，預檢單階段僅做記錄。
        </div>

        {/* SA 簽名 */}
        <div className="bg-white rounded-xl border border-neutral-200 p-5">
          <h3 className="font-semibold text-neutral-700 text-sm mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#CC0000]">draw</span>
            SA 確認簽名（林志遠）
          </h3>
          {saSignImg ? (
            <div className="space-y-2">
              <div className="border border-green-200 rounded-xl overflow-hidden bg-neutral-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={saSignImg} alt="SA 簽名" className="w-full h-32 object-contain" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-700 font-medium">✓ 林志遠 已簽名</span>
                <button
                  onClick={() => { setSaSignImg(null); dispatch({ type: "PI_UNSIGN_SA" }); }}
                  className="text-xs text-neutral-500 underline hover:text-neutral-700"
                >
                  清除重簽
                </button>
              </div>
            </div>
          ) : (
            <SignatureCanvas
              onSigned={(dataUrl) => {
                setSaSignImg(dataUrl);
                dispatch({ type: "PI_SIGN_SA" });
              }}
            />
          )}
        </div>

        {/* 已刪除 / 已拒絕項目再確認 */}
        {(deletedItems.length > 0 || rejectedTechItems.length > 0) && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h3 className="font-semibold text-amber-700 text-sm mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-base">campaign</span>
              已拒絕項目（請向車主再次確認）
            </h3>
            <ul className="space-y-2">
              {deletedItems.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="material-symbols-outlined text-amber-500 text-base mt-0.5 shrink-0">cancel</span>
                  <div>
                    <span className="font-semibold">{item.name}</span>
                    {item.deleteReason && (
                      <span className="text-xs text-amber-600 ml-2">— {item.deleteReason}</span>
                    )}
                  </div>
                </li>
              ))}
              {rejectedTechItems.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm text-amber-800">
                  <span className="material-symbols-outlined text-amber-500 text-base mt-0.5 shrink-0">cancel</span>
                  <div>
                    <span className="font-semibold">{item.title}</span>
                    {item.rejectReason && (
                      <span className="text-xs text-amber-600 ml-2">— {item.rejectReason}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 費用確認小條 */}
        <div className="bg-neutral-800 rounded-xl px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-neutral-400 text-xs">車主確認總費用</p>
            <p className="text-white text-2xl font-black font-mono mt-0.5">NT${total.toLocaleString()}</p>
          </div>
          <div className="text-right text-xs text-neutral-400">
            <p>含稅 5%</p>
            <p>NT${tax.toLocaleString()}</p>
          </div>
        </div>

        {/* 車主簽名 */}
        <div className={`bg-white rounded-xl border border-neutral-200 p-5 transition-opacity ${!pi.saSigned ? "opacity-50 pointer-events-none" : ""}`}>
          <h3 className="font-semibold text-neutral-700 text-sm mb-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-[#CC0000]">person</span>
            車主確認簽名（第一次｜{pi.customer.name}）
          </h3>
          {!pi.saSigned && (
            <p className="text-xs text-neutral-400 mb-3">
              <span className="material-symbols-outlined text-xs align-middle mr-1">info</span>
              請先完成 SA 簽名
            </p>
          )}
          {customerSignImg ? (
            <div className="space-y-2 mt-4">
              <div className="border border-green-200 rounded-xl overflow-hidden bg-neutral-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={customerSignImg} alt="車主簽名" className="w-full h-32 object-contain" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-700 font-medium">✓ {pi.customer.name} 已簽名</span>
                <button
                  onClick={() => { setCustomerSignImg(null); dispatch({ type: "PI_UNSIGN_CUSTOMER" }); }}
                  className="text-xs text-neutral-500 underline hover:text-neutral-700"
                >
                  清除重簽
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <SignatureCanvas
                onSigned={(dataUrl) => {
                  setCustomerSignImg(dataUrl);
                  dispatch({ type: "PI_SIGN_CUSTOMER" });
                }}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Tab 內容路由 ──────────────────────────────────────
  const tabContent = [renderTab0, renderTab1, renderTab2, renderTab3, renderTab4];

  return (
    <>
      {/* Delete modal */}
      {deleteModal && (
        <DeleteModal
          itemName={deleteModal.name}
          onConfirm={(reason) => {
            dispatch({ type: "PI_DELETE_SA_ITEM", id: deleteModal.id, reason });
            setDeleteModal(null);
          }}
          onCancel={() => setDeleteModal(null)}
        />
      )}

      <div className="max-w-4xl mx-auto p-4 pb-28">
        {/* 頂部 Header Bar */}
        <div
          className="rounded-xl px-5 py-4 mb-5 flex items-center justify-between"
          style={{ background: "#CC0000" }}
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-white/80 text-xl">assignment</span>
            <div>
              <p className="text-white font-black text-base tracking-wide">{pi.piNo}</p>
              <p className="text-white/70 text-xs mt-0.5">Ducati Taipei · 接待預檢單</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-white font-semibold text-sm">SA：林志遠</p>
            <p className="text-white/70 text-xs mt-0.5">{pi.date}</p>
          </div>
        </div>

        {/* Tab Bar + 進度條 */}
        <div className="bg-white rounded-xl border border-neutral-200 mb-5 overflow-hidden">
          <div className="flex">
            {TABS.map((tab, i) => {
              const isActive = i === currentTab;
              const isDone = i < currentTab;
              return (
                <button
                  key={tab}
                  onClick={() => dispatch({ type: "PI_SET_TAB", tab: i })}
                  className={`flex-1 py-3 px-1 text-xs font-semibold border-b-2 transition-colors relative flex flex-col items-center gap-0.5 ${
                    isActive
                      ? "border-[#CC0000] text-[#CC0000] bg-red-50/40"
                      : isDone
                      ? "border-green-400 text-green-600 hover:bg-green-50/30"
                      : "border-transparent text-neutral-400 hover:text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {isDone && (
                    <span className="material-symbols-outlined text-green-500 text-sm leading-none">
                      check_circle
                    </span>
                  )}
                  <span className="leading-tight text-center">{tab}</span>
                </button>
              );
            })}
          </div>

          {/* 進度條 */}
          <div className="h-1 bg-neutral-100">
            <div
              className="h-full bg-[#CC0000] transition-all duration-300"
              style={{ width: `${((currentTab + 1) / TABS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Tab 內容 */}
        {tabContent[currentTab]()}
      </div>

      {/* 底部 Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 z-30">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          {/* 步驟資訊 */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-neutral-400">
              步驟 {currentTab + 1} / {TABS.length}
            </p>
            <p className="text-sm font-semibold text-neutral-700 truncate">{TABS[currentTab]}</p>
          </div>

          {/* 上一關 */}
          <button
            onClick={() => currentTab > 0 && dispatch({ type: "PI_SET_TAB", tab: currentTab - 1 })}
            disabled={currentTab === 0}
            className="border border-neutral-200 text-neutral-600 rounded-xl px-5 py-2.5 text-sm font-semibold hover:bg-neutral-50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            ← 上一關
          </button>

          {/* 下一關 / 確認轉 RO */}
          {currentTab < TABS.length - 1 ? (
            <button
              onClick={() => dispatch({ type: "PI_SET_TAB", tab: currentTab + 1 })}
              className="bg-[#CC0000] hover:bg-[#AA0000] text-white rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors"
            >
              下一關 →
            </button>
          ) : (
            <button
              onClick={handleTransferRO}
              disabled={!pi.customerSigned || isTransferring || pi.transferredToRO}
              className="bg-[#CC0000] hover:bg-[#AA0000] disabled:bg-neutral-200 disabled:text-neutral-400 text-white rounded-xl px-5 py-2.5 text-sm font-semibold transition-colors flex items-center gap-2 min-w-[120px] justify-center"
            >
              {isTransferring ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  轉單中⋯
                </>
              ) : pi.transferredToRO ? (
                "已轉 RO ✓"
              ) : (
                "確認轉 RO"
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
