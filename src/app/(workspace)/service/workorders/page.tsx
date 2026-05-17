"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { DemoBanner } from "@/components/demo-banner";
import {
  useServiceDemo,
  SAFETY_LABEL,
  CATEGORY_LABEL,
} from "@/lib/service-demo/context";

const LU_RATE = 165;

const TABS = [
  { key: "A", label: "A 工單資料" },
  { key: "B", label: "B 維修項目" },
  { key: "C", label: "C 領料單" },
  { key: "D", label: "D 電子打卡" },
  { key: "E", label: "E 竣工複檢" },
  { key: "F", label: "F 授權簽名" },
];

const WARRANTY_TYPES = [
  "PRED", "NORM", "ACCE", "SPAR", "WCRC", "4EVR", "RED1", "RED2", "GWIL", "CARE",
];

interface PartConfirm {
  id: string;
  time: string;
}

interface ClockRecord {
  id: string;
  startTime: string;
  endTime: string;
}

const PARTS_DATA = [
  {
    id: "part-001",
    partNo: "DUC-OIL-5W40",
    name: "Motul 5W-40 機油",
    spec: "1L",
    qty: 3,
    unit: "瓶",
    storageSign: "✓ 王倉管",
  },
  {
    id: "part-002",
    partNo: "DUC-BRK-F01",
    name: "前煞車來令片",
    spec: "Panigale V4",
    qty: 1,
    unit: "組",
    storageSign: "✓ 王倉管",
  },
];

const CLOCK_LABELS = ["前煞車來令片更換", "機油更換", "備用工項"];

