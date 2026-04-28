"use client";

import { CheckItem, FormField, NoticeBar, SectionHeader, SignatureBox } from "./atoms";

const TERMS = [
  ["整車保固（台灣碩文版）",      "新車交車",          "自保固啟動日起 2 年不限里程（碩文總代理）"],
  ["零件保固（原廠非消耗品）",    "授權經銷商購買安裝", "自購買日起 24 個月"],
  ["一般保固（<500cc）",           "非越野使用",        "自交車日起 24 個月不限里程"],
  ["一般保固（<500cc）",           "越野使用",          "自交車日起 12 個月不限里程"],
  ["引擎保固（<500cc）",           "非越野/越野",       "24 個月 / 12 個月"],
  ["一般保固（≥500cc）",          "公路使用",          "自交車日起 24 個月不限里程"],
  ["引擎保固（≥500cc）",          "公路使用",          "自交車日起 24 個月不限里程"],
  ["Desmo 服務（≥500cc）",        "公路使用",          "24 個月或 40,000 km（以先到為準）"],
  ["Desmo 服務（<500cc）",        "公路使用",          "3 個月或 15,000 km（以先到為準）"],
];

const EXCLUSIONS = [
  "用於任何運動競賽的機車",
  "用於租賃服務的機車",
  "機車正常使用中的自然耗損零件（輪胎、最終傳動零件、正時皮帶、減震元件、火星塞、煞車、離合器組及其餘磨損零件，及未適當使用 DUCATI 電池充電器維護的電池等）",
  "因氧化、環境因素、非正常狀態使用、機車未定期保養及不適當清洗所導致的故障與瑕疵",
  "在非 DUCATI 官方授權經銷商進行摩托車拆除及維修保養",
  "使用未經 DUCATI 原廠核准之零件或改裝部品、配件",
  "未遵守車主手冊中所列之機車使用建議",
  "客戶或第三方對機車進行修改，並未經 DUCATI 明確核准者",
  "客戶未參加任何 DUCATI 的相關召回活動",
];

const CONFIRM_ITEMS = [
  "已向客戶說明保固條款內容及範圍",
  "已向客戶說明購買契約相關細節，並提供全套文件",
  "已依廠家規定說明定期保養計劃",
  "已帶領客戶填寫保固相關表格",
  "已說明 www.ducati.com 網站及授權經銷商售後服務資訊",
];

const PRIVACY_ITEMS = [
  "接受廣告/促銷資訊",
  "接受市場調查",
  "接受個人化服務",
];

export function TabWarranty() {
  return (
    <div className="space-y-6">
      <NoticeBar tone="blue">
        交車時由銷售人員口語宣讀並解說條款內容，確認表頭資料無誤後請車主簽名。
        <strong>正本（含簽名）→ 原廠/代理商存檔；副本 → 返還車主保留。</strong>
      </NoticeBar>

      <SectionHeader number="1" tone="blue" title="客戶資料" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <FormField label="姓名（Last Name）" />
        <FormField label="名（First Name）" />
        <FormField label="手機號碼" />
        <FormField label="出生年月日" />
        <FormField label="電子郵件" />
        <FormField label="通訊地址" className="lg:col-span-3" />
      </div>

      <NoticeBar tone="amber">
        <strong>【台灣碩文總代理版保固】</strong>
        新車自保固啟動日起，享有二年無限里程整車保固。零件保固：原廠非消耗性零件/改裝部品自購買日起 24 個月（須於授權經銷商購買及安裝）。
      </NoticeBar>

      <SectionHeader number="2" tone="blue" title="車輛資料" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <FormField label="經銷商" />
        <FormField label="車型" />
        <FormField label="車牌號碼" />
        <FormField label="掛牌日" />
        <FormField label="車身號碼（VIN）" />
        <FormField label="保固條款收件日" />
        <FormField label="保固啟動日" />
      </div>

      <SectionHeader number="3" tone="blue" title="保固期限" />
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">保固項目</th>
              <th className="text-left px-3 py-2 font-medium">適用情境</th>
              <th className="text-left px-3 py-2 font-medium">保固期限</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {TERMS.map(([item, ctx, len], i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-3 py-1.5 font-medium text-slate-700">{item}</td>
                <td className="px-3 py-1.5 text-slate-600">{ctx}</td>
                <td className="px-3 py-1.5 text-slate-700">{len}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHeader number="4" tone="blue" title="保固不適用情況" subtitle="Warranty Exclusions" />
      <ul className="space-y-1.5 text-[12.5px] text-slate-700">
        {EXCLUSIONS.map((e) => (
          <li key={e} className="flex gap-2">
            <span className="text-rose-500 shrink-0">●</span>
            <span>{e}</span>
          </li>
        ))}
      </ul>
      <NoticeBar tone="slate">
        ※ 碩文總代理保有隨時修改與發佈保固條款內容之權利，最終條款以交車時簽署的保固條款為主。
      </NoticeBar>

      <SectionHeader number="5" tone="blue" title="交車確認事項" />
      <div className="space-y-2">
        {CONFIRM_ITEMS.map((c) => (
          <div key={c} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2">
            <CheckItem label={c} size="md" />
            <span className="inline-flex gap-2 shrink-0">
              <CheckItem label="是" />
              <CheckItem label="否" />
            </span>
          </div>
        ))}
      </div>

      <SectionHeader number="6" tone="blue" title="隱私權同意" />
      <div className="space-y-2">
        {PRIVACY_ITEMS.map((p) => (
          <div key={p} className="flex items-center justify-between border border-slate-200 rounded-md px-3 py-2">
            <span className="text-[13px] text-slate-700">{p}</span>
            <span className="inline-flex gap-2 shrink-0">
              <CheckItem label="同意" />
              <CheckItem label="不同意" />
            </span>
          </div>
        ))}
      </div>

      <SectionHeader number="7" tone="blue" title="簽署欄" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SignatureBox role="技師簽名"     hint="交車前準備工作已完成" />
        <SignatureBox role="業務顧問簽名" hint="交車說明完成，客戶已了解並簽署所有文件" />
        <SignatureBox role="客戶簽名"     hint="本人已閱讀並了解 Ducati 隱私政策及保固條款" />
      </div>

      <div className="text-[10px] text-slate-400 text-center pt-2">
        Ducati Motor Holding S.p.A. ｜ Via Cavalieri Ducati, 3 ｜ 40132 Bologna, Italy ｜ www.ducati.com ｜ 第一聯（存根聯）
      </div>
    </div>
  );
}
