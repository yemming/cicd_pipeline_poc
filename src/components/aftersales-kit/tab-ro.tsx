"use client";

import { CheckItem, FormField, NoticeBar, SectionHeader } from "./atoms";

const WARRANTY_TYPES = [
  "PRED(出廠前)",
  "NORM(標準24月)",
  "ACCE(配件)",
  "SPAR(零件)",
  "WCRC(召回)",
  "4EVR(4Ever)",
  "RED1/RED2(延伸)",
  "GWIL(業務延續)",
  "CARE(客戶關懷)",
  "不適用",
];

const STATUS_PAIRS = [
  ["前輪狀況", "後輪狀況"],
  ["前煞車來令片", "後煞車來令片"],
  ["最終傳動裝置", ""],
];

export function TabRO() {
  return (
    <div className="space-y-6">
      <NoticeBar tone="slate">
        本表單為售後維修作業核心文件，<strong>進廠即開立</strong>，完工後作為收費及存檔依據。
      </NoticeBar>

      <SectionHeader number="1" tone="orange" title="工單表頭" subtitle="銷貨/維修/接待員" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <FormField label="銷貨單號" />
        <FormField label="維修單號(RO)" />
        <FormField label="YouTech 編號" />
        <FormField label="接待員" />
        <FormField label="進廠日期" />
        <FormField label="保固啟動日" />
      </div>

      <div>
        <div className="text-[12px] font-medium text-slate-600 mb-2">保固索賠類型</div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {WARRANTY_TYPES.map((w) => <CheckItem key={w} label={w} size="md" />)}
        </div>
      </div>

      <SectionHeader number="2" tone="orange" title="車輛 / 客戶資料" />
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
        <FormField label="車型" />
        <FormField label="VIN" />
        <FormField label="車牌號碼" />
        <FormField label="姓名/公司名稱" />
        <FormField label="聯絡電話" />
        <FormField label="行駛里程" />
      </div>

      <SectionHeader number="3" tone="orange" title="機車狀況檢查" />
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium">部位</th>
              <th className="text-left px-3 py-2 font-medium">狀況</th>
              <th className="text-center px-3 py-2 font-medium w-20">需更換</th>
              <th className="text-left px-3 py-2 font-medium">部位</th>
              <th className="text-left px-3 py-2 font-medium">狀況</th>
              <th className="text-center px-3 py-2 font-medium w-20">需更換</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {STATUS_PAIRS.map(([l, r], i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-3 py-2">{l}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex gap-2"><CheckItem label="良好" /><CheckItem label="需注意" /></span>
                </td>
                <td className="px-3 py-2 text-center"><CheckItem label="" /></td>
                <td className="px-3 py-2">{r}</td>
                <td className="px-3 py-2">
                  {r && (
                    <span className="inline-flex gap-2"><CheckItem label="良好" /><CheckItem label="需注意" /></span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">{r && <CheckItem label="" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionHeader number="4" tone="orange" title="作業說明 / 技師診斷" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
        <FormField label="客戶反應意見" />
        <FormField label="技師診斷" />
        <FormField label="公報需執行" />
        <FormField label="保養類型" />
      </div>

      <SectionHeader number="5" tone="orange" title="零件更換紀錄 Parts & Labour" />
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-12">NO.</th>
              <th className="text-left px-3 py-2 font-medium">零件料號</th>
              <th className="text-left px-3 py-2 font-medium">零件名稱</th>
              <th className="text-right px-3 py-2 font-medium w-16">數量</th>
              <th className="text-right px-3 py-2 font-medium w-24">單價</th>
              <th className="text-right px-3 py-2 font-medium w-24">金額</th>
              <th className="text-left px-3 py-2 font-medium w-32">備註</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                <td className="px-3 py-1.5 text-slate-500 font-mono">{i + 1}</td>
                {Array.from({ length: 6 }).map((_, j) => (
                  <td key={j} className="px-3 py-1.5 text-slate-300 italic">—</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