function nowTime() {
  return new Date().toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function Field({
  label,
  value,
  disabled,
}: {
  label: string;
  value: string;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="block text-xs text-neutral-500 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        readOnly={disabled}
        disabled={disabled}
        className="w-full px-3 py-2 rounded-lg text-sm border border-neutral-200 bg-white disabled:bg-neutral-50 disabled:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
      />
    </div>
  );
}

export default function WorkordersPage() {
  useSetPageHeader({
    breadcrumb: [{ label: "維修管理" }, { label: "維修工單" }],
    hideSearch: true,
  });

  const { state, dispatch } = useServiceDemo();
  const { pi, ro, inspection } = state;
  const router = useRouter();

  const [activeTab, setActiveTab] = useState(0);
  const [role, setRole] = useState<"sa" | "tech">("sa");

  // Tab A
  const [warrantyType, setWarrantyType] = useState("");
  const [youtechNo, setYoutechNo] = useState("");

  // Tab B — SA 追加項目
  const [addName, setAddName] = useState("");
  const [addLU, setAddLU] = useState("");
  const [addParts, setAddParts] = useState("");
  const [addPartNo, setAddPartNo] = useState("");
  const [extraItems, setExtraItems] = useState<
    { id: string; name: string; lu: number; partsCost: number; partNumber: string }[]
  >([]);

  // Tab C — 領料確認
  const [confirmedParts, setConfirmedParts] = useState<PartConfirm[]>([]);

  // Tab D — 打卡
  const [clockRecords, setClockRecords] = useState<ClockRecord[]>([
    { id: "clk-001", startTime: "", endTime: "" },
    { id: "clk-002", startTime: "", endTime: "" },
    { id: "clk-003", startTime: "", endTime: "" },
  ]);

  // Tab F — 第二次簽名
  const [signed2, setSigned2] = useState(false);

  const isSA = role === "sa";

  // 費用計算
  const agreedItems = pi.techItems.filter((t) => t.decision === "agreed");
  const laborCost = [...agreedItems, ...extraItems]
    .reduce((a, item) => a + item.lu * LU_RATE, 0);
  const partsCostTotal = [...agreedItems, ...extraItems]
    .reduce((a, item) => a + item.partsCost, 0);
  const subtotal = laborCost + partsCostTotal;
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + tax;

  function confirmPart(partId: string) {
    if (confirmedParts.find((p) => p.id === partId)) return;
    setConfirmedParts((prev) => [...prev, { id: partId, time: nowTime() }]);
    dispatch({ type: "RO_ISSUE_PARTS" });
  }

  function clockIn(idx: number) {
    setClockRecords((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, startTime: nowTime() } : r))
    );
    dispatch({ type: "RO_CLOCK_IN" });
  }

  function clockOut(idx: number) {
    setClockRecords((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, endTime: nowTime() } : r))
    );
    dispatch({ type: "RO_CLOCK_OUT" });
  }

  function addExtraItem() {
    if (!addName.trim()) return;
    setExtraItems((prev) => [
      ...prev,
      {
        id: `extra-${Date.now()}`,
        name: addName,
        lu: Number(addLU) || 0,
        partsCost: Number(addParts) || 0,
        partNumber: addPartNo,
      },
    ]);
    setAddName("");
    setAddLU("");
    setAddParts("");
    setAddPartNo("");
  }

  const headerBg = isSA ? "bg-[#1C2B4B]" : "bg-[#2C4A1A]";

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <DemoBanner href="/parts/aftersales/repair-orders" hrefLabel="改前往工單真實版本" />
      {/* Header bar */}
      <div
        className={`${headerBg} text-white rounded-xl px-5 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3`}
      >
        <div>
          <div className="text-lg font-bold tracking-wide">工單 {ro.roNo}</div>
          <div className="text-sm text-white/70 mt-0.5">
            SA：{ro.sa}　技師：{ro.technician}
          </div>
        </div>
        <div className="flex items-center gap-1 bg-white/10 rounded-lg p-1 self-start sm:self-auto">
          <button
            onClick={() => setRole("sa")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              isSA ? "bg-white text-[#1C2B4B]" : "text-white/70 hover:text-white"
            }`}
          >
            SA 視角
          </button>
          <button
            onClick={() => setRole("tech")}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              !isSA ? "bg-white text-[#2C4A1A]" : "text-white/70 hover:text-white"
            }`}
          >
            技師視角
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto bg-neutral-100 rounded-xl p-1">
        {TABS.map((t, i) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(i)}
            className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              activeTab === i
                ? "bg-white text-[#1C2B4B] shadow-sm"
                : "text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Tab A：工單資料 ── */}
      {activeTab === 0 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <h3 className="font-semibold text-neutral-800 mb-4">車主與車輛資訊</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-3">
                <Field label="車主姓名" value={pi.customer.name} disabled={!isSA} />
                <Field label="聯絡電話" value={pi.customer.phone} disabled={!isSA} />
                <Field label="進廠日期" value={pi.date} disabled={!isSA} />
                <Field label="SA 名稱" value={ro.sa} disabled={!isSA} />
              </div>
              <div className="space-y-3">
                <Field label="車型" value={pi.vehicle.model} disabled={!isSA} />
                <Field label="車牌" value={pi.vehicle.plate} disabled={!isSA} />
                <Field label="VIN" value={pi.vehicle.vin} disabled={!isSA} />
                <Field
                  label="進廠里程"
                  value={`${pi.vehicle.mileage.toLocaleString()} km`}
                  disabled={!isSA}
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-neutral-800">工單設定</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-neutral-500 mb-1">RO 工單編號</label>
                <div className="px-3 py-2 bg-neutral-50 rounded-lg text-sm text-neutral-700 border border-neutral-200 font-mono">
                  {ro.roNo}
                </div>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">
                  YouTech 編號（保固索賠）
                </label>
                <input
                  type="text"
                  value={youtechNo}
                  onChange={(e) => setYoutechNo(e.target.value)}
                  disabled={!isSA}
                  placeholder="留白（非保固索賠）"
                  className="w-full px-3 py-2 rounded-lg text-sm border border-neutral-200 bg-white disabled:bg-neutral-50 disabled:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">保固索賠類型</label>
                <select
                  value={warrantyType}
                  onChange={(e) => setWarrantyType(e.target.value)}
                  disabled={!isSA}
                  className="w-full px-3 py-2 rounded-lg text-sm border border-neutral-200 bg-white disabled:bg-neutral-50 disabled:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                >
                  <option value="">— 選擇類型 —</option>
                  {WARRANTY_TYPES.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-neutral-500 mb-1">關聯 PI 編號</label>
                <div className="px-3 py-2 bg-neutral-50 rounded-lg text-sm text-neutral-400 border border-neutral-200 font-mono">
                  {pi.piNo}
                </div>
              </div>
            </div>
            {!isSA && (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-2 text-sm text-neutral-500">
                技師視角：工單資料唯讀，如需修改請聯絡 SA
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Tab B：維修項目 ── */}
      {activeTab === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <h3 className="font-semibold text-neutral-800 mb-3">已同意維修項目</h3>
            {agreedItems.some((it) => it.safetyLevel === "critical") && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 font-medium mb-3">
                ⚠️ 含 🔴 立即必修項目，售後主管須親自介入！
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-700 mb-4">
              此項目不可更改，若車主現場要求刪除請至 Tab C 領料單操作
            </div>
            <div className="space-y-3">
              {agreedItems.map((item) => (
                <div
                  key={item.id}
                  className="border border-neutral-200 rounded-xl p-4"
                >
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600">
                      {CATEGORY_LABEL[item.category]}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border ${
                        item.safetyLevel === "critical"
                          ? "bg-red-100 text-red-700 border-red-300"
                          : item.safetyLevel === "near_term"
                          ? "bg-amber-100 text-amber-700 border-amber-300"
                          : "bg-green-100 text-green-700 border-green-300"
                      }`}
                    >
                      {SAFETY_LABEL[item.safetyLevel]}
                    </span>
                  </div>
                  <div className="font-medium text-neutral-800 mb-1">{item.title}</div>
                  <div className="text-sm text-neutral-500 mb-2">{item.diagnosis}</div>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <span className="font-mono text-orange-600 bg-orange-50 px-2 py-0.5 rounded">
                      {item.partNumber}
                    </span>
                    <span className="text-neutral-600">
                      工時：{item.lu} LU（${(item.lu * LU_RATE).toLocaleString()}）
                    </span>
                    <span className="text-neutral-600">
                      零件：${item.partsCost.toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {isSA && (
            <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
              <h3 className="font-semibold text-neutral-800 mb-3">SA 追加項目</h3>
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-neutral-500 mb-2 px-1">
                <div className="col-span-4">項目名稱</div>
                <div className="col-span-2">LU</div>
                <div className="col-span-3">零件費</div>
                <div className="col-span-3">物料代碼</div>
              </div>
              <div className="grid grid-cols-12 gap-2">
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="項目名稱"
                  className="col-span-4 px-2 py-1.5 rounded-lg text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
                <input
                  type="number"
                  value={addLU}
                  onChange={(e) => setAddLU(e.target.value)}
                  placeholder="LU"
                  className="col-span-2 px-2 py-1.5 rounded-lg text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
                <input
                  type="number"
                  value={addParts}
                  onChange={(e) => setAddParts(e.target.value)}
                  placeholder="零件費"
                  className="col-span-3 px-2 py-1.5 rounded-lg text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
                <input
                  type="text"
                  value={addPartNo}
                  onChange={(e) => setAddPartNo(e.target.value)}
                  placeholder="物料代碼"
                  className="col-span-2 px-2 py-1.5 rounded-lg text-sm border border-neutral-200 focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
              </div>
              <button
                onClick={addExtraItem}
                className="mt-2 px-4 py-1.5 bg-[#1C2B4B] text-white rounded-lg text-sm font-medium hover:bg-[#2a3f6e] transition-colors"
              >
                + 新增
              </button>
              {extraItems.length > 0 && (
                <div className="mt-3 space-y-2">
                  {extraItems.map((e) => (
                    <div
                      key={e.id}
                      className="flex flex-wrap gap-3 items-center px-3 py-2 bg-neutral-50 rounded-lg text-sm"
                    >
                      <span className="font-medium text-neutral-700">{e.name}</span>
                      <span className="font-mono text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded text-xs">
                        {e.partNumber}
                      </span>
                      <span className="text-neutral-500">{e.lu} LU</span>
                      <span className="text-neutral-500">${e.partsCost.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 費用摘要 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 sticky bottom-4">
            <h3 className="font-semibold text-neutral-800 mb-3">費用摘要</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>工時費</span>
                <span>${laborCost.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>零件費</span>
                <span>${partsCostTotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-medium text-neutral-700 border-t border-neutral-100 pt-2 mt-2">
                <span>小計</span>
                <span>${subtotal.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>稅（5%）</span>
                <span>${tax.toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-base text-[#CC0000] border-t border-neutral-200 pt-2 mt-2">
                <span>總計</span>
                <span>${total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab C：領料單 ── */}
      {activeTab === 2 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 space-y-1">
              <p className="font-medium">🔵 領料流程說明</p>
              <p className="text-xs text-blue-600 leading-relaxed">
                依據本工單維修項目，技師持 RO 工單號（{ro.roNo}）前往零件庫房領料。零件專員確認出庫後簽名，技師確認領取後簽名，數據自動回傳至本工單。
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {[
                    "料號",
                    "零件名稱",
                    "規格",
                    "數量",
                    "狀態",
                    "倉管簽名",
                    "技師確認",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-3 py-2.5 text-xs font-medium text-neutral-500 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {PARTS_DATA.map((part) => {
                  const confirmed = confirmedParts.find((p) => p.id === part.id);
                  return (
                    <tr key={part.id} className="hover:bg-neutral-50">
                      <td className="px-3 py-3 font-mono text-orange-600 text-xs">
                        {part.partNo}
                      </td>
                      <td className="px-3 py-3 font-medium text-neutral-800">
                        {part.name}
                      </td>
                      <td className="px-3 py-3 text-neutral-500">{part.spec}</td>
                      <td className="px-3 py-3 text-neutral-700">
                        {part.qty} {part.unit}
                      </td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                          已出庫
                        </span>
                      </td>
                      <td className="px-3 py-3 text-neutral-600">{part.storageSign}</td>
                      <td className="px-3 py-3">
                        {confirmed ? (
                          <span className="text-green-600 text-xs font-medium">
                            ✓ 張偉 已確認 {confirmed.time}
                          </span>
                        ) : !isSA ? (
                          <button
                            onClick={() => confirmPart(part.id)}
                            className="px-3 py-1 bg-[#2C4A1A] text-white rounded-lg text-xs font-medium hover:bg-[#3a6022] transition-colors"
                          >
                            技師確認收料
                          </button>
                        ) : (
                          <span className="text-neutral-400 text-xs">等待技師確認</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Tab D：電子打卡 ── */}
      {activeTab === 3 && (
        <div className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 leading-relaxed">
            <p className="font-medium mb-1">⚠️ 電子打卡強制規定（2024 年起）</p>
            <p className="text-xs text-amber-700">
              所有保固維修作業必須使用防竄改電子系統記錄開始 / 結束時間，稽核時若缺少打卡記錄，工時費將被追回。
            </p>
          </div>
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-800">工項打卡記錄</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200">
                <tr>
                  {["工項", "開始時間", "結束時間", "實際工時"].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-2.5 text-xs font-medium text-neutral-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {clockRecords.map((rec, idx) => {
                  const label = CLOCK_LABELS[idx];
                  const isSpare = idx === 2;
                  let actualMin: number | null = null;
                  if (rec.startTime && rec.endTime) {
                    const [sh, sm] = rec.startTime.split(":").map(Number);
                    const [eh, em] = rec.endTime.split(":").map(Number);
                    const diff = eh * 60 + em - (sh * 60 + sm);
                    if (diff > 0) actualMin = diff;
                  }
                  return (
                    <tr key={rec.id} className={isSpare ? "opacity-40" : ""}>
                      <td className="px-4 py-3 font-medium text-neutral-800">{label}</td>
                      <td className="px-4 py-3">
                        {rec.startTime ? (
                          <span className="text-green-600 font-medium">{rec.startTime}</span>
                        ) : !isSA ? (
                          <button
                            onClick={() => clockIn(idx)}
                            disabled={isSpare}
                            className="px-3 py-1 bg-[#2C4A1A] text-white rounded-lg text-xs font-medium hover:bg-[#3a6022] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            打卡開始
                          </button>
                        ) : (
                          <span className="text-neutral-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {rec.endTime ? (
                          <span className="text-red-600 font-medium">{rec.endTime}</span>
                        ) : rec.startTime && !isSA ? (
                          <button
                            onClick={() => clockOut(idx)}
                            className="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 transition-colors"
                          >
                            打卡結束
                          </button>
                        ) : (
                          <span className="text-neutral-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-neutral-600">
                        {actualMin != null ? `${actualMin} 分鐘` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!isSA && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-700">
              <div className="font-medium mb-1">下一步提示</div>
              <span>完成打卡後，請前往竣工複檢</span>
              <button
                onClick={() => router.push("/service/inspection")}
                className="ml-3 px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
              >
                前往竣工複檢 →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Tab E：竣工複檢 ── */}
      {activeTab === 4 && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700 mb-4 leading-relaxed">
              <p className="font-medium mb-1">🛡️ 竣工複檢說明</p>
              <p className="text-xs text-blue-600">
                技師完成施工並打卡後，由具有授權資格的人員（售後主管或資深技師）執行竣工複檢，確認所有維修項目符合品質標準後方可通知車主取車。
              </p>
            </div>
            <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 text-sm text-neutral-600 mb-4">
              此環節移至「竣工複檢」頁面由主管或資深技師執行
            </div>
            {!inspection.signed ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 bg-amber-50 border border-amber-200 rounded-xl px-4 py-4">
                  <div className="text-amber-700 font-medium">⏳ 等待竣工複檢完成</div>
                  <div className="text-sm text-amber-600 mt-1">
                    請技師前往竣工複檢頁面完成簽核
                  </div>
                </div>
                <button
                  onClick={() => router.push("/service/inspection")}
                  className="px-4 py-2 bg-[#1C2B4B] text-white rounded-lg text-sm font-medium hover:bg-[#2a3f6e] transition-colors whitespace-nowrap"
                >
                  前往竣工複檢 →
                </button>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-4">
                <div className="text-green-700 font-semibold">✅ 竣工複檢已完成</div>
                <div className="text-sm text-green-600 mt-1">
                  簽核人：技師　時間：{inspection.signedAt}
                </div>
              </div>
            )}
          </div>

          <button
            disabled={!inspection.signed}
            onClick={() => router.push("/service/inspection")}
            className={`w-full py-3 rounded-xl font-semibold text-base transition-colors ${
              inspection.signed
                ? "bg-[#CC0000] text-white hover:bg-[#a80000]"
                : "bg-neutral-200 text-neutral-400 cursor-not-allowed"
            }`}
          >
            通知取車
          </button>
          {!inspection.signed && (
            <div className="text-xs text-center text-neutral-400">
              須完成竣工複檢後才可通知取車
            </div>
          )}
        </div>
      )}

      {/* ── Tab F：授權簽名 ── */}
      {activeTab === 5 && (
        <div className="space-y-4">
          {/* 第一次簽名說明 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-700">
              <div className="font-semibold mb-0.5">第一次簽名已完成</div>
              預檢單 {pi.piNo} 完成車況交接確認 + 報價同意
            </div>
          </div>

          {/* 追加項目記錄 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <h3 className="font-semibold text-[#1C2B4B] mb-3">追加項目記錄</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200">
                  <tr>
                    {[
                      "NO.",
                      "追加項目說明",
                      "時間",
                      "車主確認方式",
                      "金額",
                      "SA 確認",
                    ].map((h) => (
                      <th
                        key={h}
                        className="text-left px-3 py-2 text-xs font-medium text-neutral-500 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {extraItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-3 py-6 text-center text-neutral-400 text-sm"
                      >
                        此次無追加項目
                      </td>
                    </tr>
                  ) : (
                    extraItems.map((e, idx) => (
                      <tr key={e.id} className="border-b border-neutral-100">
                        <td className="px-3 py-2 text-neutral-500">{idx + 1}</td>
                        <td className="px-3 py-2 text-neutral-800">{e.name}</td>
                        <td className="px-3 py-2 text-neutral-500 whitespace-nowrap">
                          —
                        </td>
                        <td className="px-3 py-2 text-neutral-500">電話確認</td>
                        <td className="px-3 py-2 text-neutral-700">
                          ${e.partsCost.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-green-600 text-xs">
                          ✓ {ro.sa}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* 第二次簽名 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5">
            <h3 className="font-semibold text-[#CC0000] mb-3">
              【第二次簽名】維修授權
            </h3>
            <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm text-orange-700 mb-4">
              車主於此確認同意本次維修項目與費用，簽名具法律效力。
              <br />
              請車主本人或授權代理人完成電子簽名。
            </div>

            {!isSA ? (
              <div className="bg-neutral-50 border border-neutral-200 rounded-lg px-4 py-3 text-sm text-neutral-500">
                技師視角：授權簽名由 SA 操作
              </div>
            ) : signed2 ? (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                <div className="text-green-700 font-semibold text-sm">
                  ✓ {pi.customer.name} 已授權
                </div>
              </div>
            ) : (
              <div
                onClick={() => setSigned2(true)}
                className="border-2 border-dashed border-neutral-300 rounded-xl px-6 py-10 text-center cursor-pointer hover:border-[#CC0000] hover:bg-red-50 transition-colors group"
              >
                <div className="text-4xl mb-2 text-neutral-300 group-hover:text-[#CC0000]">
                  ✍
                </div>
                <div className="text-neutral-500 group-hover:text-[#CC0000] font-medium text-sm">
                  點擊電子簽名
                </div>
              </div>
            )}

            <div className="mt-3 text-xs text-neutral-400">
              依 SRV-SRB-26-014（2026.03）本電子簽名與手寫簽名具同等法律效力
            </div>
          </div>
        </div>
      )}

      {/* 底部 Tab 導航 */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={() => setActiveTab((prev) => Math.max(0, prev - 1))}
          disabled={activeTab === 0}
          className="flex-1 py-2.5 rounded-xl border border-neutral-200 text-sm font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ← 前一項
        </button>
        <button
          onClick={() =>
            setActiveTab((prev) => Math.min(TABS.length - 1, prev + 1))
          }
          disabled={activeTab === TABS.length - 1}
          className="flex-1 py-2.5 rounded-xl bg-[#1C2B4B] text-white text-sm font-medium hover:bg-[#2a3f6e] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          下一項 →
        </button>
      </div>
    </div>
  );
}
