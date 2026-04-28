"use client";

import { CheckItem, FormField, NoticeBar, SectionHeader, SignatureBox, TrafficLight } from "./atoms";

const HEADER_FIELDS = [
  ["預檢單號", "RO工單號（後補）", "進廠日期", "預計完工日"],
  ["車型", "車身號碼(VIN)", "車牌號碼", "行駛里程(km)"],
  ["車主姓名", "聯絡電話", "電子郵件", ""],
  ["接待SA", "指定技師", "預計取車日時", ""],
] as const;

const SA_INSPECT_ITEMS = [
  "車身外觀（刮傷/凹痕/龜裂）",
  "前輪胎（胎紋/胎壓/胎壁）",
  "前後擋泥板/整流罩",
  "後輪胎（胎紋/胎壓/胎壁）",
  "後照鏡（完整/調整）",
  "前煞車來令片（目視）",
  "燈光組（頭燈/尾燈/方向燈）",
  "後煞車來令片（目視）",
  "儀錶板（警示燈/異常顯示）",
  "鏈條（鬆緊/潤滑/磨耗）",
  "把手/離合器/煞車拉桿",
  "引擎機油（目視油尺/滲漏）",
  "油箱/油位",
  "冷卻液（適用車款）",
  "車架/排氣管（滲漏/損傷）",
  "電瓶外觀（腐蝕/固定）",
];

const VISIT_PURPOSE = ["定期保養", "里程保養", "Desmo保養", "故障維修", "改裝安裝", "其他"];

const SA_QUESTIONS = [
  ["上次保養時間/里程？", "是否有任何異常聲響？（何時/何種情況）"],
  ["是否有任何操控異常感覺？", "煞車感覺是否正常？（偏軟/偏硬/偏移）"],
  ["燈光/電子系統是否正常？", "是否有任何滲漏（油/水/氣）？"],
  ["是否有想加裝的改裝配件？", "是否有其他需要評估或諮詢的項目？"],
];

const TECH_INSPECT = [
  { cat: "引擎系統", items: [
    { name: "引擎機油狀況（品質/顏色/油位）", opts: ["正常", "需更換", "需補充"] },
    { name: "機油濾芯狀況", opts: ["正常", "需更換"] },
    { name: "空氣濾清器狀況", opts: ["正常", "需清潔", "需更換"] },
    { name: "火星塞狀況（適用車款）", opts: ["正常", "需更換"] },
    { name: "DDS 2.0 故障碼掃描結果", opts: ["無故障碼", "有故障碼→"] },
  ]},
  { cat: "傳動系統", items: [
    { name: "鏈條張力/磨耗/潤滑", opts: ["正常", "需調整", "需更換"] },
    { name: "前後鏈盤磨耗", opts: ["正常", "需更換"] },
    { name: "離合器作動/油位", opts: ["正常", "需調整", "需補充"] },
  ]},
  { cat: "煞車系統", items: [
    { name: "前煞車來令片厚度(mm)：___", opts: ["正常", "需更換(剩餘≤2mm)"] },
    { name: "後煞車來令片厚度(mm)：___", opts: ["正常", "需更換(剩餘≤2mm)"] },
    { name: "前後煞車碟盤磨耗", opts: ["正常", "需更換"] },
    { name: "煞車油品質/油位", opts: ["正常", "需更換", "需補充"] },
  ]},
  { cat: "輪胎系統", items: [
    { name: "前輪胎胎紋深度(mm)：___", opts: ["正常", "注意", "需更換(≤1.6mm)"] },
    { name: "後輪胎胎紋深度(mm)：___", opts: ["正常", "注意", "需更換(≤1.6mm)"] },
    { name: "胎壁/胎邊狀況", opts: ["正常", "有裂紋", "需更換"] },
  ]},
  { cat: "懸吊系統", items: [
    { name: "前叉油滲漏/作動順暢度", opts: ["正常", "輕微滲漏", "需修理"] },
    { name: "後避震作動/滲漏", opts: ["正常", "輕微滲漏", "需修理"] },
    { name: "SAG 設定確認（可調懸吊車款）", opts: ["正確", "需調整"] },
  ]},
  { cat: "電氣系統", items: [
    { name: "電瓶電壓(V)：___  充電狀態", opts: ["正常(≥12.6V)", "需充電", "需更換"] },
    { name: "燈光系統全檢", opts: ["全部正常", "有異常→"] },
    { name: "ECU軟體版本/技術公報確認(NDCS)", opts: ["最新", "需更新", "有召回"] },
  ]},
  { cat: "冷卻系統", items: [
    { name: "冷卻液液位/品質（水冷車款）", opts: ["正常", "需補充", "需更換"] },
    { name: "水箱/水管外觀滲漏", opts: ["正常", "有滲漏"] },
  ]},
  { cat: "其他", items: [
    { name: "排氣管固定/滲漏/防燙片", opts: ["正常", "需注意", "需修理"] },
    { name: "車主要求之其他檢查項目", opts: [] },
  ]},
];

