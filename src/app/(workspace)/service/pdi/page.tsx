"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { SignatureCanvas } from "@/components/signature-canvas";
import { DemoBanner } from "@/components/demo-banner";

// ── 新車 PDI 檢查項目 ──────────────────────────────────────
const NEW_PDI_GROUPS = [
  {
    id: "appearance",
    title: "外觀與包裝",
    items: [
      { id: "ext-01", label: "車體外觀完整，無刮傷/凹陷" },
      { id: "ext-02", label: "出廠包裝材料已移除" },
      { id: "ext-03", label: "車主手冊、保固書齊全" },
      { id: "ext-04", label: "隨車工具包完整" },
      { id: "ext-05", label: "鑰匙（含備用鑰匙）齊全" },
    ],
  },
  {
    id: "electric",
    title: "電氣系統",
    items: [
      { id: "elc-01", label: "電瓶充飽電（≥12.8V）" },
      { id: "elc-02", label: "前/後頭燈、方向燈、煞車燈正常" },
      { id: "elc-03", label: "儀表板各警示燈正常點亮自檢後熄滅" },
      { id: "elc-04", label: "電子系統（TC/ABS/DDS）自我診斷正常" },
      { id: "elc-05", label: "DDS 診斷介面無故障碼" },
      { id: "elc-06", label: "出廠故障碼清除完畢" },
      { id: "elc-07", label: "NDCS 公報確認執行完成" },
      { id: "elc-08", label: "SAG 電子懸吊初始化設定（V4 S/R 適用）" },
    ],
  },
  {
    id: "engine",
    title: "引擎與傳動",
    items: [
      { id: "eng-01", label: "引擎機油油位正常（冷車/熱車確認）" },
      { id: "eng-02", label: "前/後煞車油液位正常" },
      { id: "eng-03", label: "冷卻液（水箱水）油位正常" },
      { id: "eng-04", label: "油門握把轉動順暢，回彈確實" },
      { id: "eng-05", label: "離合器拉桿行程正常" },
      { id: "eng-06", label: "鏈條張力、潤滑符合規格" },
      { id: "eng-07", label: "前/後輪胎氣壓正常（F:2.5 / R:2.9 bar）" },
      { id: "eng-08", label: "重要螺絲扭力複查（手把/輪軸/卡鉗）" },
    ],
  },
  {
    id: "safety",
    title: "安全與功能",
    items: [
      { id: "saf-01", label: "前後煞車效能測試正常" },
      { id: "saf-02", label: "ABS 功能測試通過" },
      { id: "saf-03", label: "循跡控制（TC）功能正常" },
      { id: "saf-04", label: "引擎防盜系統啟用正常" },
      { id: "saf-05", label: "座椅卡榫/開啟機構正常" },
      { id: "saf-06", label: "左/右握把端蓋鎖緊" },
      { id: "saf-07", label: "後照鏡調整後固定正常" },
      { id: "saf-08", label: "DQS 快排系統測試正常（V4 標配）" },
    ],
  },
];

// ── 中古車 PDI 檢查項目 ──────────────────────────────────────
const USED_PDI_GROUPS = [
  {
    id: "safety_used",
    title: "安全件（優先處理）",
    items: [
      { id: "us-01", label: "煞車來令片厚度 ≥ 3mm" },
      { id: "us-02", label: "前/後輪胎胎紋深度 ≥ 2mm，無龜裂" },
      { id: "us-03", label: "煞車油液透明度，無水氣" },
      { id: "us-04", label: "煞車碟盤厚度符合規格，無熱裂紋" },
      { id: "us-05", label: "ABS 系統自我診斷無故障碼" },
    ],
  },
  {
    id: "consumable",
    title: "耗材件",
    items: [
      { id: "uc-01", label: "引擎機油更換（≥ 5,000km 換油週期）" },
      { id: "uc-02", label: "空氣濾芯清潔或更換" },
      { id: "uc-03", label: "火星塞間隙確認" },
      { id: "uc-04", label: "鏈條清潔潤滑" },
      { id: "uc-05", label: "電瓶健康度檢測（CCA ≥ 80%）" },
      { id: "uc-06", label: "冷卻液更換（≥ 2 年週期）" },
    ],
  },
  {
    id: "cpo",
    title: "CPO / DPO 認證項目",
    items: [
      { id: "cpo-01", label: "DDS 診斷全系統無故障碼" },
      { id: "cpo-02", label: "車架/VIN 無改造/竄改跡象" },
      { id: "cpo-03", label: "正廠維修記錄完整（5 筆以上）" },
      { id: "cpo-04", label: "Ducati 認證中古車照片建檔" },
      { id: "cpo-05", label: "CPO 標章貼附，保固書簽署" },
      { id: "cpo-06", label: "車主轉讓文件核對完畢" },
      { id: "cpo-07", label: "NDCS 系統車籍資料更新" },
    ],
  },
  {
    id: "appearance_used",
    title: "一般外觀",
    items: [
      { id: "ua-01", label: "車體烤漆整修（刮傷/凹陷修補）" },
      { id: "ua-02", label: "握把/腳踏/座椅套更換" },
      { id: "ua-03", label: "清潔拋光，交車標準" },
      { id: "ua-04", label: "全車詳細拍照建檔" },
      { id: "ua-05", label: "隨車配件清點完整" },
    ],
  },
];

