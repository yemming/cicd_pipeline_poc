"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import { useServiceDemo } from "@/lib/service-demo/context";

// ── 複檢項目定義 ─────────────────────────────────────────────
const CHECK_SECTIONS = [
  {
    key: "engine",
    label: "引擎系統",
    color: "#854F0B",
    bg: "bg-amber-50",
    border: "border-amber-200",
    items: [
      { id: "e1", title: "引擎機油更換（Motul 5W-40）", note: "確認油量、油色、無滲漏" },
      { id: "e2", title: "機油濾芯更換", note: "確認濾芯型號 DUC-OIL-5W40 正確安裝" },
    ],
  },
  {
    key: "brake",
    label: "煞車系統",
    color: "#CC0000",
    bg: "bg-red-50",
    border: "border-red-200",
    items: [
      { id: "b1", title: "前煞車來令片更換", note: "確認厚度 > 3mm，新品 DUC-BRK-F01" },
      { id: "b2", title: "煞車液補充確認", note: "確認液位於 MAX 線，無氣泡" },
    ],
  },
  {
    key: "electric",
    label: "電氣系統",
    color: "#534AB7",
    bg: "bg-purple-50",
    border: "border-purple-200",
    items: [
      { id: "el1", title: "DDS 診斷故障碼清除確認", note: "掃描確認無殘留故障碼" },
      { id: "el2", title: "各電子系統功能確認", note: "DTC / ABS / TCS / EBC 全部正常" },
    ],
  },
  {
    key: "general",
    label: "一般保養",
    color: "#2C2C2C",
    bg: "bg-neutral-50",
    border: "border-neutral-200",
    items: [
      { id: "g1", title: "各螺絲扭力確認", note: "引擎蓋、踏板、排氣管固定螺絲" },
      { id: "g2", title: "車身清潔", note: "油漬、指紋清除，車身無劃傷" },
    ],
  },
];

const ALL_CHECK_IDS = CHECK_SECTIONS.flatMap((s) => s.items.map((i) => i.id));

const TEST_ITEMS = [
  { id: "t1", label: "引擎啟動順暢，怠速穩定" },
  { id: "t2", label: "各檔位換檔正常，無異音" },
  { id: "t3", label: "前後煞車效能良好，無偏拉" },
  { id: "t4", label: "儀表板無警示燈亮起" },
  { id: "t5", label: "電子輔助系統（ABS / TCS）功能正常" },
];

const CLEAN_ITEMS = [
  { id: "c1", label: "車身外觀清潔完成" },
  { id: "c2", label: "把手、座墊、龍頭擦拭乾淨" },
  { id: "c3", label: "輪圈、鏈條清潔完成" },
  { id: "c4", label: "車主個人物品確認歸還" },
  { id: "c5", label: "維修單（RO 副本）已備妥給車主" },
];

const STEPS = [
  "維修項目複檢",
  "試車記錄",
  "清潔確認",
  "複檢簽核",
  "通知取車",
];

