"use client";

import { CheckItem, FormField, NoticeBar, SectionHeader } from "./atoms";

const ITEMS = [
  "閱讀技術公報 SRV-SRB-19-041 車款介紹",
  "目視檢查運輸包裝完整性（如果適用）",
  "移除運輸包裝（如果適用）",
  "目視檢查車輛完整性",
  "檢查所提供的配件的完整性（請參閱配件箱提供的零件清單）",
  "移除車輪的保護裝置",
  "移除左右反光片上的束帶",
  "安裝把手平衡端子",
  "安裝後視鏡及貼上提醒標籤",
  "啟動電瓶並安裝於車輛",
  "檢查最終傳動鏈條張力",
  "檢查胎壓 前/後 2.5bar",
  "檢查煞車機離合器油（若有需要請補充）",
  "檢查引擎機油液面高度，若有需要請補充",
  "檢查鑰匙功能和龍頭鎖（左右）是否作動正常",
  "檢查燈光、方向燈、喇叭和控制開關；檢查進遠燈高度並調整；檢查龍頭左右轉向自由度與是否有干涉",
  "檢查儀錶板日期與時間，並設定符合台灣的計量單位（Km、°C…）",
  "檢查引擎停止開關，側腳柱開關和離合器拉桿開關操作",
  "檢查前後輪軸固定扭力 前-63 Nm；後-230Nm",
  "檢查前後煞車卡鉗固定螺栓扭力 前-45Nm；後-25Nm",
  "添加汽油直到預備油量燈熄滅（4.5公升）",
  "透過 NDCS 檢查是否有技術公報或召回需要執行",
  "透過 DDS 2.0 檢查 ECU 是否有故障碼與軟體升級（使用 Global Scan 功能）",
  "根據客戶的訂單安裝 Ducati Performance 配件並檢查操作是否正常",
  "最終檢查和道路測試（檢查安全裝置和散熱風扇做動）",
  "清潔車輛",
];

export function TabPDINew() {
  return (
    <div className="space-y-6">
      <NoticeBar tone="amber">
        本表單為內部作業文件，由售後技師執行，完成後存檔，<strong>不交付車主</strong>。
        觸發時機：銷售部門確認配車後，鄰近交車日前。
      </NoticeBar>

      <SectionHeader number="1" tone="amber" title="車輛 / 作業資料" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <FormField label="機型/車款" />
        <FormField label="VIN 號碼" />
        <FormField label="車牌號碼" />
        <FormField label="保固啟動日" />
        <FormField label="車主姓名" />
        <FormField label="作業日期" />
        <FormField label="接待員" />
        <FormField label="技師姓名" />
      </div>

      <SectionHeader number="2" tone="amber" title="出廠前檢測作業清單" subtitle="Pre-Delivery Inspection — 26 項" />
      <div className="border border-slate-200 rounded-md overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="text-left px-3 py-2 font-medium w-12">NO.</th>
              <th className="text-left px-3 py-2 font-medium">檢查項目</th>
              <th className="text-left px-3 py-2 font-medium w-52 whitespace-nowrap">執行結果</th>
              <th className="text-left px-3 py-2 font-medium w-32">技師備註</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ITEMS.map((it, i) => (
              <tr key={i} className="hover:bg-slate-50/50">
                <td className="px-3 py-1.5 text-slate-500 font-mono">{i + 1}</td>
                <td className="px-3 py-1.5 text-slate-700">{it}</td>
                <td className="px-3 py-1.5">
                  <span className="inline-flex gap-2">
                    <CheckItem label="完成" />
                    <CheckItem label="N/A" />
                    <CheckItem label="待處理" />
                  </span>
                </td>
                <td className="px-3 py-1.5 text-slate-300 italic">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
