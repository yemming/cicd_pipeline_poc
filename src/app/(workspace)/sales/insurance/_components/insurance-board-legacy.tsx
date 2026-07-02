"use client";

import { useMemo, useRef, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import {
  BIKE_MODELS,
  CALL_RESULTS,
  COVERAGE_KEYS,
  DONE_CASES_SEED,
  INS_CASES_SEED,
  INS_PARAMS,
  INSURERS,
  LOST_REASONS,
  NEW_DELIVERIES,
  PERF_LOST_REASONS,
  PERF_RS_ROWS,
  PERF_YEAR_TOTALS,
  QUOTE_STATES,
  RS_LIST,
  buildScripts,
  type InsCase,
  type InsType,
  type InsUrgency,
  type LostReasonOption,
} from "./insurance.constants";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { useActiveBrand } from "@/lib/scope/scope-context";

type TabKey = "renew" | "new" | "perf";
type UrgencyFilter = "all" | InsUrgency;

const URGENCY_LABEL: Record<UrgencyFilter, string> = {
  all: "全部",
  urgent: "🔴 30 天內",
  soon: "🟡 31–90 天",
  far: "🔵 91–180 天",
  done: "✅ 已續保",
};

const DOT_COLOR: Record<UrgencyFilter, string> = {
  all: "#1A3A5C",
  urgent: "#C8001A",
  soon: "#F0C97E",
  far: "#185FA5",
  done: "#0F6E56",
};

const COUNT_PILL: Record<UrgencyFilter, string> = {
  all: "bg-[#F1EFE8] text-[#5A5955]",
  urgent: "bg-[#FDECEA] text-[#C8001A]",
  soon: "bg-[#FDF3E3] text-[#854F0B]",
  far: "bg-[#E1F5EE] text-[#0F6E56]",
  done: "bg-[#E1F5EE] text-[#0F6E56]",
};

const TYPE_BADGE: Record<InsType, string> = {
  新轉續: "bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5]",
  續轉續: "bg-[#EAF4FB] text-[#185FA5] border-[#85B7EB]",
  斷轉續: "bg-[#FDF3E3] text-[#854F0B] border-[#F0C97E]",
  外轉續: "bg-[#EEEDFE] text-[#534AB7] border-[#AFA9EC]",
  在修未投保: "bg-[#FDECEA] text-[#C8001A] border-[#F5AEAD]",
};

const URG_LEFTBAR: Record<InsUrgency, string> = {
  urgent: "border-l-[3px] border-l-[#C8001A]",
  soon: "border-l-[3px] border-l-[#F0C97E]",
  far: "border-l-[3px] border-l-[#185FA5]",
  done: "border-l-[3px] border-l-[#0F6E56] opacity-90",
};

const URG_BOX: Record<InsUrgency, string> = {
  urgent: "bg-[#FDECEA] text-[#C8001A]",
  soon: "bg-[#FDF3E3] text-[#854F0B]",
  far: "bg-[#EAF4FB] text-[#185FA5]",
  done: "bg-[#E1F5EE] text-[#0F6E56]",
};

const EXP_BADGE: Record<InsUrgency, { cls: string; label: (d: number) => string }> = {
  urgent: { cls: "bg-[#FDECEA] text-[#C8001A] border-[#F5AEAD]", label: (d) => `急 ${d} 天` },
  soon: { cls: "bg-[#FDF3E3] text-[#854F0B] border-[#F0C97E]", label: (d) => `近 ${d} 天` },
  far: { cls: "bg-[#EAF4FB] text-[#185FA5] border-[#85B7EB]", label: (d) => `遠 ${d} 天` },
  done: { cls: "bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5]", label: () => "已續保" },
};

type Props = {
  /** BDN #14：流失原因（ROOT CAUSE）字典；由 page.tsx 從 sales_dictionary 撈傳進來 */
  lostReasons?: LostReasonOption[];
};

export default function InsuranceBoard({ lostReasons = [] }: Props = {}) {
  useSetPageHeader({
    title: "RS_EX1 保險招攬工作台",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/overview" },
      { label: "展廳接待" },
      { label: "保險業務" },
    ],
  });

  // Pattern B：client 端動態品牌名，避免話術寫死品牌
  const activeBrand = useActiveBrand();
  const brandName = brandConfigs[activeBrand]?.displayName ?? activeBrand;
  const scripts = buildScripts(brandName);

  const [cases, setCases] = useState<InsCase[]>(() =>
    [...INS_CASES_SEED, ...DONE_CASES_SEED].map((c) => ({ ...c })),
  );
  const [tab, setTab] = useState<TabKey>("renew");
  const [filterRs, setFilterRs] = useState<string>("all");
  const [filterUrg, setFilterUrg] = useState<UrgencyFilter>("all");
  const [navUrg, setNavUrg] = useState<UrgencyFilter>("all");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [scriptIdx, setScriptIdx] = useState<Record<number, number>>({});

  // form per card
  const [formState, setFormState] = useState<
    Record<
      number,
      {
        result?: string;
        nextDate?: string;
        lost?: string;
        lostReasonCode?: string;
        note?: string;
        quote?: string;
        co?: string;
      }
    >
  >({});

  // modal
  const [modalOpen, setModalOpen] = useState(false);
  const [newCase, setNewCase] = useState({
    name: "",
    phone: "",
    plate: "",
    bike: "",
    expiry: "",
    type: "新轉續" as InsType,
    co: "富邦產險",
    rs: "林佳蓉",
    note: "",
  });

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2700);
  }

  const counts = useMemo(() => {
    const c: Record<UrgencyFilter, number> = { all: cases.length, urgent: 0, soon: 0, far: 0, done: 0 };
    cases.forEach((x) => {
      c[x.urgency] += 1;
    });
    return c;
  }, [cases]);

  const filtered = useMemo(() => {
    const cu = navUrg !== "all" ? navUrg : filterUrg;
    return cases
      .filter((c) => (filterRs === "all" || c.rs === filterRs) && (cu === "all" || c.urgency === cu))
      .sort((a, b) => {
        const order = { urgent: 0, soon: 1, far: 2, done: 3 } as const;
        return (order[a.urgency] - order[b.urgency]) || a.daysLeft - b.daysLeft;
      });
  }, [cases, filterRs, filterUrg, navUrg]);

  function toggleCard(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function updateForm(
    id: number,
    patch: Partial<{
      result: string;
      nextDate: string;
      lost: string;
      lostReasonCode: string;
      note: string;
      quote: string;
      co: string;
    }>,
  ) {
    setFormState((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function saveCall(id: number) {
    const f = formState[id] || {};
    if (!f.result) {
      showToast("請先選擇電訪結果");
      return;
    }
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const nextCount = c.callCount + 1;
        const reachedMax = nextCount >= INS_PARAMS.maxCalls && c.urgency !== "done";
        const closed = f.quote === "已成交並出單";
        const histLine = `電訪記錄：${f.result}${f.note ? ` — ${f.note.substring(0, 30)}` : ""}`;
        return {
          ...c,
          callCount: nextCount,
          note: f.note ?? c.note,
          nextDate: f.nextDate ?? c.nextDate,
          lost: f.lost ?? c.lost,
          lostReasonCode: f.lostReasonCode ?? c.lostReasonCode,
          result: f.result,
          urgency: closed ? "done" : c.urgency,
          status: closed ? "done" : reachedMax ? "escalate" : c.status,
          history: [...c.history, { dot: closed ? "teal" : "blue", time: "05-10", text: histLine }],
        };
      }),
    );
    if (f.quote === "已成交並出單") showToast("✅ 已成交出單！恭喜完成保險招攬！");
    else {
      const c = cases.find((x) => x.id === id);
      if (c && c.callCount + 1 >= INS_PARAMS.maxCalls && c.urgency !== "done") showToast("⚠ 已達電訪上限，自動升報主管");
      else showToast(`✅ 電訪記錄已儲存${f.nextDate ? ` · 下次 ${f.nextDate}` : ""}`);
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function skipCase(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    showToast("已略過，請記得安排下次追蹤");
  }

  function addCase() {
    if (!newCase.name || !newCase.phone || !newCase.expiry) {
      showToast("請填寫姓名、電話及到期日");
      return;
    }
    const today = new Date("2026-05-10");
    const exp = new Date(newCase.expiry);
    const days = Math.round((exp.getTime() - today.getTime()) / 86400000);
    const urgency: InsUrgency = days <= 30 ? "urgent" : days <= 90 ? "soon" : "far";
    setCases((prev) => [
      ...prev,
      {
        id: Math.max(0, ...prev.map((c) => c.id)) + 1,
        name: newCase.name,
        phone: newCase.phone,
        plate: newCase.plate || "—",
        bike: newCase.bike || "未填",
        expiry: newCase.expiry,
        daysLeft: days,
        urgency,
        type: newCase.type,
        co: newCase.co,
        rs: newCase.rs,
        status: "pending",
        callCount: 0,
        coverages: { 強制: "YES", 商業: "NO", 車損: "NO", 不計免賠: "NO", 第三人: "YES", 竊盜: "NO", 刮痕: "NO", 玻璃: "NO" },
        history: [{ dot: "amber", time: "05-10", text: "手動新增保險件" }],
        note: newCase.note,
      },
    ]);
    setModalOpen(false);
    setNewCase({ name: "", phone: "", plate: "", bike: "", expiry: "", type: "新轉續", co: "富邦產險", rs: "林佳蓉", note: "" });
    showToast(`✅ 已建立保險件：${newCase.name} · 到期 ${newCase.expiry}`);
  }

  const inputCls = "w-full h-[32px] px-2.5 text-[12px] border border-[#D5D3CB] rounded outline-none focus:border-[#185FA5] bg-white";
  const selectCls = inputCls;
  const labelCls = "text-[11.5px] font-semibold text-[#4A4A48] mb-1";

  return (
    <main className="bg-[#F8F7F4] min-h-screen text-[#2C2C2A] text-[13px]">
      {/* Sub bar — tabs + filters */}
      <div className="bg-white border-b border-[#EEECE6] px-6 py-2 flex items-center gap-2.5 flex-wrap sticky top-0 z-30">
        <div className="flex border border-[#D5D3CB] rounded overflow-hidden">
          {(
            [
              ["renew", "🔔 續保到期提醒"],
              ["new", "🆕 新車交車招攬"],
              ["perf", "📊 業績總覽"],
            ] as const
          ).map(([key, label], i, arr) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 h-[28px] text-[12px] whitespace-nowrap transition-colors ${i < arr.length - 1 ? "border-r border-[#D5D3CB]" : ""} ${
                tab === key ? "bg-[#1A3A5C] text-white" : "bg-white text-[#7A7A78] hover:bg-[#F4F3F0]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="w-px h-[18px] bg-[#EEECE6]" />
        <select className="h-[28px] px-2.5 text-[12px] border border-[#D5D3CB] rounded bg-white" value={filterRs} onChange={(e) => setFilterRs(e.target.value)}>
          <option value="all">全體 RS</option>
          {RS_LIST.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          className="h-[28px] px-2.5 text-[12px] border border-[#D5D3CB] rounded bg-white"
          value={filterUrg}
          onChange={(e) => setFilterUrg(e.target.value as UrgencyFilter)}
        >
          {(["all", "urgent", "soon", "far", "done"] as UrgencyFilter[]).map((k) => (
            <option key={k} value={k}>
              {k === "all" ? "所有到期狀態" : URGENCY_LABEL[k]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890]">共 {filtered.length} 筆</span>
          <button
            className="px-3.5 h-[28px] text-[12px] rounded bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
            onClick={() => setModalOpen(true)}
          >
            ＋ 新增保險件
          </button>
        </div>
      </div>

      {/* Layout */}
      <div className="flex">
        {/* Sidenav */}
        <aside className="w-[200px] flex-shrink-0 bg-white border-r border-[#EEECE6] py-3.5 sticky top-[44px] h-[calc(100vh-44px)] overflow-y-auto">
          <NavSection label="到期狀態">
            {(["all", "urgent", "soon", "far", "done"] as UrgencyFilter[]).map((k) => (
              <NavItem
                key={k}
                active={navUrg === k}
                onClick={() => setNavUrg(k)}
                dotColor={DOT_COLOR[k]}
                label={URGENCY_LABEL[k]}
                count={counts[k]}
                countCls={COUNT_PILL[k]}
              />
            ))}
          </NavSection>
          <div className="h-px bg-[#EEECE6] mx-3 my-2" />
          <NavSection label="本月業績">
            <NavStatic label="已完成件數" valueCls="bg-[#E1F5EE] text-[#0F6E56]" value="3 件" />
            <NavStatic label="佣金收入" valueCls="bg-[#FDF3E3] text-[#854F0B]" value="$12,600" small />
            <NavStatic label="續保率" valueCls="bg-[#E1F5EE] text-[#0F6E56]" value="60%" />
          </NavSection>
          <div className="h-px bg-[#EEECE6] mx-3 my-2" />
          <NavSection label="待跟進清單">
            <NavItem dotColor="#F0C97E" label="需再次電訪" count={3} countCls="bg-[#FDF3E3] text-[#854F0B]" onClick={() => showToast("篩選：需再次電訪")} />
            <NavItem dotColor="#C8001A" label="上報主管" count={1} countCls="bg-[#FDECEA] text-[#C8001A]" onClick={() => showToast("篩選：上報主管")} />
            <NavItem dotColor="#9A9890" label="更正資訊" count={1} countCls="bg-[#F1EFE8] text-[#5A5955]" onClick={() => showToast("篩選：更正資訊")} />
          </NavSection>
          <div className="h-px bg-[#EEECE6] mx-3 my-2" />
          <NavSection label="快速連結">
            <NavItem dotColor="#0F6E56" label="客戶基盤" onClick={() => showToast("→ CRM01A 客戶基盤")} />
            <NavItem dotColor="#534AB7" label="保險參數設定" onClick={() => showToast("→ RS_M3 保險參數設定")} />
          </NavSection>
        </aside>

        {/* Main */}
        <div className="flex-1 px-5 py-4 pb-12">
          {/* KPI */}
          <div className="grid grid-cols-5 gap-2.5 mb-3.5">
            <KpiCard accent="#F0C97E" label="本月待處理" value="7" valueCls="text-[#854F0B]" sub="續保 5 + 新件 2" />
            <KpiCard accent="#C8001A" label="30 天內到期" value="2" valueCls="text-[#C8001A]" sub="優先電訪" barCls="bg-[#C8001A]" barWidth="29%" />
            <KpiCard accent="#0F6E56" label="已完成件數" value="3" valueCls="text-[#0F6E56]" sub="續保率 60%（目標 70%）" barCls="bg-[#0F6E56]" barWidth="60%" />
            <KpiCard accent="#185FA5" label="本月佣金收入" value="$12,600" valueCls="text-[#185FA5] text-[18px]" sub="目標 $20,000" barCls="bg-[#185FA5]" barWidth="63%" />
            <KpiCard accent="#1A3A5C" label="年度累計佣金" value="$58,400" valueCls="text-[#1A3A5C] text-[18px]" sub="前 5 月合計" />
          </div>

          {tab === "renew" && (
            <div className="flex flex-col gap-2">
              {filtered.length === 0 ? (
                <div className="text-center text-[12px] text-[#9A9890] py-10 bg-white border border-[#EEECE6] rounded">沒有符合條件的保險件</div>
              ) : (
                filtered.map((c) => {
                  const open = expanded.has(c.id);
                  const sIdx = scriptIdx[c.id] ?? 0;
                  const f = formState[c.id] || {};
                  return (
                    <article key={c.id} className={`bg-white border border-[#EEECE6] rounded-[9px] overflow-hidden ${URG_LEFTBAR[c.urgency]}`}>
                      {/* header */}
                      <div className="flex items-center gap-3 px-3.5 py-2.5 cursor-pointer" onClick={() => toggleCard(c.id)}>
                        <div className={`w-[46px] h-[46px] rounded-lg flex flex-col items-center justify-center flex-shrink-0 ${URG_BOX[c.urgency]}`}>
                          <div className="text-[17px] font-bold font-mono leading-none">{c.urgency === "done" ? "✅" : c.daysLeft}</div>
                          <div className="text-[9px] text-[#9A9890] mt-0.5">{c.urgency === "done" ? "已續保" : "天後到期"}</div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-[13px] font-bold">{c.name}</span>
                            <span className="text-[11.5px] font-mono text-[#7A7A78] bg-[#F1EFE8] px-1.5 py-0.5 rounded">{c.plate}</span>
                            <span className="text-[11.5px] text-[#5A5955]">🏍️ {c.bike}</span>
                          </div>
                          <div className="flex gap-3 text-[11.5px] text-[#7A7A78] flex-wrap items-center">
                            <span className="font-semibold text-[#5A5955]">👤 {c.rs}</span>
                            <span>到期：{c.expiry}</span>
                            <span>電訪 {c.callCount} 次</span>
                            <span>原保：{c.co}</span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          <div className="flex gap-1">
                            <span className={`text-[10.5px] px-2 py-0.5 rounded font-semibold border ${TYPE_BADGE[c.type]}`}>{c.type}</span>
                            <span className={`text-[10.5px] px-2 py-0.5 rounded font-semibold border ${EXP_BADGE[c.urgency].cls}`}>
                              {EXP_BADGE[c.urgency].label(c.daysLeft)}
                            </span>
                          </div>
                          <div className="flex gap-1">
                            {c.urgency !== "done" && c.status !== "escalate" && (
                              <button
                                className="px-2.5 py-1 text-[11px] rounded border bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B] hover:bg-[#FAE8C4]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleCard(c.id);
                                }}
                              >
                                📞 電訪記錄
                              </button>
                            )}
                            <button
                              className="px-2.5 py-1 text-[11px] rounded border bg-[#F1EFE8] border-[#D5D3CB] text-[#5A5955]"
                              onClick={(e) => {
                                e.stopPropagation();
                                showToast("→ CRM01A 客戶詳情");
                              }}
                            >
                              詳情
                            </button>
                          </div>
                        </div>
                      </div>

                      {open && (
                        <div className="border-t border-[#F4F3F0] px-4 py-3.5 bg-[#FAFAF8]">
                          {c.urgency === "done" && (
                            <div className="bg-[#E1F5EE] border border-[#5DCAA5] rounded p-2.5 mb-2.5 text-[12px] text-[#085041]">
                              ✅ 已成交出單{c.result ? ` — ${c.result}` : ""}
                            </div>
                          )}
                          {c.status === "escalate" && c.urgency !== "done" && (
                            <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded p-2.5 mb-2.5 text-[12px] text-[#C8001A]">
                              ⚠ 已達電訪上限（{c.callCount} / {INS_PARAMS.maxCalls}），自動升報主管處理。
                            </div>
                          )}

                          {/* detail grid */}
                          <div className="grid grid-cols-4 gap-2 mb-3">
                            {[
                              ["保險到期", c.expiry],
                              ["續保類型", c.type],
                              ["原保公司", c.co],
                              ["電訪次數", `${c.callCount} / ${INS_PARAMS.maxCalls} 次`],
                            ].map(([l, v]) => (
                              <div key={l} className="bg-white border border-[#EEECE6] rounded-[7px] px-3 py-2">
                                <div className="text-[10px] text-[#9A9890] mb-0.5">{l}</div>
                                <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{v}</div>
                              </div>
                            ))}
                          </div>

                          {/* coverages */}
                          <div className="mb-3">
                            <div className="text-[10.5px] font-semibold tracking-wide uppercase text-[#9A9890] mb-1.5">上年保障項目</div>
                            <div className="flex flex-wrap gap-1.5">
                              {COVERAGE_KEYS.map((k) => {
                                const v = c.coverages[k];
                                return (
                                  <span
                                    key={k}
                                    className={`px-2.5 py-1 rounded text-[11.5px] border ${
                                      v === "YES"
                                        ? "bg-[#E1F5EE] border-[#5DCAA5] text-[#085041]"
                                        : "bg-[#F1EFE8] border-[#D5D3CB] text-[#9A9890] line-through"
                                    }`}
                                  >
                                    {k}
                                  </span>
                                );
                              })}
                            </div>
                          </div>

                          {/* script box */}
                          <div className="bg-[#1A3A5C] rounded-lg p-3 mb-3 text-white">
                            <div className="text-[9.5px] font-bold tracking-wide uppercase opacity-60 mb-1.5 flex items-center gap-2 flex-wrap">
                              話術模板（主管設定 · RS 唯讀）
                              {scripts.map((s, i) => (
                                <button
                                  key={s.tag}
                                  onClick={() => setScriptIdx((p) => ({ ...p, [c.id]: i }))}
                                  className={`text-[10.5px] px-2 py-0.5 rounded border ${
                                    sIdx === i ? "bg-white/25 border-white/30" : "bg-white/10 border-white/20"
                                  } text-white/85`}
                                  title={s.title}
                                >
                                  {s.tag}
                                </button>
                              ))}
                            </div>
                            <div className="text-[12.5px] leading-[1.8] opacity-90">{scripts[sIdx].text}</div>
                          </div>

                          {/* history */}
                          <div className="mb-3">
                            <div className="text-[10.5px] font-semibold tracking-wide uppercase text-[#9A9890] mb-1.5">歷史電訪記錄</div>
                            {c.history.map((h, i) => (
                              <div key={i} className="flex gap-2.5 py-1.5 border-b border-[#F4F3F0] last:border-b-0 text-[12px]">
                                <div className={`w-[7px] h-[7px] rounded-full flex-shrink-0 mt-1 ${h.dot === "blue" ? "bg-[#185FA5]" : h.dot === "amber" ? "bg-[#F0C97E]" : "bg-[#0F6E56]"}`} />
                                <span className="text-[10.5px] text-[#9A9890] font-mono mt-0.5 whitespace-nowrap">{h.time}</span>
                                <span className="flex-1 text-[#4A4A48] leading-[1.5]">{h.text}</span>
                              </div>
                            ))}
                          </div>

                          {/* form */}
                          {c.urgency !== "done" && c.status !== "escalate" && (
                            <div className="bg-white border border-[#EEECE6] rounded-lg px-3.5 py-3">
                              <div className="text-[11.5px] font-semibold text-[#4A4A48] mb-2.5">📝 電訪結果記錄</div>
                              <div className="flex gap-1.5 flex-wrap mb-2.5">
                                {CALL_RESULTS.map((r, i) => (
                                  <button
                                    key={r}
                                    onClick={() => updateForm(c.id, { result: r })}
                                    className={`px-3 py-1 rounded border text-[11.5px] ${
                                      f.result === r
                                        ? i === 0
                                          ? "border-[#0F6E56] bg-[#E1F5EE] text-[#0F6E56] font-semibold"
                                          : i === 1
                                            ? "border-[#185FA5] bg-[#EAF4FB] text-[#185FA5] font-semibold"
                                            : i === 2
                                              ? "border-[#9A9890] bg-[#F1EFE8] text-[#5A5955] font-semibold"
                                              : i === 3
                                                ? "border-[#F0C97E] bg-[#FDF3E3] text-[#854F0B] font-semibold"
                                                : i === 4
                                                  ? "border-[#534AB7] bg-[#EEEDFE] text-[#534AB7] font-semibold"
                                                  : "border-[#C8001A] bg-[#FDECEA] text-[#C8001A] font-semibold"
                                        : "border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#B4B2A9] hover:bg-[#F4F3F0]"
                                    }`}
                                  >
                                    {r}
                                  </button>
                                ))}
                              </div>
                              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                                <div>
                                  <div className={labelCls}>下次電訪日期</div>
                                  <input
                                    type="date"
                                    className={inputCls}
                                    value={f.nextDate ?? c.nextDate ?? ""}
                                    onChange={(e) => updateForm(c.id, { nextDate: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <div className={labelCls}>流失去向（已在他處續保）</div>
                                  <select className={selectCls} value={f.lost ?? c.lost ?? ""} onChange={(e) => updateForm(c.id, { lost: e.target.value })}>
                                    <option value="">— 無 —</option>
                                    {LOST_REASONS.map((r) => (
                                      <option key={r}>{r}</option>
                                    ))}
                                  </select>
                                </div>
                                {/* BDN #14：流失原因 ROOT CAUSE 編碼 — 與「流失去向」正交、回答「為什麼流失」 */}
                                <div className="col-span-2" data-testid="lost-reason-root-cause">
                                  <div className={labelCls}>流失原因（ROOT CAUSE）</div>
                                  <select
                                    className={selectCls}
                                    value={f.lostReasonCode ?? c.lostReasonCode ?? ""}
                                    onChange={(e) => updateForm(c.id, { lostReasonCode: e.target.value })}
                                    data-testid="lost-reason-select"
                                  >
                                    <option value="">— 未編碼 —</option>
                                    {lostReasons.map((r) => (
                                      <option key={r.code} value={r.code}>
                                        {r.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="col-span-2">
                                  <div className={labelCls}>電訪備註</div>
                                  <textarea
                                    className="w-full px-2.5 py-1.5 text-[12px] border border-[#D5D3CB] rounded outline-none focus:border-[#185FA5] resize-y min-h-[56px] bg-white"
                                    placeholder="記錄客戶反應、承諾事項、後續行動..."
                                    value={f.note ?? c.note}
                                    onChange={(e) => updateForm(c.id, { note: e.target.value })}
                                  />
                                </div>
                                <div>
                                  <div className={labelCls}>報價狀態</div>
                                  <select className={selectCls} value={f.quote ?? ""} onChange={(e) => updateForm(c.id, { quote: e.target.value })}>
                                    {QUOTE_STATES.map((q) => (
                                      <option key={q}>{q}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <div className={labelCls}>出單公司（成交時填）</div>
                                  <select className={selectCls} value={f.co ?? ""} onChange={(e) => updateForm(c.id, { co: e.target.value })}>
                                    <option value="">— 無 —</option>
                                    {INSURERS.map((co) => (
                                      <option key={co}>{co}</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-2.5 border-t border-[#EEECE6]">
                                <button
                                  className="px-3.5 h-[28px] text-[12px] rounded border border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#9A9890]"
                                  onClick={() => skipCase(c.id)}
                                >
                                  略過（本次不跟進）
                                </button>
                                <button
                                  className="px-3.5 h-[28px] text-[12px] rounded bg-[#1A3A5C] text-white hover:bg-[#0F2A45] font-medium"
                                  onClick={() => saveCall(c.id)}
                                >
                                  💾 儲存電訪記錄
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          )}

          {tab === "new" && (
            <section data-testid="new-delivery-tab">
              <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-lg px-3.5 py-2.5 mb-3.5 text-[12px] text-[#0C3E70] leading-[1.7]">
                🆕 <b>新車交車招攬</b>：交車後 3 日內主動確認保險投保狀況，協助加購商業險與車損險，同時建立保險到期提醒。
              </div>
              <div className="bg-white border border-[#EEECE6] rounded-lg overflow-x-auto">
                {/* TODO(P1-λ): 此 mock-only table 暫不升級到 <DataGrid>，待保險模組接真實 helper 後再做。 */}
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      {["客戶姓名", "車款", "交車日期", "車牌", "負責 RS", "保險狀態", "備註", "操作"].map((h) => (
                        <th key={h} className="text-[10.5px] font-semibold tracking-wide uppercase text-[#9A9890] py-2 px-3 border-b-2 border-[#EEECE6] text-left whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {NEW_DELIVERIES.map((d, i) => {
                      const isCovOk = d.insStatus === "全險已投";
                      return (
                        <tr key={i} className="hover:bg-[#FAFAF8]">
                          <td className="py-2.5 px-3 border-b border-[#F4F3F0] text-[12.5px] font-semibold">{d.name}</td>
                          <td className="py-2.5 px-3 border-b border-[#F4F3F0] text-[12.5px]">{d.bike}</td>
                          <td className="py-2.5 px-3 border-b border-[#F4F3F0] font-mono text-[12px]">{d.delivDate}</td>
                          <td className="py-2.5 px-3 border-b border-[#F4F3F0]">
                            <span className="font-mono text-[12px] bg-[#F1EFE8] px-1.5 py-0.5 rounded">{d.plate}</span>
                          </td>
                          <td className="py-2.5 px-3 border-b border-[#F4F3F0] text-[12.5px]">{d.rs}</td>
                          <td className="py-2.5 px-3 border-b border-[#F4F3F0]">
                            <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${isCovOk ? "bg-[#E1F5EE] text-[#0F6E56]" : "bg-[#FDF3E3] text-[#854F0B]"}`}>
                              {d.insStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 border-b border-[#F4F3F0] text-[11.5px] text-[#7A7A78]">{d.note}</td>
                          <td className="py-2.5 px-3 border-b border-[#F4F3F0]">
                            <button
                              className="px-2.5 h-[24px] text-[11px] rounded border border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#9A9890]"
                              onClick={() => showToast("→ 建立保險提醒件")}
                            >
                              建立提醒
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {tab === "perf" && (
            <section data-testid="perf-tab" className="grid grid-cols-2 gap-3.5">
              <PerfBox title="本月業績摘要">
                {[
                  ["總件數", "7 件", "pb-blue"],
                  ["已完成", "3 件", "pb-amber"],
                  ["進行中", "4 件", "pb-blue"],
                  ["成交率", "43%（目標 70%）", "pb-blue"],
                  ["佣金收入", "$12,600", "pb-amber"],
                  ["佣金目標", "$20,000", "pb-blue"],
                  ["達成率", "63%", "pb-amber"],
                ].map(([k, v, _c]) => (
                  <PerfRow key={k} k={k} v={v} cls={_c} />
                ))}
                {/* BDN #21：達成率 progress bar + 預測線 */}
                <div className="mt-3 pt-3 border-t border-[#F4F3F0] flex flex-col gap-3">
                  <ProgressBarWithForecast
                    label="件數達成率"
                    actual={3}
                    target={5}
                    unit="件"
                  />
                  <ProgressBarWithForecast
                    label="佣金達成率"
                    actual={12600}
                    target={20000}
                    unit="$"
                    isCurrency
                  />
                </div>
              </PerfBox>
              <PerfBox title="RS 個人業績">
                {PERF_RS_ROWS.map((r) => (
                  <PerfRow key={r.name} k={`👤 ${r.name}`} v={`${r.done} 件　$${r.rev.toLocaleString()}`} cls={r.done > 0 ? "pb-teal" : ""} />
                ))}
              </PerfBox>
              <PerfBox title="流失原因分析">
                {/* BDN #14：當字典已載入則動態群聚 cases，否則 fallback 到 hardcoded demo 數字 */}
                {lostReasons.length > 0
                  ? lostReasons.map((r) => {
                      const count = cases.filter((c) => c.lostReasonCode === r.code).length;
                      return <PerfRow key={r.code} k={r.label} v={`${count} 件`} cls="pb-amber" />;
                    })
                  : PERF_LOST_REASONS.map((r) => (
                      <PerfRow key={r.label} k={r.label} v={`${r.count} 件`} cls="pb-amber" />
                    ))}
              </PerfBox>
              <PerfBox title="年度累計">
                {PERF_YEAR_TOTALS.map((r) => (
                  <PerfRow key={r.month} k={r.month} v={`$${r.amount.toLocaleString()}`} cls="pb-blue" />
                ))}
              </PerfBox>
            </section>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="bg-white rounded-xl w-[540px] max-w-[92vw] shadow-2xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#EEECE6] flex items-center justify-between">
              <div className="text-[14px] font-bold">＋ 新增保險招攬件</div>
              <button className="text-[20px] text-[#9A9890] px-1.5" onClick={() => setModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="px-5 py-4 max-h-[64vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <FormField label="客戶姓名" required>
                  <input className={inputCls} placeholder="例：王大明" value={newCase.name} onChange={(e) => setNewCase({ ...newCase, name: e.target.value })} />
                </FormField>
                <FormField label="聯絡電話" required>
                  <input className={inputCls} placeholder="0912-345-678" value={newCase.phone} onChange={(e) => setNewCase({ ...newCase, phone: e.target.value })} />
                </FormField>
                <FormField label="車牌號碼">
                  <input className={inputCls} placeholder="例：ABC-1234" value={newCase.plate} onChange={(e) => setNewCase({ ...newCase, plate: e.target.value })} />
                </FormField>
                <FormField label="車款">
                  <select className={selectCls} value={newCase.bike} onChange={(e) => setNewCase({ ...newCase, bike: e.target.value })}>
                    <option value="">— 請選擇 —</option>
                    {BIKE_MODELS.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="保險到期日" required>
                  <input type="date" className={inputCls} value={newCase.expiry} onChange={(e) => setNewCase({ ...newCase, expiry: e.target.value })} />
                </FormField>
                <FormField label="續保類型">
                  <select className={selectCls} value={newCase.type} onChange={(e) => setNewCase({ ...newCase, type: e.target.value as InsType })}>
                    {(["新轉續", "續轉續", "斷轉續", "外轉續", "在修未投保"] as InsType[]).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="原保公司">
                  <select className={selectCls} value={newCase.co} onChange={(e) => setNewCase({ ...newCase, co: e.target.value })}>
                    {INSURERS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label="負責 RS">
                  <select className={selectCls} value={newCase.rs} onChange={(e) => setNewCase({ ...newCase, rs: e.target.value })}>
                    {RS_LIST.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="mt-3">
                <div className={labelCls}>備註</div>
                <textarea
                  className="w-full px-2.5 py-1.5 text-[12px] border border-[#D5D3CB] rounded outline-none focus:border-[#185FA5] resize-y min-h-[56px] bg-white"
                  placeholder="客戶特殊情況、上次溝通重點..."
                  value={newCase.note}
                  onChange={(e) => setNewCase({ ...newCase, note: e.target.value })}
                />
                <div className="text-[11px] text-[#9A9890] mt-1">儲存後系統依到期日自動計算提醒優先序</div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button className="px-4 h-[30px] text-[12.5px] rounded border border-[#D5D3CB] bg-white text-[#5A5955] hover:border-[#9A9890]" onClick={() => setModalOpen(false)}>
                取消
              </button>
              <button className="px-4 h-[30px] text-[12.5px] rounded bg-[#1A3A5C] text-white hover:bg-[#0F2A45] font-medium" onClick={addCase}>
                ✅ 建立保險件
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-[13px] z-50 bg-[#1A3A5C] text-white">{toast}</div>
      )}
    </main>
  );
}

function NavSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3 mb-1.5">
      <div className="text-[10px] font-semibold tracking-wide uppercase text-[#9A9890] px-1.5 pt-2 pb-1">{label}</div>
      {children}
    </div>
  );
}

function NavItem({
  active,
  onClick,
  dotColor,
  label,
  count,
  countCls,
}: {
  active?: boolean;
  onClick?: () => void;
  dotColor: string;
  label: string;
  count?: number;
  countCls?: string;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors mb-0.5 text-[12px] ${
        active ? "bg-[#FDF3E3] text-[#854F0B] font-semibold" : "text-[#4A4A48] hover:bg-[#F4F3F0]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        {label}
      </div>
      {typeof count === "number" && <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${countCls ?? ""}`}>{count}</span>}
    </div>
  );
}

function NavStatic({ label, value, valueCls, small }: { label: string; value: string; valueCls: string; small?: boolean }) {
  return (
    <div className="flex items-center justify-between px-2 py-1.5 mb-0.5">
      <div className="text-[11px] text-[#5A5955]">{label}</div>
      <span className={`font-mono font-semibold px-1.5 py-0.5 rounded ${valueCls} ${small ? "text-[10px]" : "text-[11px]"}`}>{value}</span>
    </div>
  );
}

function KpiCard({
  accent,
  label,
  value,
  valueCls,
  sub,
  barCls,
  barWidth,
}: {
  accent: string;
  label: string;
  value: string;
  valueCls: string;
  sub: string;
  barCls?: string;
  barWidth?: string;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2.5" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="text-[10.5px] text-[#9A9890] mb-0.5">{label}</div>
      <div className={`text-[22px] font-bold font-mono leading-none mb-0.5 ${valueCls}`}>{value}</div>
      <div className="text-[10.5px] text-[#9A9890]">{sub}</div>
      {barCls && barWidth && (
        <div className="h-1 bg-[#EEECE6] rounded-full mt-1.5 overflow-hidden">
          <div className={`h-full rounded-full ${barCls}`} style={{ width: barWidth }} />
        </div>
      )}
    </div>
  );
}

function PerfBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-[10px] px-4 py-3.5">
      <div className="text-[11px] font-semibold tracking-wide uppercase text-[#9A9890] mb-2.5">{title}</div>
      {children}
    </div>
  );
}

function PerfRow({ k, v, cls }: { k: string; v: string; cls?: string }) {
  const c =
    cls === "pb-teal"
      ? "text-[#0F6E56]"
      : cls === "pb-amber"
        ? "text-[#854F0B]"
        : cls === "pb-blue"
          ? "text-[#185FA5]"
          : "text-[#5A5955]";
  return (
    <div className="flex justify-between py-1.5 border-b border-[#F4F3F0] last:border-b-0 text-[12.5px]">
      <span className="text-[#5A5955]">{k}</span>
      <span className={`font-mono font-semibold ${c}`}>{v}</span>
    </div>
  );
}

/**
 * BDN #21：本月業績達成率 progress bar + 月底預測線
 * - 顏色閾值：≥80% 綠 / 50–80% 黃 / <50% 紅
 * - 預測：actual * (daysInMonth / daysPassed)，daysPassed >= 3 才顯示（避免月初基數太小）
 * - 預測線以虛線 marker 疊在 bar 上，超過 100% 截斷在 100% 並標 🎯+
 */
function ProgressBarWithForecast({
  label,
  actual,
  target,
  unit,
  isCurrency,
}: {
  label: string;
  actual: number;
  target: number;
  unit: string;
  isCurrency?: boolean;
}) {
  const now = new Date();
  const daysPassed = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const showForecast = daysPassed >= 3;
  const rawPct = target > 0 ? (actual / target) * 100 : 0;
  const pct = Math.min(100, Math.max(0, rawPct));
  const predicted = showForecast ? actual * (daysInMonth / daysPassed) : 0;
  const predictedRawPct = target > 0 ? (predicted / target) * 100 : 0;
  const predictedPct = Math.min(100, Math.max(0, predictedRawPct));
  const overshoot = predictedRawPct > 100;
  const color = rawPct >= 80 ? "#0F6E56" : rawPct >= 50 ? "#F0C97E" : "#C8001A";
  const fmt = (n: number) =>
    isCurrency
      ? `$${Math.round(n).toLocaleString()}`
      : `${Math.round(n).toLocaleString()} ${unit}`;
  return (
    <div data-testid="progress-bar-with-forecast">
      <div className="flex justify-between items-baseline mb-1 text-[11.5px]">
        <span className="font-semibold text-[#4A4A48]">{label}</span>
        <span className="text-[#5A5955]">
          實際 <span className="font-mono font-semibold" style={{ color }}>{fmt(actual)}</span>
          {" / "}
          目標 <span className="font-mono text-[#5A5955]">{fmt(target)}</span>
          <span className="ml-1.5 font-mono font-semibold" style={{ color }}>
            （{Math.round(rawPct)}%）
          </span>
        </span>
      </div>
      <div className="relative w-full h-[12px] rounded-full bg-[#EEECE6] overflow-visible">
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: color }}
        />
        {showForecast && (
          <>
            {/* 預測線 marker：垂直虛線從 bar 上方延伸到下方 */}
            <div
              className="absolute -top-1 h-[20px] border-l-2 border-dashed border-[#5A5955]"
              style={{ left: `calc(${predictedPct}% - 1px)` }}
              title={`預估月底 ${fmt(predicted)}`}
            />
          </>
        )}
      </div>
      {showForecast ? (
        <div className="flex justify-between items-baseline mt-1 text-[10.5px] text-[#7A7A78]">
          <span>已過 {daysPassed} / 共 {daysInMonth} 天</span>
          <span>
            預估月底{" "}
            <span className="font-mono font-semibold text-[#4A4A48]">
              {fmt(predicted)}
              {overshoot && " 🎯+"}
            </span>
            <span className="ml-1">（{Math.round(predictedRawPct)}%）</span>
          </span>
        </div>
      ) : (
        <div className="mt-1 text-[10.5px] text-[#9A9890]">
          已過 {daysPassed} / 共 {daysInMonth} 天 · 月初資料尚少、暫不顯示預測
        </div>
      )}
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold text-[#4A4A48] mb-1">
        {label}
        {required && <span className="text-[#C8001A] ml-0.5">*</span>}
      </div>
      {children}
    </div>
  );
}