export default function InspectionPage() {
  useSetPageHeader({
    title: "竣工複檢",
    breadcrumb: [{ label: "維修管理" }, { label: "竣工複檢" }],
    hideSearch: true,
  });

  const { state, dispatch } = useServiceDemo();
  const insp = state.inspection;
  const step = insp.currentStep;

  const checkedCount = ALL_CHECK_IDS.filter(
    (id) => insp.checkedItems[id] === "ok" || insp.checkedItems[id] === "fail"
  ).length;

  const allTestDone = TEST_ITEMS.every((t) => insp.testItems[t.id]);
  const allCleanDone = CLEAN_ITEMS.every((c) => insp.cleanItems[c.id]);

  function setStep(s: number) {
    dispatch({ type: "INSP_SET_STEP", step: s });
  }

  // ── 估算費用（LU rate 165）──────────────────────────────
  const estimatedCost = 11815;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4 pb-24">
      {/* Sprint chip 列（含 ★4 跨模組 e2e marker） */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">竣工複檢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          8.1 ★4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          逐項複檢 / 試車 / 清潔 / 簽核 / 取車通知 5 步流程
        </span>
      </header>

      {/* ★4 跨模組 e2e banner — 竣工複檢 ↔ 保固舊件管理 */}
      <div className="rounded-xl border border-[#BA7517] bg-[#FAEEDA] px-4 py-3 text-[12px] text-[#854F0B] leading-relaxed">
        <p className="font-semibold mb-1">
          🛡️ ★4 跨模組串接：竣工複檢 ↔ 保固舊件管理（D7.2）
        </p>
        <p>
          若複檢過程發現拆換下來的舊件屬於 <strong>保固範圍</strong>（如電瓶 / 大燈總成 / ECU），請按
          <span className="mx-1 inline-flex items-center px-1.5 py-0.5 rounded-md bg-white border border-[#BA7517] text-[#854F0B] font-mono text-[11px]">
            ✕ 異常
          </span>
          標記後，於右下「複檢結論備註」註明保固單號，系統將自動觸發
          <strong className="mx-1">保固舊件回收流程</strong>（依 Ducati SRV-SRB-26-014 規定，原廠保固件須回繳）。
        </p>
      </div>

      {/* Header bar */}
      <div
        className="rounded-xl px-5 py-4 flex items-center justify-between"
        style={{ backgroundColor: "#1A3A5C" }}
      >
        <div>
          <p className="text-white text-xs opacity-70 mb-0.5">竣工複檢</p>
          <h1 className="text-white font-bold text-lg">RO-20260730-001</h1>
        </div>
        <div className="text-right">
          <p className="text-white text-xs opacity-70 mb-0.5">複檢員</p>
          <p className="text-white font-semibold text-sm">陳建明（資深技師）</p>
        </div>
      </div>

      {/* Step 進度條 */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-4">
        <div className="flex items-center">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1 last:flex-none">
              <button
                onClick={() => setStep(i)}
                className={`flex flex-col items-center gap-1 cursor-pointer`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-colors ${
                    i < step
                      ? "border-green-500 bg-green-500 text-white"
                      : i === step
                      ? "border-[#CC0000] bg-[#CC0000] text-white"
                      : "border-neutral-300 bg-white text-neutral-400"
                  }`}
                >
                  {i < step ? "✓" : i + 1}
                </div>
                <span
                  className={`text-[10px] text-center leading-tight max-w-[56px] ${
                    i === step
                      ? "text-[#CC0000] font-semibold"
                      : i < step
                      ? "text-green-600"
                      : "text-neutral-400"
                  }`}
                >
                  {label}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 mb-5 ${
                    i < step ? "bg-green-400" : "bg-neutral-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Step 0：維修項目複檢 ── */}
      {step === 0 && (
        <div className="space-y-4">
          {/* RO 摘要 bar */}
          <div className="bg-neutral-100 rounded-xl border border-neutral-200 px-5 py-3 flex flex-wrap gap-4 text-sm">
            <span className="font-medium text-neutral-700">RO-20260730-001</span>
            <span className="text-neutral-500">進廠里程 <strong>8,200 km</strong></span>
            <span className="text-neutral-500">維修項目 <strong>3 項</strong></span>
            <span className="text-neutral-500">
              預估費用 <strong className="text-[#CC0000]">NT$ {estimatedCost.toLocaleString()}</strong>
            </span>
          </div>

          {/* 進度計數 */}
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-neutral-700">複檢項目</h2>
            <span className="text-sm text-neutral-500">
              已複檢{" "}
              <span className="font-bold text-[#CC0000]">{checkedCount}</span> /{" "}
              {ALL_CHECK_IDS.length} 項
            </span>
          </div>

          {/* 各分類 section */}
          {CHECK_SECTIONS.map((sec) => (
            <div
              key={sec.key}
              className={`rounded-xl border ${sec.border} ${sec.bg} overflow-hidden`}
            >
              <div
                className="px-4 py-2.5 flex items-center gap-2"
                style={{ backgroundColor: sec.color + "18" }}
              >
                <div
                  className="w-1 h-4 rounded-full"
                  style={{ backgroundColor: sec.color }}
                />
                <span
                  className="font-semibold text-sm"
                  style={{ color: sec.color }}
                >
                  {sec.label}
                </span>
              </div>
              <div className="divide-y divide-neutral-100">
                {sec.items.map((item) => {
                  const state = insp.checkedItems[item.id] ?? "none";
                  return (
                    <div
                      key={item.id}
                      className="px-4 py-3 flex items-center justify-between gap-4 bg-white"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-neutral-800 text-sm">{item.title}</p>
                        <p className="text-neutral-500 text-xs mt-0.5">{item.note}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() =>
                            dispatch({
                              type: "INSP_CHECK_ITEM",
                              id: item.id,
                              state: state === "ok" ? "none" : "ok",
                            })
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            state === "ok"
                              ? "bg-green-500 text-white border-green-500"
                              : "bg-white text-green-600 border-green-300 hover:bg-green-50"
                          }`}
                        >
                          ✓ 通過
                        </button>
                        <button
                          onClick={() =>
                            dispatch({
                              type: "INSP_CHECK_ITEM",
                              id: item.id,
                              state: state === "fail" ? "none" : "fail",
                            })
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                            state === "fail"
                              ? "bg-red-500 text-white border-red-500"
                              : "bg-white text-red-600 border-red-300 hover:bg-red-50"
                          }`}
                        >
                          ✕ 異常
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Step 1：試車記錄 ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
            <h2 className="font-semibold text-neutral-800">試車記錄</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">試車前里程（唯讀）</label>
                <div className="bg-neutral-100 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700">
                  8,200 km
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">試車後里程</label>
                <input
                  type="number"
                  value={insp.testAfterMileage}
                  onChange={() => {
                    // demo: context 預設 8215，這裡僅佔位避免 React readonly 警告
                  }}
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                  placeholder="8215"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">試車距離（自動計算）</label>
                <div className="bg-neutral-100 rounded-lg px-3 py-2 text-sm font-medium text-neutral-700">
                  {insp.testAfterMileage - 8200} km
                </div>
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">試車時間</label>
                <input
                  type="time"
                  defaultValue="14:10"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-neutral-500 mb-1 block">試車路線</label>
                <input
                  type="text"
                  defaultValue="廠區周邊"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-neutral-800 text-sm">試車確認項目</h3>
            <div className="space-y-2">
              {TEST_ITEMS.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 cursor-pointer group"
                >
                  <input
                    type="checkbox"
                    checked={!!insp.testItems[item.id]}
                    onChange={() =>
                      dispatch({ type: "INSP_TOGGLE_TEST", id: item.id })
                    }
                    className="w-4 h-4 accent-[#CC0000] rounded"
                  />
                  <span
                    className={`text-sm transition-colors ${
                      insp.testItems[item.id]
                        ? "text-green-700 line-through"
                        : "text-neutral-700"
                    }`}
                  >
                    {item.label}
                  </span>
                  {insp.testItems[item.id] && (
                    <span className="text-xs text-green-500">✓</span>
                  )}
                </label>
              ))}
            </div>
            <div className="pt-1">
              <span
                className={`text-xs font-medium ${
                  allTestDone ? "text-green-600" : "text-neutral-400"
                }`}
              >
                {TEST_ITEMS.filter((t) => insp.testItems[t.id]).length} /{" "}
                {TEST_ITEMS.length} 項確認完成
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Step 2：清潔確認 ── */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
          <h2 className="font-semibold text-neutral-800">清潔確認</h2>
          <div className="space-y-2">
            {CLEAN_ITEMS.map((item) => (
              <label
                key={item.id}
                className="flex items-center gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={!!insp.cleanItems[item.id]}
                  onChange={() =>
                    dispatch({ type: "INSP_TOGGLE_CLEAN", id: item.id })
                  }
                  className="w-4 h-4 accent-[#CC0000] rounded"
                />
                <span
                  className={`text-sm transition-colors ${
                    insp.cleanItems[item.id]
                      ? "text-green-700 line-through"
                      : "text-neutral-700"
                  }`}
                >
                  {item.label}
                </span>
                {insp.cleanItems[item.id] && (
                  <span className="text-xs text-green-500">✓</span>
                )}
              </label>
            ))}
          </div>
          <div className="pt-1 border-t border-neutral-100">
            <span
              className={`text-xs font-medium ${
                allCleanDone ? "text-green-600" : "text-neutral-400"
              }`}
            >
              {CLEAN_ITEMS.filter((c) => insp.cleanItems[c.id]).length} /{" "}
              {CLEAN_ITEMS.length} 項完成
              {allCleanDone && "　✓ 清潔確認完成"}
            </span>
          </div>
        </div>
      )}

      {/* ── Step 3：複檢簽核 ── */}
      {step === 3 && (
        <div className="space-y-4">
          {/* 複檢摘要 */}
          <div className="bg-neutral-50 rounded-xl border border-neutral-200 p-5 space-y-3">
            <h2 className="font-semibold text-neutral-800">複檢摘要</h2>
            <div className="space-y-2 text-sm">
              {[
                {
                  label: "維修項目複檢",
                  done: checkedCount === ALL_CHECK_IDS.length,
                  detail: `${checkedCount} / ${ALL_CHECK_IDS.length} 項`,
                },
                {
                  label: "試車記錄",
                  done: allTestDone,
                  detail: allTestDone ? "全部完成" : "未完成",
                },
                {
                  label: "清潔確認",
                  done: allCleanDone,
                  detail: allCleanDone ? "全部完成" : "未完成",
                },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between">
                  <span className="text-neutral-600">{row.label}</span>
                  <span
                    className={`font-medium ${
                      row.done ? "text-green-600" : "text-amber-600"
                    }`}
                  >
                    {row.done ? "✓ " : "⚠ "}
                    {row.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 授權驗證 badge */}
          <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-3 flex items-center gap-3">
            <span className="text-green-600 text-lg">✅</span>
            <div>
              <p className="text-green-800 font-semibold text-sm">竣工複檢授權</p>
              <p className="text-green-600 text-xs">陳建明 / 資深技師 / 授權碼 INSP-2026</p>
            </div>
          </div>

          {/* 簽名區 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-neutral-800">複檢簽核　電子簽名</h3>

            {/* 簽核授權 info card（v1 規格：複檢人員 / 職級 / 授權 / RO 系統帶出） */}
            <div className="bg-[#E6F1FB] border border-[#4A90D9] rounded-lg px-4 py-3">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[12px]">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-[#185FA5] font-semibold uppercase tracking-wider">複檢人員</span>
                  <span className="font-semibold text-[#1A3A5C]">陳建明</span>
                  <span className="text-[9px] bg-[#1A3A5C] text-white px-1.5 py-0.5 rounded inline-block w-fit">系統帶出</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-[#185FA5] font-semibold uppercase tracking-wider">職級</span>
                  <span className="font-semibold text-[#1A3A5C]">資深技師</span>
                  <span className="text-[9px] bg-[#1A3A5C] text-white px-1.5 py-0.5 rounded inline-block w-fit">人員名冊</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-[#185FA5] font-semibold uppercase tracking-wider">簽核授權</span>
                  <span className="font-semibold text-green-700">✅ 竣工複檢</span>
                  <span className="text-[9px] bg-[#1A3A5C] text-white px-1.5 py-0.5 rounded inline-block w-fit">已授權</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[10px] text-[#185FA5] font-semibold uppercase tracking-wider">RO 工單</span>
                  <span className="font-semibold text-[#1A3A5C] font-mono">RO-20260730-001</span>
                  <span className="text-[9px] bg-[#1A3A5C] text-white px-1.5 py-0.5 rounded inline-block w-fit">自動帶入</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-neutral-500">
              請完成電子簽名，確認本工單維修品質符合 Ducati 原廠標準。
              <span className="ml-1 text-neutral-400">依 Ducati SRV-SRB-26-014，數位簽名具法律效力且防竄改。</span>
            </p>

            {insp.signed ? (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
                <span className="text-green-500 text-2xl">✓</span>
                <div>
                  <p className="text-green-800 font-bold">陳建明 複檢完成</p>
                  <p className="text-green-600 text-xs mt-0.5">{insp.signedAt}</p>
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-neutral-300 rounded-xl p-8 flex flex-col items-center gap-3">
                <p className="text-neutral-400 text-sm">請點擊進行電子簽名</p>
                <button
                  onClick={() => dispatch({ type: "INSP_SIGN" })}
                  className="px-6 py-2.5 rounded-lg font-semibold text-sm text-white transition-colors"
                  style={{ backgroundColor: "#1A3A5C" }}
                >
                  點擊電子簽名
                </button>
              </div>
            )}

            {/* 複檢結論備註（v1 規格新增；★4 保固舊件追蹤註記欄） */}
            <div className="pt-1">
              <label className="text-[11px] text-neutral-500 mb-1 block font-medium">
                複檢結論備註（選填，含保固舊件單號）
              </label>
              <textarea
                rows={2}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                placeholder="例：本工單所有維修項目均已完成，品質符合 Ducati 原廠標準；舊件 BAT-2026-0042（保固電瓶）已建檔回收..."
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Step 4：通知取車 ── */}
      {step === 4 && (
        <div className="space-y-4">
          {/* 複檢完成確認 card */}
          {insp.signed ? (
            <div className="bg-green-50 border border-green-200 rounded-xl px-5 py-4 flex items-center gap-3">
              <span className="text-green-500 text-2xl">✓</span>
              <div>
                <p className="text-green-800 font-bold">竣工複檢已完成</p>
                <p className="text-green-600 text-xs">簽核人：陳建明　時間：{insp.signedAt}</p>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4">
              <p className="text-amber-800 text-sm font-semibold">⚠ 尚未完成複檢簽核</p>
              <p className="text-amber-600 text-xs mt-1">請先完成 Step 3 的電子簽名</p>
            </div>
          )}

          {/* 取車通知預覽 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-neutral-800">取車通知預覽</h3>
            <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-sm text-neutral-700 space-y-2 leading-relaxed">
              <p>親愛的 <strong>王小明</strong> 您好，</p>
              <p>
                您的 <strong>Ducati Panigale V4（ZZX-5566）</strong>
                維修保養已完成！
              </p>
              <p>本次維修項目：引擎機油更換、前煞車來令片更換</p>
              <p>
                預估費用：
                <strong className="text-[#CC0000]">
                  NT$ {estimatedCost.toLocaleString()}（含稅）
                </strong>
              </p>
              <p>請於今日 <strong>18:00</strong> 前取車，謝謝！</p>
              <p className="text-neutral-400 text-xs">— Ducati Taipei Official Dealer</p>
            </div>
          </div>

          {/* 發送按鈕 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-neutral-800 text-sm">發送通知</h3>
            <div className="flex gap-3">
              {insp.notifySent ? (
                <div className="flex-1 bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center gap-2">
                  <span className="text-green-500 font-bold">✓</span>
                  <span className="text-green-700 text-sm font-medium">
                    已發送 LINE 通知　{insp.notifySentAt}
                  </span>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => dispatch({ type: "INSP_NOTIFY" })}
                    className="flex-1 flex items-center justify-center gap-2 bg-green-500 text-white rounded-xl py-3 text-sm font-semibold hover:bg-green-600 transition-colors"
                  >
                    💬 LINE 通知
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 bg-[#185FA5] text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 transition-colors">
                    📱 簡訊
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 bg-neutral-700 text-white rounded-xl py-3 text-sm font-semibold hover:bg-neutral-800 transition-colors">
                    📞 電話
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 下次保養提示 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-neutral-800 text-sm">下次保養提示</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">下次保養里程</label>
                <input
                  type="text"
                  defaultValue="16,000 km"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">下次保養日期</label>
                <input
                  type="date"
                  defaultValue="2027-01-30"
                  className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
              </div>
            </div>
          </div>

          {/* 完成交車按鈕 */}
          <button
            disabled={!insp.notifySent}
            className={`w-full py-4 rounded-xl font-bold text-white text-base transition-colors ${
              insp.notifySent
                ? "hover:opacity-90"
                : "opacity-40 cursor-not-allowed"
            }`}
            style={{ backgroundColor: "#CC0000" }}
          >
            完成交車 · 關閉 RO
          </button>
        </div>
      )}

      {/* ── 底部導航 ── */}
      <div className="fixed bottom-0 left-[296px] right-0 bg-white border-t border-neutral-200 px-6 py-4 flex justify-between items-center">
        <button
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className={`px-6 py-2.5 rounded-xl border font-semibold text-sm transition-colors ${
            step === 0
              ? "border-neutral-200 text-neutral-300 cursor-not-allowed"
              : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
          }`}
        >
          ← 上一步
        </button>
        <span className="text-sm text-neutral-400">
          步驟 {step + 1} / {STEPS.length}
        </span>
        {step < STEPS.length - 1 ? (
          <button
            onClick={() => setStep(step + 1)}
            className="px-6 py-2.5 rounded-xl font-semibold text-sm text-white transition-colors hover:opacity-90"
            style={{ backgroundColor: "#CC0000" }}
          >
            下一步 →
          </button>
        ) : (
          <div className="w-[88px]" />
        )}
      </div>
    </div>
  );
}
