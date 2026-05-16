"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import {
  useServiceDemo,
  SAFETY_LABEL,
  SAFETY_COLOR,
  DROPOFF_STATUS_LABEL,
  DROPOFF_STATUS_COLOR,
  type DropoffCase,
} from "@/lib/service-demo/context";

const TABS = ["SA 個人", "技師個人", "售後主管", "零件庫房"];

// ── 技師月明細（靜態 demo 資料）────────────────────────────
const TECH_MONTHLY = [
  {
    plate: "ZZX-5566",
    item: "前煞車來令片",
    safety: "critical" as const,
    decision: "同意",
    status: "已執行",
  },
  {
    plate: "ZZX-5566",
    item: "後鏈條鬆動",
    safety: "near_term" as const,
    decision: "拒絕",
    status: "追蹤中",
  },
  {
    plate: "ABX-1234",
    item: "後輪胎磨耗",
    safety: "critical" as const,
    decision: "拒絕",
    status: "追蹤中",
  },
  {
    plate: "XYZ-9988",
    item: "電瓶老化",
    safety: "advisory" as const,
    decision: "拒絕",
    status: "追蹤中",
  },
];

// ── 主管介入 demo 案件 ────────────────────────────────────
const MANAGER_CASES = [
  {
    id: "mc-001",
    customer: "陳大偉",
    plate: "ABX-1234",
    item: "後輪胎更換（胎紋剩餘 1.5mm）",
    daysOut: 8,
    note: "拒絕未修",
  },
];

// ── 零件庫房靜態資料 ──────────────────────────────────────
const PARTS_SHORTAGE = [
  { name: "後輪胎", rate: 30, level: "critical" as const, suggestion: "建議提高安全庫存" },
  { name: "煞車來令片", rate: 15, level: "near_term" as const, suggestion: "建議關注" },
  { name: "機油", rate: 5, level: "advisory" as const, suggestion: "正常" },
];

const LOST_SALES = [
  { label: "DIY 自行處理", pct: 20 },
  { label: "他店維修", pct: 35 },
  { label: "暫不處理", pct: 30 },
  { label: "事後回廠", pct: 15 },
];

const LOST_SALE_COLORS = ["bg-amber-500", "bg-red-500", "bg-neutral-400", "bg-blue-500"];

// ── Modal 型別 ────────────────────────────────────────────
type ContactResult = "接通" | "未接" | "預約回廠" | "戰敗";

interface ContactModal {
  caseId: string;
  result: ContactResult | "";
  scheduledDate: string;
}

interface ManagerModal {
  caseId: string;
  contactMethod: string;
  ownerResponse: string;
}

