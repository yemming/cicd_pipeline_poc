"use client";

import { Fragment } from "react";
import { FormField, NoticeBar, SectionHeader, SignatureBox } from "./atoms";

const LEVELS = [
  { code: "CPO", title: "Certified Pre-Owned", desc: "由知名公正第三方（如德國萊茵 TÜV、DEKRA）受原廠委託開發認證標準。項次最多、標準最嚴、保固最完整、價格最高。", tone: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  { code: "DPO", title: "Ducati Pre-Owned",   desc: "Ducati 原廠自行設計認證標準，項次少於 CPO。次於 CPO 等級，提供售出時保固範圍，價格居中。", tone: "bg-blue-50 border-blue-200 text-blue-800" },
  { code: "PO",  title: "Pre-Owned",           desc: "由售出的經銷商自行檢測，自行保固或無保固。最低標準及價格，須標注風險等級。", tone: "bg-slate-50 border-slate-200 text-slate-700" },
];

const SECTIONS = [
  { title: "外觀檢查", items: [
    { no: 2, name: "車身外觀目視檢查（刮傷、凹陷、龜裂）", cpo: "✅", dpo: "✅", po: "✅" },
    { no: 3, name: "車架號碼（VIN）核對與行照比對", cpo: "✅", dpo: "✅", po: "✅" },
    { no: 4, name: "儀表板警示燈檢查", cpo: "✅", dpo: "✅", po: "✅" },
    { no: 5, name: "燈光功能全檢（頭燈/尾燈/方向燈/煞車燈）", cpo: "✅", dpo: "✅", po: "✅" },
  ]},
  { title: "安全件檢查", items: [
    { no: 7,  name: "煞車系統：煞車油、來令片厚度、碟盤磨耗", cpo: "✅", dpo: "✅", po: "✅" },
    { no: 8,  name: "輪胎：胎壓、胎紋深度、胎壁狀況",         cpo: "✅", dpo: "✅", po: "✅" },
    { no: 9,  name: "鏈條：張力、磨耗、潤滑狀況",             cpo: "✅", dpo: "✅", po: "✅" },
    { no: 10, name: "前後懸吊：漏油、操作順暢度",             cpo: "✅", dpo: "✅", po: "✅" },
    { no: 11, name: "轉向：龍頭左右轉向自由度",               cpo: "✅", dpo: "✅", po: "✅" },
  ]},
  { title: "耗材更換（CPO/DPO）", items: [
    { no: 13, name: "引擎機油及機油濾芯更換",       cpo: "✅", dpo: "✅", po: "□" },
    { no: 14, name: "空氣濾清器檢查/更換",          cpo: "✅", dpo: "✅", po: "□" },
    { no: 15, name: "火星塞檢查/更換（依里程）",    cpo: "✅", dpo: "□", po: "□" },
    { no: 16, name: "煞車油更換（依車齡/使用狀況）",cpo: "✅", dpo: "□", po: "□" },
    { no: 17, name: "冷卻液更換（適用水冷車型）",   cpo: "✅", dpo: "□", po: "□" },
  ]},
  { title: "電子系統", items: [
    { no: 19, name: "電瓶電壓及充電狀態檢查",      cpo: "✅", dpo: "✅", po: "✅" },
    { no: 20, name: "DDS 2.0 故障碼掃描及清除",    cpo: "✅", dpo: "✅", po: "□" },
    { no: 21, name: "ECU 軟體版本確認及升級",      cpo: "✅", dpo: "□", po: "□" },
    { no: 22, name: "NDCS 技術公報及召回確認",     cpo: "✅", dpo: "✅", po: "□" },
  ]},
  { title: "道路測試", items: [
    { no: 24, name: "引擎啟動及暖車",                 cpo: "✅", dpo: "✅", po: "✅" },
    { no: 25, name: "道路測試（煞車、加速、操控）",   cpo: "✅", dpo: "✅", po: "□" },
    { no: 26, name: "異音及異常振動確認",             cpo: "✅", dpo: "✅", po: "✅" },
  ]},
  { title: "最終作業", items: [
    { no: 28, name: "清潔車輛（車身、引擎、輪圈）",   cpo: "✅", dpo: "✅", po: "□" },
    { no: 29, name: "拍攝車輛現況照片（存入系統）",   cpo: "✅", dpo: "✅", po: "✅" },
    { no: 30, name: "車輛狀況報告填寫",               cpo: "✅", dpo: "✅", po: "✅" },
    { no: 31, name: "定價建議（依市場行情及車況）",   cpo: "✅", dpo: "✅", po: "✅" },
    { no: 32, name: "保固文件準備（依認證等級）",     cpo: "✅", dpo: "□", po: "□" },
  ]},
];

function Mark({ v }: { v: string }) {
  if (v === "✅") return <span className="text-emerald-600">✅</span>;
  return <span className="text-slate-300">□</span>;
}

export function TabPDIUsed() {
  return (
    <div className="space-y-6">
      <NoticeBar tone="amber">
        本表單為內部作業文件，由售後技師執行，<strong>依 CPO/DPO/PO 認證等級執行對應項目</strong>，完成後存檔不交付車主。
      </NoticeBar>

      <SectionHeader number="1" tone="green" title="認證等級說明" subtitle="Certification Level" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {LEVELS.map((lv) => (
          <div key={lv.code} className={`border ${lv.tone} rounded-lg p-3`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl font-black tracking-tight">{lv.code}</span>
              <span className="text-[11px] uppercase tracking-wider opacity-70">{lv.title}</span>
            </div>
            <div className="text-[11.5px] leading-relaxed opacity-90">{lv.desc}</div>
          </div>
        ))}
      </div>

      <SectionHeader number="2" tone="green" title="車輛 / 作業資料" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <FormField label="認證等級" />
        <FormField label="車型/車型" />
        <FormField label="VIN 號碼" />
        <FormField label="車牌號碼" />
        <FormField label="里程數" />
        <FormField label="車齡" />
        <FormField label="前任車主" />
        <FormField label="作業日期" />
        <FormField label="接待員" />
        <FormField label="技師姓名" />
      </div>

      <SectionHeader number="3" tone="green" title="中古車 PDI 檢查清單" subtitle="依認證等級執行對應項目" />
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-12">NO.</th>
              <th className="text-left px-3 py-2 font-medium">檢查項目</th>
              <th className="text-center px-3 py-2 font-medium w-16">CPO</th>
              <th className="text-center px-3 py-2 font-medium w-16">DPO</th>
              <th className="text-center px-3 py-2 font-medium w-16">PO</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {SECTIONS.map((sec) => (
              <Fragment key={sec.title}>
                <tr className="bg-emerald-50/60">
                  <td colSpan={5} className="px-3 py-1.5 font-bold text-emerald-800 text-[12px]">
                    【{sec.title}】
                  </td>
                </tr>
                {sec.items.map((it) => (
                  <tr key={`${sec.title}-${it.no}`} className="hover:bg-slate-50/50">
                    <td className="px-3 py-1.5 text-slate-500 font-mono">{it.no}</td>
                    <td className="px-3 py-1.5 text-slate-700">{it.name}</td>
                    <td className="px-3 py-1.5 text-center"><Mark v={it.cpo} /></td>
                    <td className="px-3 py-1.5 text-center"><Mark v={it.dpo} /></td>
                    <td className="px-3 py-1.5 text-center"><Mark v={it.po} /></td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <SignatureBox role="技師簽名" hint="認證等級：□ CPO  □ DPO  □ PO" />
    </div>
  );
}
