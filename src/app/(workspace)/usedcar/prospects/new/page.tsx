"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

export default function UsedCarProspectsNewPage() {
  useSetPageHeader({
    title: "新增潛客",
    breadcrumb: [
      { label: "中古交易", href: "/usedcar/sales-dashboard" },
      { label: "潛客跟進表", href: "/usedcar/prospects" },
      { label: "新增潛客" },
    ],
  });

  const [followup1Open, setFollowup1Open] = useState(false);
  const [saving, setSaving] = useState(false);

  function handleSave() {
    setSaving(true);
    setTimeout(() => setSaving(false), 1800);
  }

  return (
    <div className="max-w-3xl space-y-6 pb-16">
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]" style={{ color: "#F43F5E" }}>person</span>
          <h2 className="text-sm font-semibold text-gray-800">基本資訊</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">線索來源 <span className="text-rose-500">*</span></label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
              <option value="">請選擇</option>
              <option>展廳</option>
              <option>電商平台</option>
              <option>微信朋友圈</option>
              <option>老客戶轉介紹</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">首次來電日期 <span className="text-rose-500">*</span></label>
            <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">銷售顧問 <span className="text-rose-500">*</span></label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
              <option value="">請選擇</option>
              <option>陳志偉</option>
              <option>林佳蓉</option>
              <option>王建明</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">客戶姓名 <span className="text-rose-500">*</span></label>
            <input type="text" placeholder="請輸入姓名" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">聯繫電話 <span className="text-rose-500">*</span></label>
            <input type="tel" placeholder="09xx-xxx-xxx" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-gray-600">接觸判別</label>
            <div className="flex flex-wrap gap-3">
              {["僅交換微信", "有意向來店", "無意向來店", "無效線索", "外地線索", "線索直接成交"].map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="contactJudgement" value={opt} className="accent-rose-500" />
                  <span className="text-sm text-gray-700">{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-gray-600">接觸備忘錄</label>
            <textarea rows={3} placeholder="記錄接觸情況..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40 resize-none" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]" style={{ color: "#F43F5E" }}>two_wheeler</span>
          <h2 className="text-sm font-semibold text-gray-800">現有車輛資訊</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">品牌</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
              <option value="">請選擇</option>
              {["Yamaha", "Honda", "Kawasaki", "Suzuki", "BMW", "KTM", "Ducati", "其他"].map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">車型</label>
            <input type="text" placeholder="例：MT-07" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">年款</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
              <option value="">請選擇</option>
              {Array.from({ length: 11 }, (_, i) => 2025 - i).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">里程</label>
            <div className="relative">
              <input type="text" placeholder="例：18000" className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">km</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">車身顏色</label>
            <input type="text" placeholder="例：消光黑" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-gray-600">車況備注</label>
            <textarea rows={2} placeholder="外觀狀況、改裝紀錄..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40 resize-none" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px]" style={{ color: "#F43F5E" }}>sell</span>
          <h2 className="text-sm font-semibold text-gray-800">意向購買資訊</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">意向購買車型 <span className="text-rose-500">*</span></label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
              <option value="">請選擇</option>
              {["Panigale V4", "Monster", "Multistrada V4", "Diavel V4", "Streetfighter V4", "Scrambler", "Hypermotard", "DesertX"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">意向購買年款</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
              <option value="">請選擇</option>
              {Array.from({ length: 5 }, (_, i) => 2025 - i).map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">意向色系</label>
            <input type="text" placeholder="例：Ducati Red" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-gray-600">車源現況</label>
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
              <option value="">請選擇</option>
              <option>在庫</option>
              <option>整備中</option>
              <option>在途</option>
              <option>外採上訂</option>
            </select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <label className="block text-xs font-medium text-gray-600">預算範圍（NT$）</label>
            <div className="flex items-center gap-3">
              <input type="number" placeholder="下限" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
              <span className="text-gray-400 text-sm">—</span>
              <input type="number" placeholder="上限" className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600">購買方式</label>
            <div className="flex gap-5">
              {["首購", "增購", "換購"].map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="purchaseMethod" value={opt} className="accent-rose-500" />
                  <span className="text-sm text-gray-700">{opt}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-gray-600">付款形式</label>
            <div className="flex gap-5">
              {["現金", "分期"].map((opt) => (
                <label key={opt} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="paymentForm" value={opt} className="accent-rose-500" />
                  <span className="text-sm text-gray-700">{opt}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          type="button"
          onClick={() => setFollowup1Open((v) => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]" style={{ color: "#F43F5E" }}>phone_callback</span>
            <h2 className="text-sm font-semibold text-gray-800">第一次跟進</h2>
            <span className="text-xs text-gray-400 ml-1">（可選填）</span>
          </div>
          <span className="material-symbols-outlined text-gray-400 text-[20px] transition-transform" style={{ transform: followup1Open ? "rotate(180deg)" : "rotate(0deg)" }}>
            expand_more
          </span>
        </button>
        {followup1Open && (
          <div className="px-6 pb-6 pt-2 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">跟進日期</label>
              <input type="date" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40" />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">跟進情況</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
                <option value="">請選擇</option>
                <option>前次邀約到店</option>
                <option>電話接通</option>
                <option>微信留言</option>
                <option>無法接通</option>
                <option>拒絕再談</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">客戶反映</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
                <option value="">請選擇</option>
                <option>Yes-預約進店</option>
                <option>Yes-考慮中</option>
                <option>No-</option>
                <option>Try-</option>
                <option>Fin-</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">客戶去向</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
                <option value="">請選擇</option>
                <option>瓜子二手車</option>
                <option>競品車商</option>
                <option>個人轉讓</option>
                <option>繼續持有</option>
                <option>其他</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-gray-600">跟進結果</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40">
                <option value="">請選擇</option>
                <option>確認成交</option>
                <option>持續跟進</option>
                <option>確認戰敗</option>
                <option>休眠</option>
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label className="block text-xs font-medium text-gray-600">反映簡述</label>
              <textarea rows={2} placeholder="客戶說了什麼..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400/40 resize-none" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <button
          type="button"
          className="px-5 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition-opacity hover:opacity-90 disabled:opacity-70 disabled:pointer-events-none"
          style={{ backgroundColor: "#F43F5E" }}
        >
          {saving ? (
            <>
              <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              儲存中...
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[18px]">save</span>
              儲存潛客
            </>
          )}
        </button>
      </div>
    </div>
  );
}