export default function DropoffPage() {
  useSetPageHeader({
    breadcrumb: [{ label: "維修管理" }, { label: "增項管理" }],
    hideSearch: true,
  });

  const { state, dispatch } = useServiceDemo();
  const [tab, setTab] = useState(0);

  // Contact modal state
  const [contactModal, setContactModal] = useState<ContactModal | null>(null);
  const [managerModal, setManagerModal] = useState<ManagerModal | null>(null);

  function openContactModal(caseId: string) {
    setContactModal({ caseId, result: "", scheduledDate: "" });
  }

  function submitContact() {
    if (!contactModal) return;
    const { caseId, result, scheduledDate } = contactModal;
    if (result === "預約回廠" && scheduledDate) {
      dispatch({ type: "DROPOFF_SCHEDULE", id: caseId, date: scheduledDate });
    } else if (result === "接通" || result === "未接") {
      dispatch({ type: "DROPOFF_D3_CONTACT", id: caseId, note: `記錄：${result}` });
    } else if (result === "戰敗") {
      dispatch({ type: "DROPOFF_RECOVER", id: caseId }); // reuse recover for demo
    }
    setContactModal(null);
  }

  // ── SA KPI 計算 ──────────────────────────────────────────
  const total = state.dropoffCases.length;
  const scheduled = state.dropoffCases.filter((c) => c.status === "scheduled").length;
  const recovered = state.dropoffCases.filter((c) => c.status === "recovered").length;
  const overdue = state.dropoffCases.filter(
    (c) => c.daysOut > 10 && c.status !== "recovered" && c.status !== "lost"
  ).length;

  // 今日待聯繫（D+3 open）
  const pendingContact = state.dropoffCases.filter(
    (c) => c.status === "open" && c.daysOut <= 3
  );

  function SafetyBadge({ level }: { level: "critical" | "near_term" | "advisory" }) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${SAFETY_COLOR[level]}`}
      >
        {SAFETY_LABEL[level]}
      </span>
    );
  }

  function StatusBadge({ status }: { status: DropoffCase["status"] }) {
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${DROPOFF_STATUS_COLOR[status]}`}
      >
        {DROPOFF_STATUS_LABEL[status]}
      </span>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      {/* Header */}
      <div
        className="rounded-xl px-5 py-4"
        style={{ backgroundColor: "#1A3A5C" }}
      >
        <h1 className="text-white font-bold text-lg">增項管理（追加項目記錄）</h1>
        <p className="text-white text-xs opacity-70 mt-0.5">
          落地追蹤 · SA 績效 · 技師發現率 · 庫存分析
        </p>
      </div>

      {/* v2 流程說明 banner */}
      <div className="bg-green-50 border border-green-300 rounded-lg px-4 py-2.5 text-sm text-green-800 flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs sm:text-sm">
          🔗 車主同意時：庫存自動預留備料 ｜ 拒絕時：觸發增項閉環追蹤（D+3 / D+10）
        </span>
        <span className="text-[11px] text-green-700">★2 跨模組 e2e 串接 → 備件預留</span>
      </div>
      <div className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2.5 text-xs text-amber-800 leading-relaxed">
        <p className="font-medium">⚠️ 技師在維修過程中發現額外問題，需要車主確認是否同意追加</p>
        <p className="text-[11px] text-amber-700 mt-0.5">
          確認方式：📞 電話口頭確認 / 👤 現場本人確認 / 💬 Line 文字確認 — 任一即可建立追加記錄
        </p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-neutral-200 bg-white rounded-t-xl overflow-hidden">
        {TABS.map((label, i) => (
          <button
            key={i}
            onClick={() => setTab(i)}
            className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
              tab === i
                ? "border-[#CC0000] text-[#CC0000]"
                : "border-transparent text-neutral-500 hover:text-neutral-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Tab 0：SA 個人 ── */}
      {tab === 0 && (
        <div className="space-y-4">
          {/* KPI 卡片 */}
          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: "增項提報率",
                value: "3/3 台",
                sub: "100%",
                color: "text-green-600",
                bg: "bg-green-50",
              },
              {
                label: "提報成交率",
                value: "2/3",
                sub: "67%",
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
              {
                label: "追回率",
                value: `${recovered}/${total}`,
                sub: "待觀察",
                color: "text-neutral-500",
                bg: "bg-neutral-50",
              },
              {
                label: "逾期未聯繫",
                value: overdue === 0 ? "0" : String(overdue),
                sub: overdue === 0 ? "全部正常" : `${overdue} 件`,
                color: overdue === 0 ? "text-green-600" : "text-red-600",
                bg: overdue === 0 ? "bg-green-50" : "bg-red-50",
              },
            ].map((card) => (
              <div
                key={card.label}
                className={`${card.bg} rounded-xl border border-neutral-200 p-4`}
              >
                <p className="text-xs text-neutral-500 mb-1">{card.label}</p>
                <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
                <p className={`text-xs mt-0.5 ${card.color}`}>{card.sub}</p>
              </div>
            ))}
          </div>

          {/* 今日待聯繫 */}
          {pendingContact.length > 0 && (
            <div className="bg-white rounded-xl border-2 border-red-200 p-4 space-y-3">
              <h3 className="font-semibold text-red-700 text-sm flex items-center gap-2">
                🔴 今日待聯繫（D+3 到期）
              </h3>
              {pendingContact.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 bg-red-50 rounded-xl px-4 py-3"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-neutral-800 text-sm">
                      {c.customerName} · {c.plate}
                    </p>
                    <p className="text-neutral-600 text-xs mt-0.5">{c.item}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <SafetyBadge level={c.safetyLevel} />
                      <span className="text-xs text-neutral-500">D+{c.daysOut} 到期</span>
                      <span className="text-xs text-[#CC0000] font-medium">
                        NT$ {c.amount.toLocaleString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => openContactModal(c.id)}
                    className="px-3 py-2 text-xs font-semibold bg-[#CC0000] text-white rounded-lg hover:opacity-90 transition-opacity shrink-0"
                  >
                    記錄聯繫結果
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 追蹤中案件列表 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-800 text-sm">
                追蹤中案件（{state.dropoffCases.length} 件）
              </h3>
            </div>
            <div className="divide-y divide-neutral-100">
              {state.dropoffCases.map((c) => (
                <div
                  key={c.id}
                  className="px-5 py-4 flex items-center justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-neutral-400">{c.caseNo}</span>
                      <SafetyBadge level={c.safetyLevel} />
                      <StatusBadge status={c.status} />
                    </div>
                    <p className="font-medium text-neutral-800 text-sm mt-1">
                      {c.customerName} · {c.plate}
                    </p>
                    <p className="text-neutral-500 text-xs mt-0.5">{c.item}</p>
                    <p className="text-neutral-400 text-xs mt-0.5">
                      離廠 D+{c.daysOut}
                      {c.scheduledDate && (
                        <span className="text-blue-600">預約：{c.scheduledDate}</span>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm font-semibold text-neutral-700">
                      NT$ {c.amount.toLocaleString()}
                    </span>
                    {c.status !== "recovered" && c.status !== "lost" && (
                      <button
                        onClick={() => openContactModal(c.id)}
                        className="px-3 py-1.5 text-xs font-semibold border border-neutral-300 text-neutral-700 rounded-lg hover:bg-neutral-50 transition-colors"
                      >
                        記錄
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 1：技師個人 ── */}
      {tab === 1 && (
        <div className="space-y-4">
          {/* KPI */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-neutral-500 mb-1">增項發現率</p>
              <p className="text-xl font-bold text-blue-700">3 / 4 台</p>
              <p className="text-xs text-blue-600 mt-0.5">75%</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <p className="text-xs text-neutral-500 mb-1">安全等級項目</p>
              <p className="text-xl font-bold text-red-700">1 項</p>
              <p className="text-xs text-red-600 mt-0.5">🔴 本月立即必修</p>
            </div>
          </div>

          {/* 本月明細表 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-800 text-sm">本月發現增項明細</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-neutral-500">車牌</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-neutral-500">發現項目</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-neutral-500">安全等級</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-neutral-500">車主決定</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-neutral-500">後續狀態</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {TECH_MONTHLY.map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-neutral-600">
                        {row.plate}
                      </td>
                      <td className="px-4 py-3 text-neutral-800 font-medium">{row.item}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium border ${SAFETY_COLOR[row.safety]}`}
                        >
                          {SAFETY_LABEL[row.safety]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold ${
                            row.decision === "同意" ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {row.decision}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium ${
                            row.status === "已執行"
                              ? "text-green-600"
                              : "text-amber-600"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Tab 2：售後主管 ── */}
      {tab === 2 && (
        <div className="space-y-4">
          {/* 安全警示 */}
          <div className="bg-white rounded-xl border-2 border-red-300 p-4 space-y-3">
            <h3 className="font-semibold text-red-700 flex items-center gap-2">
              🔴 安全等級警示 — 需主管介入
              <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                {MANAGER_CASES.length}
              </span>
            </h3>
            {MANAGER_CASES.map((mc) => (
              <div
                key={mc.id}
                className="flex items-center justify-between gap-3 bg-red-50 rounded-xl px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-neutral-800 text-sm">
                    {mc.customer} · {mc.plate}
                  </p>
                  <p className="text-neutral-600 text-xs mt-0.5">{mc.item}</p>
                  <p className="text-red-600 text-xs mt-1">
                    D+{mc.daysOut}　{mc.note}
                  </p>
                </div>
                <button
                  onClick={() =>
                    setManagerModal({
                      caseId: mc.id,
                      contactMethod: "",
                      ownerResponse: "",
                    })
                  }
                  className="px-3 py-2 text-xs font-semibold bg-red-600 text-white rounded-lg hover:opacity-90 transition-opacity shrink-0"
                >
                  主管介入
                </button>
              </div>
            ))}
          </div>

          {/* SA 績效比較表 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-neutral-100">
              <h3 className="font-semibold text-neutral-800 text-sm">SA 績效比較（本月）</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-neutral-50 text-left">
                    {["SA", "接車台", "提報台", "成交率", "追回率", "逾期"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-xs font-medium text-neutral-500"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {[
                    {
                      sa: "林志遠",
                      recv: 12,
                      report: 10,
                      success: "70%",
                      recover: "50%",
                      overdue: 0,
                    },
                    {
                      sa: "陳美玲",
                      recv: 8,
                      report: 6,
                      success: "60%",
                      recover: "33%",
                      overdue: 1,
                    },
                  ].map((row, i) => (
                    <tr key={i} className="hover:bg-neutral-50 transition-colors">
                      <td className="px-4 py-3 font-semibold text-neutral-800">{row.sa}</td>
                      <td className="px-4 py-3 text-neutral-600">{row.recv}</td>
                      <td className="px-4 py-3 text-neutral-600">{row.report}</td>
                      <td className="px-4 py-3 text-green-600 font-medium">{row.success}</td>
                      <td className="px-4 py-3 text-amber-600 font-medium">{row.recover}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-semibold ${
                            row.overdue === 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {row.overdue === 0 ? "0 ✓" : `${row.overdue} ⚠`}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 逾期未聯繫清單 */}
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 space-y-2">
            <h3 className="font-semibold text-orange-800 text-sm">⚠ 逾期未聯繫清單（2 件）</h3>
            {state.dropoffCases
              .filter((c) => c.daysOut > 10 && c.status !== "recovered")
              .map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-orange-200"
                >
                  <div>
                    <p className="font-medium text-neutral-800 text-sm">
                      {c.customerName} · {c.plate}
                    </p>
                    <p className="text-neutral-500 text-xs">{c.item}</p>
                  </div>
                  <span className="text-orange-700 text-xs font-semibold">D+{c.daysOut}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Tab 3：零件庫房 ── */}
      {tab === 3 && (
        <div className="space-y-4">
          {/* 缺料比例分析 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-4">
            <h3 className="font-semibold text-neutral-800">缺料比例分析</h3>
            <div className="space-y-3">
              {PARTS_SHORTAGE.map((part) => (
                <div key={part.name}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-neutral-700 font-medium">{part.name}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium ${
                          part.level === "critical"
                            ? "text-red-600"
                            : part.level === "near_term"
                            ? "text-amber-600"
                            : "text-green-600"
                        }`}
                      >
                        缺料 {part.rate}%
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          part.level === "critical"
                            ? "bg-red-100 text-red-700"
                            : part.level === "near_term"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {part.level === "critical"
                          ? "🔴 建議提高安全庫存"
                          : part.level === "near_term"
                          ? "🟡 建議關注"
                          : "🟢 正常"}
                      </span>
                    </div>
                  </div>
                  <div className="h-3 bg-neutral-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        part.level === "critical"
                          ? "bg-red-500"
                          : part.level === "near_term"
                          ? "bg-amber-500"
                          : "bg-green-500"
                      }`}
                      style={{ width: `${part.rate}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 庫存建議清單 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-neutral-800">庫存補充建議</h3>
            <div className="space-y-2">
              <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                <p className="text-xs font-bold text-red-700 mb-2">🔴 急需補充</p>
                <div className="space-y-1">
                  <p className="text-sm text-neutral-800">
                    後輪胎 — <span className="text-red-600">缺料 3 次 / 月</span>
                  </p>
                  <p className="text-sm text-neutral-800">
                    電瓶 — <span className="text-red-600">缺料 2 次 / 月</span>
                  </p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-bold text-amber-700 mb-2">🟡 建議關注</p>
                <p className="text-sm text-neutral-800">
                  前煞車片 —{" "}
                  <span className="text-amber-600">月均用量上升 20%</span>
                </p>
              </div>
            </div>
          </div>

          {/* 失銷去向分析 */}
          <div className="bg-white rounded-xl border border-neutral-200 shadow-sm p-5 space-y-3">
            <h3 className="font-semibold text-neutral-800">失銷去向分析</h3>
            <div className="grid grid-cols-2 gap-3">
              {LOST_SALES.map((item, i) => (
                <div
                  key={i}
                  className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 flex items-center gap-3"
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${LOST_SALE_COLORS[i]}`}
                  />
                  <div>
                    <p className="text-xs text-neutral-500">{item.label}</p>
                    <p className="text-lg font-bold text-neutral-800">{item.pct}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal：聯繫記錄 ── */}
      {contactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-neutral-800 text-lg">記錄聯繫結果</h3>
            <div className="space-y-2">
              {(["已接通", "未接", "預約回廠", "戰敗"] as const).map((opt) => {
                const key = opt === "已接通" ? "接通" : opt;
                return (
                  <button
                    key={opt}
                    onClick={() =>
                      setContactModal((m) =>
                        m ? { ...m, result: key as ContactResult } : m
                      )
                    }
                    className={`w-full text-left px-4 py-3 rounded-xl border text-sm font-medium transition-colors ${
                      contactModal.result === key
                        ? "border-[#CC0000] bg-red-50 text-[#CC0000]"
                        : "border-neutral-200 text-neutral-700 hover:bg-neutral-50"
                    }`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            {contactModal.result === "預約回廠" && (
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">
                  預約回廠日期
                </label>
                <input
                  type="date"
                  value={contactModal.scheduledDate}
                  onChange={(e) =>
                    setContactModal((m) =>
                      m ? { ...m, scheduledDate: e.target.value } : m
                    )
                  }
                  className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
                />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setContactModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 text-sm font-semibold hover:bg-neutral-50"
              >
                取消
              </button>
              <button
                onClick={submitContact}
                disabled={!contactModal.result}
                className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors ${
                  contactModal.result
                    ? "bg-[#CC0000] hover:opacity-90"
                    : "bg-neutral-300 cursor-not-allowed"
                }`}
              >
                確認
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal：主管介入 ── */}
      {managerModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <h3 className="font-bold text-neutral-800 text-lg">主管介入記錄</h3>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">告知方式</label>
              <select
                value={managerModal.contactMethod}
                onChange={(e) =>
                  setManagerModal((m) =>
                    m ? { ...m, contactMethod: e.target.value } : m
                  )
                }
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30"
              >
                <option value="">選擇告知方式</option>
                <option value="電話">電話</option>
                <option value="LINE">LINE 訊息</option>
                <option value="當面">當面告知</option>
                <option value="書面">書面聲明</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-neutral-500 mb-1 block">車主回應</label>
              <textarea
                value={managerModal.ownerResponse}
                onChange={(e) =>
                  setManagerModal((m) =>
                    m ? { ...m, ownerResponse: e.target.value } : m
                  )
                }
                rows={3}
                placeholder="記錄車主回應內容..."
                className="w-full border border-neutral-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC0000]/30 resize-none"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setManagerModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-neutral-300 text-neutral-700 text-sm font-semibold hover:bg-neutral-50"
              >
                取消
              </button>
              <button
                onClick={() => setManagerModal(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#CC0000] text-white text-sm font-semibold hover:opacity-90"
              >
                儲存記錄
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
