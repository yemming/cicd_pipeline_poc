"use client";

import { CheckItem, FormField, NoticeBar, SectionHeader, SignatureBox } from "./atoms";

const SECTIONS: { title: string; subtitle?: string; items: { no: number; name: string }[] }[] = [
  { title: "A. Ducati 經銷商交車準備項目", items: [
    { no: 1,  name: "請確保「交車前檢查清單 PDI」已完成並簽名存檔" },
    { no: 2,  name: "確認摩托車是否符合購買合約的要求：型號版本是否正確、配件以及外觀是否符合要求" },
    { no: 3,  name: "確認車身號碼和車牌與行照是否一致" },
    { no: 4,  name: "檢查燃料是否加滿至儀表板指示燈熄滅（至少 5 公升）" },
    { no: 5,  name: "駕駛和乘客座高調整（組裝/拆卸操作）" },
    { no: 6,  name: "擋風鏡高度調整" },
    { no: 7,  name: "儀錶板傾角調整" },
    { no: 8,  name: "後視鏡調整" },
    { no: 9,  name: "煞車和離合器拉桿調整" },
    { no: 10, name: "超野 SAG 調整" },
  ]},
  { title: "B. 向客戶說明的一般部分", items: [
    { no: 11, name: "鑰匙和鎖的功能，包括備用鑰匙（主動和被動鑰匙，視型號而定）" },
    { no: 12, name: "機械或電子油箱蓋的功能" },
    { no: 13, name: "側邊或中央駐車架的功能" },
    { no: 14, name: "電源插座、USB 接頭、鉛酸或鋰電池的充電插座" },
    { no: 15, name: "側邊旅行箱和尾箱：安裝/折卸和開關；使用注意事項及橫向擺動系統功能" },
    { no: 16, name: "把手開關說明" },
    { no: 17, name: "儀錶板說明（設定選單、PIN CODE、駕駛模式等）" },
    { no: 18, name: "駕駛、乘客加熱坐墊和加溫握把" },
    { no: 19, name: "駕駛輔助系統：ABS、DTC、DWC、DSC、DPL、VHC 說明" },
    { no: 20, name: "帶自動調整功能的機械或電子懸吊說明（預載調整）" },
    { no: 21, name: "Ducati 進退快排系統（DQS）說明" },
    { no: 22, name: "定速巡航控制（CC）、主動巡航控制（ACC）和盲區偵測（BSD）系統說明" },
    { no: 23, name: "藍芽多媒體整合配對智慧手機或是藍芽對講機" },
    { no: 24, name: "Ducati Connect、Sygic GPS Navigation、XLink 應用程式說明" },
    { no: 25, name: "下載並講解 MyDucati 應用程式（車庫、定期維護、新消息等功能）" },
    { no: 26, name: "摩托車「定期保養計劃」說明（里程保養和時間保養）" },
    { no: 27, name: "介紹維修廠以及服務經理" },
  ]},
  { title: "C. 須向客戶說明的使用注意事項", items: [
    { no: 28, name: "引擎磨合：在前 1,000km 引擎轉速的操作說明" },
    { no: 29, name: "鋰電池低溫啟動步驟（如果摩托車配備了鋰電池）" },
    { no: 30, name: "傳動鏈條的清潔、張力值檢查及潤滑步驟" },
    { no: 31, name: "根據使用方式和環境條件對摩托車進行清潔；避免腐蝕性產品或高壓水柱設備" },
    { no: 32, name: "定期胎壓檢查及使用原廠輪胎尺寸的重要性" },
    { no: 33, name: "檢查引擎機油、冷卻液以及煞車和離合器液位，必要時加滿" },
  ]},
  { title: "D. 向客戶交車", items: [
    { no: 34, name: "啟動摩托車保固" },
    { no: 35, name: "介紹可以加購的延長保服務" },
    { no: 36, name: "交付車輛領牌文件、車主手冊、隨車配件箱以及正確填寫保固書" },
  ]},
];

