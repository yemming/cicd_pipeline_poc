"use client";

import { useEffect, useRef, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { createClient } from "@/lib/supabase/client";

const STAFF_LIST = [
  "陳建志", "林佳蓉", "王俊傑", "黃雅婷", "劉明宏", "張惠如",
];

const BIKES = [
  "Panigale V4 S", "Panigale V4 R", "Multistrada V4",
  "Multistrada V4 Pikes Peak", "Monster SP", "Diavel V4",
  "DesertX", "Scrambler", "Streetfighter V4", "Hypermotard",
];

const DUCATI_MODELS = [
  "Panigale V4", "Multistrada V4", "Monster", "Diavel V4",
  "DesertX", "Scrambler", "Streetfighter V4", "Hypermotard", "SuperSport", "其他車款",
];

const VISIT_PURPOSES = [
  "購車諮詢", "試乘試駕", "詢價報價",
  "預約維修保養", "取件 / 交車", "配件精品選購", "其他",
];

const VISIT_CHANNELS: { label: string; freeText?: boolean; placeholder?: string }[] = [
  { label: "路過 / 自訪" },
  { label: "網路搜尋" },
  { label: "社群媒體 (IG / FB)" },
  { label: "老客戶介紹", freeText: true, placeholder: "介紹人姓名" },
  { label: "電話預約" },
  { label: "活動 / 展覽", freeText: true, placeholder: "活動名稱" },
  { label: "其他", freeText: true, placeholder: "請說明來店管道" },
];

function pad(n: number) { return String(n).padStart(2, "0"); }
function toDateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function toTimeStr(d: Date) { return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }

type ArrivalState = { date: string; time: string; cardNo: string };

export default function CounterPage() {
  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "手卡・第一階段" },
    ],
  });

  // ── 到店登記 ──
  const [arrival, setArrival] = useState<ArrivalState>({ date: "", time: "", cardNo: "—" });
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [currentUserName, setCurrentUserName] = useState("載入中...");
  const [receptionStaff, setReceptionStaff] = useState("");
  const [visitChannel, setVisitChannel] = useState("");
  const [visitChannelExtra, setVisitChannelExtra] = useState("");

  // ── 訪客識別 ──
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── 客戶判斷 ──
  const [isFirstVisit, setIsFirstVisit] = useState(true);
  const [visitInterval, setVisitInterval] = useState("");
  const [isReferral, setIsReferral] = useState(false);
  const [referralName, setReferralName] = useState("");
  const [isAppointment, setIsAppointment] = useState(false);
  const [isDesignated, setIsDesignated] = useState(false);
  const [designatedStaff, setDesignatedStaff] = useState("");
  const [isDucatiOwner, setIsDucatiOwner] = useState(false);
  const [ducatiModel, setDucatiModel] = useState("");
  const [ducatiModelOther, setDucatiModelOther] = useState("");

  // ── 客戶基本資料 ──
  const [gender, setGender] = useState<"male" | "female" | null>(null);
  const [hasCompanion, setHasCompanion] = useState(false);

  // ── 來意探詢 ──
  const [selectedBikes, setSelectedBikes] = useState<string[]>([]);
  const [visitPurposes, setVisitPurposes] = useState<string[]>([]);
  const [wantsTestRide, setWantsTestRide] = useState<boolean | null>(null);

  useEffect(() => {
    const now = new Date();
    const dateStr = toDateStr(now);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArrival({ date: dateStr, time: toTimeStr(now), cardNo: `DU-${dateStr.replace(/-/g, "")}-001` });
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsMobile(navigator.maxTouchPoints > 0);

    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      if (!user) { setCurrentUserName("—"); return; }
      const { data: profile } = await supabase
        .from("profiles").select("name").eq("id", user.id).single();
      const name = profile?.name ?? user.email ?? "—";
      setCurrentUserName(name);
      setReceptionStaff(STAFF_LIST.find(s => s === name) ?? "");
    });
  }, []);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const toggleBike = (bike: string) =>
    setSelectedBikes(prev => prev.includes(bike) ? prev.filter(b => b !== bike) : [...prev, bike]);

  const togglePurpose = (p: string) =>
    setVisitPurposes(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const setArrivalDate = (date: string) => setArrival(a => ({ ...a, date }));
  const setArrivalTime = (time: string) => setArrival(a => ({ ...a, time }));

  const channelConfig = VISIT_CHANNELS.find(c => c.label === visitChannel);

  return (
    <div className="-m-4 md:-m-8 bg-[#FCF8FF] min-h-[calc(100dvh-4rem)] flex flex-col">
      <main className="flex-1 pb-32 px-8">
        <div className="max-w-5xl mx-auto">

          {/* ── 頁首 ── */}
          <div className="flex flex-col md:flex-row justify-between items-baseline mb-8 gap-4 pt-6">
            <div>
              <h1 className="text-[1.75rem] font-display font-extrabold text-on-surface tracking-tight">
                客戶接待手卡 — 第一階段
              </h1>
              <p className="text-outline text-sm mt-1">接待三步法 ‧ 步驟一：探詢來意及識別訪客</p>
            </div>
            <div className="flex gap-6 text-[0.75rem] font-medium bg-surface-container-low px-6 py-3 rounded-full">
              <div className="flex gap-2 items-center">
                <span className="text-outline">手卡編號:</span>
                <span className="text-on-surface font-display">{arrival.cardNo}</span>
              </div>
              <div className="w-px h-4 bg-outline-variant" />
              <div className="flex gap-2 items-center">
                <span className="text-outline">接待人員:</span>
                <span className="text-on-surface font-bold">{currentUserName}</span>
              </div>
            </div>
          </div>

          <div className="space-y-6">

            {/* ══ Section 1：到店登記 ══ */}
            <section className="bg-surface-container-lowest p-8 rounded-xl shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                <h2 className="text-[1.375rem] font-display font-bold">到店登記</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-outline tracking-wider uppercase">到店日期</label>
                  <div className="relative">
                    <input
                      className={`w-full bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none ${timeConfirmed ? "opacity-60 cursor-not-allowed" : ""}`}
                      type="date"
                      value={arrival.date}
                      onChange={e => setArrivalDate(e.target.value)}
                      disabled={timeConfirmed}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline pointer-events-none">calendar_today</span>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-outline tracking-wider uppercase">到店時間</label>
                  <div className="relative">
                    <input
                      className={`w-full bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none ${timeConfirmed ? "opacity-60 cursor-not-allowed" : ""}`}
                      type="time"
                      value={arrival.time}
                      onChange={e => setArrivalTime(e.target.value)}
                      disabled={timeConfirmed}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 material-symbols-outlined text-outline pointer-events-none">schedule</span>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                {!timeConfirmed ? (
                  <button
                    onClick={() => setTimeConfirmed(true)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-tertiary-container text-white rounded-full text-sm font-bold hover:opacity-90 transition-opacity"
                  >
                    <span className="material-symbols-outlined text-sm">check_circle</span>
                    確認到店時間
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-green-700 text-sm font-bold">
                    <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                    已確認 — {arrival.date} {arrival.time}
                    <button onClick={() => setTimeConfirmed(false)} className="ml-2 text-outline text-xs underline font-normal hover:text-on-surface transition-colors">修改</button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-outline tracking-wider uppercase">接待人員</label>
                  <select
                    className="w-full bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none"
                    value={receptionStaff}
                    onChange={e => setReceptionStaff(e.target.value)}
                  >
                    <option value="">請選擇接待人員...</option>
                    {STAFF_LIST.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-outline leading-relaxed">若訪客指定接待人員，可在此切換至指定人員</p>
                </div>
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-outline tracking-wider uppercase">來店管道</label>
                  <select
                    className="w-full bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none"
                    value={visitChannel}
                    onChange={e => { setVisitChannel(e.target.value); setVisitChannelExtra(""); }}
                  >
                    <option value="">請選擇...</option>
                    {VISIT_CHANNELS.map(c => <option key={c.label} value={c.label}>{c.label}</option>)}
                  </select>
                  {channelConfig?.freeText && (
                    <input
                      className="w-full bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none"
                      placeholder={channelConfig.placeholder}
                      type="text"
                      value={visitChannelExtra}
                      onChange={e => setVisitChannelExtra(e.target.value)}
                    />
                  )}
                </div>
              </div>
            </section>

            {/* ══ Section 2：訪客識別 ══ */}
            <section className="bg-surface-container-lowest p-8 rounded-xl shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                <h2 className="text-[1.375rem] font-display font-bold">訪客識別</h2>
              </div>
              <div className="flex flex-col md:flex-row gap-8 items-start">

                {/* 大頭照 + 拍照 / 上傳 */}
                <div className="shrink-0 md:w-44">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    {...(isMobile ? { capture: "user" as const } : {})}
                    onChange={handleAvatarChange}
                    className="sr-only"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="relative w-full aspect-square rounded-2xl overflow-hidden bg-surface-container-low border-2 border-dashed border-outline-variant/60 hover:border-tertiary-container transition-colors group"
                  >
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="客戶照片" className="w-full h-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-outline p-4">
                        <span className="material-symbols-outlined text-5xl">account_circle</span>
                        <span className="text-xs font-bold tracking-wide text-center">
                          {isMobile ? "點擊拍照" : "點擊上傳照片"}
                        </span>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-3xl">
                        {isMobile ? "photo_camera" : "upload"}
                      </span>
                    </div>
                  </button>
                  <p className="text-[9px] text-outline text-center mt-2 leading-relaxed">
                    試乘試駕掃描駕照時可自動帶入大頭照
                  </p>
                </div>

                {/* 識別資訊卡片 */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/30">
                    <div className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">來店狀態</div>
                    <div className={`text-xl font-bold ${isFirstVisit ? "text-tertiary" : "text-on-surface"}`}>
                      {isFirstVisit ? "首次來店" : "再次來店"}
                    </div>
                    {!isFirstVisit && (
                      <div className="mt-3">
                        <div className="text-[10px] text-outline mb-0.5">上次進廠日期</div>
                        <div className="text-sm font-display font-bold text-tertiary">2026/02/15</div>
                      </div>
                    )}
                    <p className="text-[9px] text-outline/60 mt-3">依 Q01「是否首次來店」自動判斷</p>
                  </div>

                  <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/30">
                    <div className="text-[10px] font-bold text-outline uppercase tracking-widest mb-2">DUCATI 車主</div>
                    <div className={`text-xl font-bold ${isDucatiOwner ? "text-red-700" : "text-outline"}`}>
                      {isDucatiOwner ? "現有車主" : "非車主 / 未知"}
                    </div>
                    {isDucatiOwner && ducatiModel && ducatiModel !== "其他車款" && (
                      <div className="mt-3">
                        <div className="text-[10px] text-outline mb-0.5">目前車款</div>
                        <div className="text-sm font-display font-bold text-red-700">{ducatiModel}</div>
                      </div>
                    )}
                    {isDucatiOwner && ducatiModel === "其他車款" && ducatiModelOther && (
                      <div className="mt-3">
                        <div className="text-[10px] text-outline mb-0.5">目前車款</div>
                        <div className="text-sm font-display font-bold text-red-700">{ducatiModelOther}</div>
                      </div>
                    )}
                    <p className="text-[9px] text-outline/60 mt-3">依 Q05「是否 DUCATI 車主」自動判斷</p>
                  </div>
                </div>
              </div>
            </section>

            {/* ══ Section 3：客戶判斷 ══ */}
            <section className="bg-surface-container-lowest p-8 rounded-xl shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                <h2 className="text-[1.375rem] font-display font-bold">客戶判斷</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10">

                {/* Q01 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-surface-container-high w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold">01</span>
                    <label className="text-sm font-bold text-on-surface">是否首次來店？</label>
                  </div>
                  <div className="flex gap-2 p-1 bg-surface-container-low rounded-xl">
                    <button onClick={() => setIsFirstVisit(true)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${isFirstVisit ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>是（首次）</button>
                    <button onClick={() => setIsFirstVisit(false)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${!isFirstVisit ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>否（再訪）</button>
                  </div>
                  <div className="pt-2">
                    <p className="text-[10px] text-outline mb-2 uppercase tracking-widest font-bold opacity-50">再次進店間隔？（選再訪後啟用）</p>
                    <div className={`flex gap-2 transition-opacity ${isFirstVisit ? "opacity-30 pointer-events-none" : "opacity-100"}`}>
                      {["本月再次", "2個月內再次"].map(v => (
                        <button key={v} onClick={() => setVisitInterval(visitInterval === v ? "" : v)} className={`px-3 py-1 rounded-md text-[10px] transition-all ${visitInterval === v ? "bg-tertiary-container text-white" : "bg-surface-container-low"}`}>{v}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Q02 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-surface-container-high w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold">02</span>
                    <label className="text-sm font-bold text-on-surface">是否老客戶介紹？</label>
                  </div>
                  <div className="flex gap-2 p-1 bg-surface-container-low rounded-xl">
                    <button onClick={() => setIsReferral(true)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${isReferral ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>是</button>
                    <button onClick={() => { setIsReferral(false); setReferralName(""); }} className={`flex-1 py-3 rounded-lg text-sm transition-all ${!isReferral ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>否</button>
                  </div>
                  {isReferral && (
                    <input
                      className="w-full bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none text-sm"
                      placeholder="請輸入介紹人姓名"
                      type="text"
                      value={referralName}
                      onChange={e => setReferralName(e.target.value)}
                    />
                  )}
                </div>

                {/* Q03 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-surface-container-high w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold">03</span>
                    <label className="text-sm font-bold text-on-surface">是否來電預約？</label>
                  </div>
                  <div className="flex gap-2 p-1 bg-surface-container-low rounded-xl">
                    <button onClick={() => setIsAppointment(true)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${isAppointment ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>是</button>
                    <button onClick={() => setIsAppointment(false)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${!isAppointment ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>否</button>
                  </div>
                </div>

                {/* Q04 */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-surface-container-high w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold">04</span>
                    <label className="text-sm font-bold text-on-surface">是否指定銷售人員？</label>
                  </div>
                  <div className="flex gap-2 p-1 bg-surface-container-low rounded-xl">
                    <button onClick={() => setIsDesignated(true)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${isDesignated ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>是</button>
                    <button onClick={() => { setIsDesignated(false); setDesignatedStaff(""); }} className={`flex-1 py-3 rounded-lg text-sm transition-all ${!isDesignated ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>否</button>
                  </div>
                  {isDesignated ? (
                    <select
                      className="w-full bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none text-sm"
                      value={designatedStaff}
                      onChange={e => setDesignatedStaff(e.target.value)}
                    >
                      <option value="">請選擇指定銷售人員...</option>
                      {STAFF_LIST.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-1.5 text-tertiary">
                      <span className="material-symbols-outlined text-sm">info</span>
                      <span className="text-[10px] font-medium">系統將自動分配值班顧問</span>
                    </div>
                  )}
                </div>

                {/* Q05 DUCATI 車主 — 橫跨兩欄 */}
                <div className="md:col-span-2 space-y-4 pt-4 border-t border-outline-variant/30">
                  <div className="flex items-center gap-2">
                    <span className="bg-red-100 text-red-700 w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold">05</span>
                    <label className="text-sm font-bold text-on-surface">是否為 DUCATI 車主？</label>
                  </div>
                  <div className="flex gap-2 p-1 bg-surface-container-low rounded-xl max-w-xs">
                    <button onClick={() => setIsDucatiOwner(true)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${isDucatiOwner ? "bg-red-700 text-white font-bold" : "text-outline hover:text-on-surface"}`}>是</button>
                    <button onClick={() => { setIsDucatiOwner(false); setDucatiModel(""); }} className={`flex-1 py-3 rounded-lg text-sm transition-all ${!isDucatiOwner ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>否</button>
                  </div>
                  {isDucatiOwner && (
                    <div className="space-y-3 pt-1">
                      <label className="block text-xs font-bold text-outline tracking-wider uppercase">目前 DUCATI 車款</label>
                      <div className="flex flex-wrap gap-2">
                        {DUCATI_MODELS.map(m => (
                          <button key={m} onClick={() => setDucatiModel(ducatiModel === m ? "" : m)} className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${ducatiModel === m ? "bg-red-700 text-white shadow-sm" : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"}`}>{m}</button>
                        ))}
                      </div>
                      {ducatiModel === "其他車款" && (
                        <input
                          className="w-full max-w-sm bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-red-200 outline-none text-sm"
                          placeholder="請輸入車款名稱..."
                          type="text"
                          value={ducatiModelOther}
                          onChange={e => setDucatiModelOther(e.target.value)}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* ══ Section 4：客戶基本資料 ══ */}
            <section className="bg-surface-container-lowest p-8 rounded-xl shadow-sm overflow-hidden relative">
              <div className="absolute -right-20 -top-10 opacity-[0.08] pointer-events-none">
                <img alt="" className="w-[32rem] h-auto object-contain" src="/bikes/hero/lifestyle-1.jpg" />
              </div>
              <div className="flex items-center gap-3 mb-8">
                <div className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                <h2 className="text-[1.375rem] font-display font-bold">客戶基本資料</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 mb-8 relative z-10">
                <div className="md:col-span-5 space-y-2">
                  <label className="block text-xs font-bold text-outline tracking-wider uppercase">客戶姓名</label>
                  <input
                    className="w-full bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none"
                    placeholder="請輸入客戶全名"
                    type="text"
                  />
                </div>
                <div className="md:col-span-4 space-y-2">
                  <label className="block text-xs font-bold text-outline tracking-wider uppercase">性別</label>
                  <div className="flex gap-8 py-2">
                    {(["male", "female"] as const).map((g, i) => (
                      <label key={g} className="flex items-center gap-3 cursor-pointer group" onClick={() => setGender(g)}>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${gender === g ? "border-tertiary" : "border-outline-variant group-hover:border-tertiary"}`}>
                          <div className={`w-2.5 h-2.5 rounded-full bg-tertiary transition-transform ${gender === g ? "scale-100" : "scale-0"}`} />
                        </div>
                        <span className={`text-sm ${gender === g ? "font-bold text-on-surface" : "font-medium"}`}>{["男", "女"][i]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-3 space-y-2">
                  <label className="block text-xs font-bold text-outline tracking-wider uppercase">有無陪同</label>
                  <div className="flex items-center h-10">
                    <button
                      onClick={() => setHasCompanion(v => !v)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${hasCompanion ? "bg-tertiary-container" : "bg-surface-container-high"}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${hasCompanion ? "translate-x-6" : "translate-x-1"}`} />
                    </button>
                    <span className="ml-3 text-sm text-outline">{hasCompanion ? "有陪同人員" : "無陪同人員"}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-8 relative z-10">
                <div className="md:col-span-6 space-y-2">
                  <label className="block text-xs font-bold text-outline tracking-wider uppercase">手機 / 電話</label>
                  <div className="flex gap-2">
                    <div className="bg-surface-container-low rounded-lg px-4 py-3 text-outline text-sm font-bold flex items-center">+886</div>
                    <input
                      className="flex-1 bg-surface-container-low border-0 rounded-lg px-4 py-3 text-on-surface focus:ring-1 focus:ring-tertiary-container/40 transition-all outline-none"
                      placeholder="09XX-XXX-XXX"
                      type="tel"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* ══ Section 5：來意探詢 ══ */}
            <section className="bg-surface-container-lowest p-8 rounded-xl shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-1.5 h-6 bg-tertiary-container rounded-full" />
                <h2 className="text-[1.375rem] font-display font-bold">來意探詢</h2>
              </div>

              <div className="space-y-4 mb-8">
                <label className="block text-xs font-bold text-outline tracking-wider uppercase">感興趣車系（可多選）</label>
                <div className="flex flex-wrap gap-3">
                  {BIKES.map(bike => (
                    <button key={bike} onClick={() => toggleBike(bike)} className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${selectedBikes.includes(bike) ? "bg-primary-container text-white shadow-md" : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"}`}>{bike}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <label className="block text-xs font-bold text-outline tracking-wider uppercase">來訪目的（可多選）</label>
                <div className="flex flex-wrap gap-3">
                  {VISIT_PURPOSES.map(p => (
                    <button key={p} onClick={() => togglePurpose(p)} className={`px-5 py-2.5 rounded-full text-sm font-medium transition-all ${visitPurposes.includes(p) ? "bg-tertiary-container text-white shadow-md" : "bg-surface-container-low text-on-surface hover:bg-surface-container-high"}`}>{p}</button>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <label className="block text-xs font-bold text-outline tracking-wider uppercase">是否有試乘試駕意願？</label>
                <div className="flex gap-2 p-1 bg-surface-container-low rounded-xl max-w-xs">
                  <button onClick={() => setWantsTestRide(true)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${wantsTestRide === true ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>有意願</button>
                  <button onClick={() => setWantsTestRide(null)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${wantsTestRide === null ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>未確定</button>
                  <button onClick={() => setWantsTestRide(false)} className={`flex-1 py-3 rounded-lg text-sm transition-all ${wantsTestRide === false ? "bg-white shadow-sm text-on-surface font-bold" : "text-outline hover:text-on-surface"}`}>暫不試駕</button>
                </div>
              </div>
            </section>
          </div>

          {/* ── CTA ── */}
          <div className="mt-16 flex flex-col items-center">
            <button className="group relative px-12 py-5 bg-primary-container text-white rounded-full font-bold text-lg shadow-[0_20px_50px_rgba(26,26,46,0.3)] hover:shadow-[0_25px_60px_rgba(26,26,46,0.4)] hover:-translate-y-1 transition-all duration-300">
              <span className="relative z-10 flex items-center gap-4">
                分配銷售顧問並進入下一步
                <span className="material-symbols-outlined transition-transform group-hover:translate-x-1">arrow_forward</span>
              </span>
              <div className="absolute inset-0 bg-gradient-to-br from-primary to-primary-container rounded-full opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
            <p className="text-outline text-xs mt-6">點擊後將依據排班表自動指派現場銷售顧問</p>
          </div>
        </div>
      </main>
      <div className="fixed bottom-0 left-0 w-full h-32 bg-gradient-to-t from-surface to-transparent pointer-events-none z-30" />
    </div>
  );
}