type CheckState = "normal" | "abnormal" | "none";
type CheckMap = Record<string, CheckState>;

export default function PDIPage() {
  useSetPageHeader({
    breadcrumb: [{ label: "維修管理" }, { label: "PDI 作業" }],
    hideSearch: true,
  });

  const [tab, setTab] = useState<"new" | "used">("new");

  // 新車 PDI 狀態
  const [newChecks, setNewChecks] = useState<CheckMap>({});
  const [newRemarks, setNewRemarks] = useState<Record<string, string>>({});
  const [newSigImg, setNewSigImg] = useState<string | null>(null);
  const [newSubmitting, setNewSubmitting] = useState(false);
  const [newSubmitted, setNewSubmitted] = useState(false);

  // 中古車 PDI 狀態
  const [usedChecks, setUsedChecks] = useState<CheckMap>({});
  const [usedRemarks, setUsedRemarks] = useState<Record<string, string>>({});
  const [usedSigImg, setUsedSigImg] = useState<string | null>(null);
  const [usedSubmitting, setUsedSubmitting] = useState(false);
  const [usedSubmitted, setUsedSubmitted] = useState(false);

  // ── 計算完成率 ──
  function calcProgress(groups: typeof NEW_PDI_GROUPS, checks: CheckMap) {
    const allIds = groups.flatMap((g) => g.items.map((i) => i.id));
    const done = allIds.filter((id) => checks[id] === "normal" || checks[id] === "abnormal").length;
    return { done, total: allIds.length, pct: Math.round((done / allIds.length) * 100) };
  }

  const newProgress = calcProgress(NEW_PDI_GROUPS, newChecks);
  const usedProgress = calcProgress(USED_PDI_GROUPS, usedChecks);

  function setCheck(
    id: string,
    val: "normal" | "abnormal",
    checksMap: CheckMap,
    setChecks: (v: CheckMap) => void
  ) {
    const current = checksMap[id];
    setChecks({ ...checksMap, [id]: current === val ? "none" : val });
  }

  function handleNewSubmit() {
    if (!newSigImg) return;
    setNewSubmitting(true);
    setTimeout(() => {
      setNewSubmitting(false);
      setNewSubmitted(true);
    }, 1200);
  }

  function handleUsedSubmit() {
    if (!usedSigImg) return;
    setUsedSubmitting(true);
    setTimeout(() => {
      setUsedSubmitting(false);
      setUsedSubmitted(true);
    }, 1200);
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <DemoBanner message="Demo 用、未接 DB — 本頁為示範流程、操作不會儲存。" />
      {/* Header */}
      <div className="bg-[#185FA5] text-white rounded-xl px-5 py-4">
        <div className="text-lg font-bold">PDI 出廠前檢查</div>
        <div className="text-sm text-white/70 mt-0.5">Pre-Delivery Inspection</div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-neutral-100 rounded-xl p-1">
        <button
          onClick={() => setTab("new")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "new"
              ? "bg-white text-[#185FA5] shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          新車 PDI
        </button>
        <button
          onClick={() => setTab("used")}
          className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            tab === "used"
              ? "bg-white text-[#185FA5] shadow-sm"
              : "text-neutral-500 hover:text-neutral-700"
          }`}
        >
          中古車 PDI
        </button>
      </div>

      {/* ── 新車 PDI ── */}
      {tab === "new" && (
        <div className="space-y-4">
          {/* 車輛資訊 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <h3 className="font-semibold text-neutral-800 mb-4">車輛資訊</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                ["車型", "Panigale V4 S"],
                ["車牌（暫定）", "NEW-0001"],
                ["VIN", "ZDMV4S009RB000123"],
                ["進廠日期", "2026-07-30"],
                ["業務", "陳大為"],
                ["技師", "張偉"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-neutral-500 mb-0.5">{label}</div>
                  <div className="font-medium text-neutral-800">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 進度條 */}
          <ProgressBar done={newProgress.done} total={newProgress.total} pct={newProgress.pct} />

          {/* 檢查清單 */}
          {NEW_PDI_GROUPS.map((group) => (
            <CheckGroup
              key={group.id}
              group={group}
              checks={newChecks}
              remarks={newRemarks}
              onCheck={(id, val) => setCheck(id, val, newChecks, setNewChecks)}
              onRemark={(id, text) =>
                setNewRemarks((prev) => ({ ...prev, [id]: text }))
              }
            />
          ))}

          {/* 技師簽名 + 提交 */}
          <SubmitSection
            techName="張偉"
            signatureImg={newSigImg}
            onSigned={setNewSigImg}
            onClear={() => setNewSigImg(null)}
            submitting={newSubmitting}
            submitted={newSubmitted}
            onSubmit={handleNewSubmit}
            progress={newProgress}
          />
        </div>
      )}

      {/* ── 中古車 PDI ── */}
      {tab === "used" && (
        <div className="space-y-4">
          {/* 車輛資訊 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <h3 className="font-semibold text-neutral-800 mb-4">車輛資訊</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              {[
                ["車型", "Monster SP"],
                ["車牌", "ABC-1234"],
                ["VIN", "ZDMM2N007RB001234"],
                ["進廠日期", "2026-07-30"],
                ["業務", "林冠宇"],
                ["CPO 等級", "Ducati CPO"],
              ].map(([label, value]) => (
                <div key={label}>
                  <div className="text-xs text-neutral-500 mb-0.5">{label}</div>
                  <div className="font-medium text-neutral-800">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 進度條 */}
          <ProgressBar done={usedProgress.done} total={usedProgress.total} pct={usedProgress.pct} />

          {/* 檢查清單 */}
          {USED_PDI_GROUPS.map((group) => (
            <CheckGroup
              key={group.id}
              group={group}
              checks={usedChecks}
              remarks={usedRemarks}
              onCheck={(id, val) => setCheck(id, val, usedChecks, setUsedChecks)}
              onRemark={(id, text) =>
                setUsedRemarks((prev) => ({ ...prev, [id]: text }))
              }
            />
          ))}

          {/* 技師簽名 + 提交 */}
          <SubmitSection
            techName="張偉"
            signatureImg={usedSigImg}
            onSigned={setUsedSigImg}
            onClear={() => setUsedSigImg(null)}
            submitting={usedSubmitting}
            submitted={usedSubmitted}
            onSubmit={handleUsedSubmit}
            progress={usedProgress}
          />
        </div>
      )}
    </div>
  );
}

// ── 進度條元件 ──────────────────────────────────────────────
function ProgressBar({
  done,
  total,
  pct,
}: {
  done: number;
  total: number;
  pct: number;
}) {
  const color =
    pct === 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-amber-400";
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm px-5 py-4">
      <div className="flex items-center justify-between mb-2 text-sm">
        <span className="font-medium text-neutral-700">完成進度</span>
        <span className={`font-bold ${pct === 100 ? "text-green-600" : "text-[#185FA5]"}`}>
          {done} / {total} 項（{pct}%）
        </span>
      </div>
      <div className="h-2.5 bg-neutral-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} rounded-full transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct === 100 && (
        <div className="text-xs text-green-600 font-medium mt-1.5">
          ✅ 全部項目已確認
        </div>
      )}
    </div>
  );
}

// ── 檢查組元件 ──────────────────────────────────────────────
function CheckGroup({
  group,
  checks,
  remarks,
  onCheck,
  onRemark,
}: {
  group: { id: string; title: string; items: { id: string; label: string }[] };
  checks: CheckMap;
  remarks: Record<string, string>;
  onCheck: (id: string, val: "normal" | "abnormal") => void;
  onRemark: (id: string, text: string) => void;
}) {
  const groupDone = group.items.filter(
    (i) => checks[i.id] === "normal" || checks[i.id] === "abnormal"
  ).length;
  const allDone = groupDone === group.items.length;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
      <div
        className={`px-5 py-3 border-b flex items-center justify-between ${
          allDone
            ? "bg-green-50 border-green-200"
            : "bg-neutral-50 border-neutral-200"
        }`}
      >
        <h3 className={`font-semibold text-sm ${allDone ? "text-green-700" : "text-neutral-700"}`}>
          {allDone ? "✅ " : ""}{group.title}
        </h3>
        <span className="text-xs text-neutral-500">
          {groupDone}/{group.items.length}
        </span>
      </div>
      <div className="divide-y divide-neutral-100">
        {group.items.map((item) => {
          const state = checks[item.id] ?? "none";
          const isAbnormal = state === "abnormal";
          return (
            <div key={item.id} className="px-4 py-3">
              <div className="flex items-center gap-3">
                {/* 正常按鈕 */}
                <button
                  onClick={() => onCheck(item.id, "normal")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    state === "normal"
                      ? "bg-green-500 text-white border-green-500"
                      : "bg-white text-green-600 border-green-300 hover:bg-green-50"
                  }`}
                >
                  <span>✓</span> 正常
                </button>
                {/* 異常按鈕 */}
                <button
                  onClick={() => onCheck(item.id, "abnormal")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                    state === "abnormal"
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-white text-red-500 border-red-300 hover:bg-red-50"
                  }`}
                >
                  <span>✕</span> 異常
                </button>
                <span className="flex-1 text-sm text-neutral-700">{item.label}</span>
              </div>
              {/* 異常備註展開 */}
              {isAbnormal && (
                <div className="mt-2 ml-[104px]">
                  <input
                    type="text"
                    value={remarks[item.id] ?? ""}
                    onChange={(e) => onRemark(item.id, e.target.value)}
                    placeholder="請說明異常情況..."
                    className="w-full px-3 py-1.5 rounded-lg text-sm border border-red-200 bg-red-50 text-red-700 placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-300"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 提交區塊元件 ────────────────────────────────────────────
function SubmitSection({
  techName,
  signatureImg,
  onSigned,
  onClear,
  submitting,
  submitted,
  onSubmit,
  progress,
}: {
  techName: string;
  signatureImg: string | null;
  onSigned: (dataUrl: string) => void;
  onClear: () => void;
  submitting: boolean;
  submitted: boolean;
  onSubmit: () => void;
  progress: { done: number; total: number; pct: number };
}) {
  return (
    <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
      <h3 className="font-semibold text-neutral-800">技師簽名確認</h3>
      {submitted ? (
        <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 text-center">
          <div className="text-green-700 font-bold text-lg">✅ PDI 完成</div>
          <div className="text-green-600 text-sm mt-1">
            {techName} 已簽署，資料已送出
          </div>
        </div>
      ) : (
        <>
          {signatureImg ? (
            <div className="space-y-2">
              <div className="border border-green-200 rounded-xl overflow-hidden bg-neutral-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatureImg} alt="技師簽名" className="w-full h-32 object-contain" />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-green-700 font-medium">✓ {techName} 已簽名</span>
                <button
                  onClick={onClear}
                  className="text-xs text-neutral-500 underline hover:text-neutral-700"
                >
                  清除重簽
                </button>
              </div>
            </div>
          ) : (
            <SignatureCanvas onSigned={onSigned} />
          )}
          <button
            onClick={onSubmit}
            disabled={!signatureImg || submitting || progress.pct < 100}
            className={`w-full py-3 rounded-xl font-semibold text-sm transition-colors ${
              signatureImg && progress.pct === 100 && !submitting
                ? "bg-[#185FA5] text-white hover:bg-[#1450a0]"
                : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
            }`}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v8H4z"
                  />
                </svg>
                提交中⋯
              </span>
            ) : progress.pct < 100 ? (
              `尚有 ${progress.total - progress.done} 項未確認`
            ) : (
              "提交 PDI 完成"
            )}
          </button>
        </>
      )}
    </div>
  );
}