const DOCS = [
  ["PDI 檢查表（副本）",                "●需簽", "－不需"],
  ["保固條款書（車主聯－紅）",          "●需簽", "●需簽"],
  ["車主交車確認表（副本）",            "●需簽", "●需簽"],
  ["賽道專用套件切結書（如有安裝）",    "－不需", "●需簽"],
  ["出廠證正本",                        "－不需", "－不需"],
  ["發票",                              "－不需", "－不需"],
  ["牌照登記書",                        "－不需", "－不需"],
  ["行照/保險卡",                       "－不需", "－不需"],
  ["印章/身分證",                       "－不需", "－不需"],
];

const ACCESSORIES = [
  "車主手冊（中/英）",
  "保養手冊",
  "鑰匙",
  "Ducati Logo 貼紙",
  "防霧微粒",
  "公事包/SCR 背包（視車型）",
  "後視鏡組",
  "電瓶＋電瓶水",
  "電瓶固定座及配件（如果有）",
  "牌照架（如果有）",
  "排氣管防燙片及配件（如果有）",
  "行李箱頂組（如果有）",
  "平衡端子（如果有）",
  "擋風鏡套件（如果有）",
  "保養提醒貼紙（如果有）",
  "反光片（如果有）",
  "其它",
];

export function TabDelivery() {
  return (
    <div className="space-y-6">
      <NoticeBar tone="blue">
        版本：2025/01 修訂版 ｜ 經銷商聯（白）存檔 4 年 / 車主聯（紅）交付車主 ｜
        <strong>平板操作，逐項點交，完成後請車主簽名，連接印表機列印車主聯。</strong>
      </NoticeBar>

      <SectionHeader number="1" tone="teal" title="車輛 / 客戶資料" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <FormField label="車身號碼(VIN)" />
        <FormField label="車型" />
        <FormField label="客戶姓名" />
        <FormField label="經銷商" />
        <FormField label="交車日期" />
        <FormField label="銷售人員" />
      </div>

      {SECTIONS.map((sec, idx) => (
        <div key={sec.title}>
          <SectionHeader number={String(idx + 2)} tone="teal" title={sec.title} />
          <div className="mt-3 border border-slate-200 rounded-md overflow-hidden">
            <table className="w-full text-[12.5px]">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="text-left px-3 py-2 font-medium w-12">NO.</th>
                  <th className="text-left px-3 py-2 font-medium">確認項目</th>
                  <th className="text-left px-3 py-2 font-medium w-44">完成確認</th>
                  <th className="text-left px-3 py-2 font-medium w-32">說明/備註</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sec.items.map((it) => (
                  <tr key={it.no} className="hover:bg-slate-50/50">
                    <td className="px-3 py-1.5 text-slate-500 font-mono">{it.no}</td>
                    <td className="px-3 py-1.5 text-slate-700">{it.name}</td>
                    <td className="px-3 py-1.5">
                      <span className="inline-flex gap-2"><CheckItem label="完成" /><CheckItem label="N/A" /></span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-300 italic">—</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <SectionHeader number="6" tone="teal" title="經銷商交付車主文件點檢表" />
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">文件項目</th>
              <th className="text-center px-3 py-2 font-medium w-32">經銷商簽名</th>
              <th className="text-center px-3 py-2 font-medium w-32">車主簽名</th>
              <th className="text-left px-3 py-2 font-medium w-32">備註</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {DOCS.map(([name, dealer, owner]) => (
              <tr key={name} className="hover:bg-slate-50/50">
                <td className="px-3 py-1.5 text-slate-700">{name}</td>
                <td className="px-3 py-1.5 text-center text-[11px]">{dealer}</td>
                <td className="px-3 py-1.5 text-center text-[11px]">{owner}</td>
                <td className="px-3 py-1.5 text-slate-300 italic">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHeader number="7" tone="teal" title="經銷商交付車主配件箱點檢表" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
        {ACCESSORIES.map((a) => (
          <CheckItem key={a} label={a} size="md" />
        ))}
      </div>

      <SectionHeader number="8" tone="teal" title="簽署確認 Signatures" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SignatureBox role="銷售人員姓名/簽名" hint="本人已完成所有交車準備工作及整理裝備及文件均已完成。" />
        <SignatureBox
          role="客戶姓名/簽名"
          hint="摩托車交給我時狀況完好，已收到車主手冊、領牌文件和保固書，已閱讀並接受本文件中包含的保固條件。"
        />
      </div>
    </div>
  );
}