export function TabPreInspection() {
  return (
    <div className="space-y-6">
      <NoticeBar tone="amber">
        <strong>【使用時機】</strong>
        車主每次回廠時，由 SA（售後接待）先行接車環檢 → 詢問來意 → 填寫預檢單 → 車進車間後技師深入檢查 → SA
        彙整後於休息區與車主溝通議價 → 車主確認簽名 → 轉錄至正式工單(RO)。本單兼具：<strong>責任劃分 / 商機挖掘 / 報價依據</strong>{" "}
        三大功能。
      </NoticeBar>

      {/* Header — 基本資料 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {HEADER_FIELDS.flat().filter(Boolean).map((f) => (
          <FormField key={f} label={f} />
        ))}
      </div>

      {/* 第一關：SA 接車環檢 */}
      <div>
        <SectionHeader number="1" tone="red" title="SA 接車環檢 — 快速目視" subtitle="責任劃分起點" />
        <div className="mt-3 border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-[28%]">部位</th>
                <th className="text-left px-3 py-2 font-medium w-[28%]">狀態評估</th>
                <th className="text-left px-3 py-2 font-medium">SA 備註</th>
                <th className="text-center px-2 py-2 font-medium w-16">拍照</th>
                <th className="text-center px-2 py-2 font-medium w-20">客戶確認</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {SA_INSPECT_ITEMS.map((item) => (
                <tr key={item} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-slate-700">{item}</td>
                  <td className="px-3 py-2"><TrafficLight /></td>
                  <td className="px-3 py-2 text-slate-300 text-[11px] italic">—</td>
                  <td className="px-2 py-2 text-center"><CheckItem label="" /></td>
                  <td className="px-2 py-2 text-center"><CheckItem label="" /></td>
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2 bg-slate-50 font-medium text-slate-600" colSpan={2}>SA 環檢備註</td>
                <td className="px-3 py-2 bg-slate-50 text-slate-300 italic" colSpan={3}>（自由欄位）</td>
              </tr>
            </tbody>
          </table>
        </div>
        <NoticeBar tone="rose">
          ★ 以上環檢結果已由 SA 與車主當面確認，現有損傷已如實記錄，<strong>進廠後新增損傷由本店負責</strong>。
        </NoticeBar>
      </div>

      {/* 第二關：來意詢問 */}
      <div>
        <SectionHeader number="2" tone="red" title="車主來意詢問 — SA 主動詢問紀錄" subtitle="第一次商機挖掘" />
        <div className="mt-3 space-y-3">
          <div>
            <div className="text-[12px] font-medium text-slate-600 mb-1.5">來廠目的</div>
            <div className="flex flex-wrap gap-3">
              {VISIT_PURPOSE.map((v) => <CheckItem key={v} label={v} size="md" />)}
            </div>
          </div>
          <FormField label="車主描述問題" />
          <div>
            <div className="text-[12px] font-medium text-slate-600 mb-1.5">SA 主動詢問項目（勾選已詢問並記錄回應）</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
              {SA_QUESTIONS.flat().map((q) => (
                <CheckItem key={q} label={q} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 第三關：技師深入檢查 */}
      <div>
        <SectionHeader number="3" tone="red" title="技師深入檢查結果" subtitle="車進車間後由技師填寫 — 第二次商機挖掘" />
        <div className="mt-3 border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-2 py-2 font-medium w-[14%]">類別</th>
                <th className="text-left px-2 py-2 font-medium w-[28%]">檢查項目</th>
                <th className="text-left px-2 py-2 font-medium">技師診斷結果</th>
                <th className="text-left px-2 py-2 font-medium w-[18%]">建議處理</th>
                <th className="text-right px-2 py-2 font-medium w-14">LU</th>
                <th className="text-right px-2 py-2 font-medium w-20">零件費</th>
                <th className="text-center px-2 py-2 font-medium w-20">安全等級</th>
                <th className="text-center px-2 py-2 font-medium w-24">車主決定</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {TECH_INSPECT.flatMap((sec) =>
                sec.items.map((it, idx) => (
                  <tr key={`${sec.cat}-${it.name}`} className="hover:bg-slate-50/50">
                    <td className="px-2 py-1.5 align-top text-slate-600 font-medium">
                      {idx === 0 ? sec.cat : ""}
                    </td>
                    <td className="px-2 py-1.5 align-top text-slate-700">{it.name}</td>
                    <td className="px-2 py-1.5 align-top">
                      <div className="flex flex-wrap gap-1.5">
                        {it.opts.map((o) => (
                          <CheckItem key={o} label={o} />
                        ))}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 align-top text-slate-300 italic">—</td>
                    <td className="px-2 py-1.5 align-top text-right text-slate-300">—</td>
                    <td className="px-2 py-1.5 align-top text-right text-slate-300">—</td>
                    <td className="px-2 py-1.5 align-top text-center text-[10px] leading-tight">
                      <span className="text-rose-600">🔴 立即</span>
                      <span className="text-amber-600">🟡 近期</span>
                      <span className="text-emerald-600">🟢 建議</span>
                    </td>
                    <td className="px-2 py-1.5 align-top text-center text-[10px] leading-tight">
                      <span className="text-emerald-700">✅ 同意</span>
                      <span className="text-amber-700">⏸ 暫緩</span>
                      <span className="text-rose-700">❌ 拒絕</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <NoticeBar tone="rose">
          ★ <strong>【增項閉環自動觸發】</strong>
          車主選擇「⏸暫緩」或「❌拒絕」的項目，系統將自動建立「失銷追蹤案件」：
          D+3 由 SA 第一次溫馨提醒；D+10 SA 二次聯繫（售後主管知悉）；🔴安全等級項目：售後主管須親自介入並存檔。
        </NoticeBar>
      </div>

      {/* 第四關：彙整報價 */}
      <div>
        <SectionHeader number="4" tone="red" title="預估報價彙整表" subtitle="SA 彙整 — 與車主議價" />
        <div className="mt-3 border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-[12.5px]">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="text-left px-3 py-2 font-medium w-12">NO.</th>
                <th className="text-left px-3 py-2 font-medium">服務項目</th>
                <th className="text-right px-3 py-2 font-medium w-16">LU</th>
                <th className="text-right px-3 py-2 font-medium w-24">工時費</th>
                <th className="text-right px-3 py-2 font-medium w-24">零件費</th>
                <th className="text-right px-3 py-2 font-medium w-24">小計</th>
                <th className="text-center px-3 py-2 font-medium w-32">車主確認</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="hover:bg-slate-50/50">
                  <td className="px-3 py-2 text-slate-500 font-mono">{i + 1}</td>
                  <td className="px-3 py-2 text-slate-300 italic">—</td>
                  <td className="px-3 py-2 text-right text-slate-300">—</td>
                  <td className="px-3 py-2 text-right text-slate-300">—</td>
                  <td className="px-3 py-2 text-right text-slate-300">—</td>
                  <td className="px-3 py-2 text-right text-slate-300">—</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex justify-center gap-2">
                      <CheckItem label="同意" />
                      <CheckItem label="暫緩" />
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-50 font-medium text-slate-700">
                <td colSpan={3} className="px-3 py-2 text-right">工時費小計</td>
                <td className="px-3 py-2 text-right text-slate-300">—</td>
                <td className="px-3 py-2 text-right">零件費小計</td>
                <td className="px-3 py-2 text-right text-slate-300">—</td>
                <td className="px-3 py-2 text-center text-[11px] text-slate-500">稅額 5%</td>
              </tr>
              <tr className="bg-red-50 font-bold text-red-800">
                <td colSpan={5} className="px-3 py-2 text-right">預估總費用（含稅）</td>
                <td colSpan={2} className="px-3 py-2 text-right text-lg">— NTD</td>
              </tr>
            </tbody>
          </table>
        </div>
        <NoticeBar tone="blue">
          <strong>【費用計算說明】</strong>
          LU（Labor Unit）= 6 分鐘，工時費率 NTD 1,650/小時（含稅）。
          工時費 = LU × 6÷60 × 1,650。以上為預估報價，實際費用以正式工單(RO)為準，超過預估 10% 以上將另行通知確認。
        </NoticeBar>
      </div>

      {/* 第五關：確認簽名 */}
      <div>
        <SectionHeader number="5" tone="red" title="車主確認簽名" subtitle="確認後轉錄至正式工單(RO)" />
        <NoticeBar tone="slate">
          本人已了解以上預估服務項目及費用，同意本店依上述項目進行作業，並確認轉錄至正式工單(RO)後方進行維修。
        </NoticeBar>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <SignatureBox role="SA（接待員）確認" hint="本次預檢由本人執行並彙整報價" />
          <SignatureBox role="車主確認簽名" hint="本人同意以上預估項目及費用，授權本店依此執行維修" />
        </div>
      </div>

      <div className="text-[11px] text-slate-400 text-center pt-2">
        本預檢單確認後轉錄至正式工單(RO) ‖ SA 聯（白）存檔 / 車主聯（黃）交付車主 ‖ 本文件存檔年限：4 年
      </div>
    </div>
  );
}
