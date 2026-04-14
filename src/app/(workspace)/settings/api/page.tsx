"use client";

import { MockShell, MockCard, MockToggle } from "../_mock/mock-shell";

const integrations = [
  { name: "Ducati HQ DMS",     desc: "總部保固 / 車型主檔同步",          status: "已連線",   color: "green",  icon: "two_wheeler" },
  { name: "玉山銀行金流",       desc: "分期 / 刷卡授權",                 status: "已連線",   color: "green",  icon: "account_balance" },
  { name: "富邦產險 API",       desc: "強制 / 任意險試算・投保",         status: "已連線",   color: "green",  icon: "verified_user" },
  { name: "LINE Notify",       desc: "推播顧問 / 客戶群組通知",          status: "已連線",   color: "green",  icon: "chat" },
  { name: "Google Maps",       desc: "客戶地址解析 / 試乘路線",          status: "已連線",   color: "green",  icon: "map" },
  { name: "Meta Lead Ads",     desc: "FB / IG 線索自動進站",             status: "待重新授權", color: "amber", icon: "search" },
  { name: "電子發票 (綠界)",    desc: "開立 B2B / B2C 發票",             status: "已連線",   color: "green",  icon: "receipt" },
  { name: "Zeabur Webhook",    desc: "部署通知到 #dealeros-ops",         status: "未啟用",   color: "gray",   icon: "webhook" },
];

const tokens = [
  { name: "顧問 App (iOS/Android)", prefix: "sk_live_xxx…a3f2", created: "2026/01/12", lastUsed: "2026/04/14 08:12" },
  { name: "n8n 自動化流程",          prefix: "sk_live_xxx…7c91", created: "2026/02/05", lastUsed: "2026/04/14 07:00" },
  { name: "BI Dashboard (Metabase)", prefix: "sk_live_xxx…44de", created: "2026/03/20", lastUsed: "2026/04/13 22:30" },
];

const statusClass: Record<string, string> = {
  green: "bg-green-50 text-green-700",
  amber: "bg-amber-50 text-amber-700",
  gray:  "bg-surface-container-low text-on-surface-variant",
};

export default function Page() {
  return (
    <MockShell
      title="API 整合"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "API 整合" }]}
      tabs={[
        { label: "第三方串接", active: true },
        { label: "API 金鑰" },
        { label: "Webhooks" },
      ]}
    >
      <MockCard title="第三方串接">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {integrations.map((i) => (
            <div
              key={i.name}
              className="rounded-xl border border-outline-variant/20 p-4 bg-white flex items-center gap-4"
            >
              <span className="w-10 h-10 rounded-lg bg-[#CC0000]/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[#CC0000]">{i.icon}</span>
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-bold text-on-surface text-sm truncate">{i.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${statusClass[i.color]}`}>
                    {i.status}
                  </span>
                </div>
                <div className="text-xs text-on-surface-variant truncate">{i.desc}</div>
              </div>
              <MockToggle on={i.color === "green"} />
            </div>
          ))}
        </div>
      </MockCard>

      <MockCard
        title="API 金鑰"
        action={
          <button className="h-9 px-4 rounded-lg bg-[#CC0000] text-white text-sm font-medium hover:bg-[#a80000] flex items-center gap-1">
            <span className="material-symbols-outlined text-base">key</span>
            建立金鑰
          </button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-on-surface-variant border-b border-outline-variant/30">
                <th className="py-2 px-2 font-medium">名稱</th>
                <th className="py-2 px-2 font-medium">金鑰</th>
                <th className="py-2 px-2 font-medium">建立日</th>
                <th className="py-2 px-2 font-medium">最後使用</th>
                <th className="py-2 px-2 font-medium w-32 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {tokens.map((t) => (
                <tr key={t.name} className="border-b border-outline-variant/15">
                  <td className="py-3 px-2 font-medium text-on-surface">{t.name}</td>
                  <td className="py-3 px-2 font-mono text-xs text-on-surface-variant">{t.prefix}</td>
                  <td className="py-3 px-2 text-xs text-on-surface-variant">{t.created}</td>
                  <td className="py-3 px-2 text-xs text-on-surface-variant">{t.lastUsed}</td>
                  <td className="py-3 px-2 text-right space-x-3">
                    <button className="text-xs text-on-surface-variant hover:underline">輪替</button>
                    <button className="text-xs text-[#CC0000] hover:underline">撤銷</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </MockCard>

      <MockCard title="Webhook Endpoints">
        <div className="rounded-xl border border-outline-variant/20 p-5 bg-white">
          <div className="flex items-center justify-between mb-2">
            <div className="font-mono text-xs text-on-surface">
              POST&nbsp; https://api.dealeros.ducati.tw/webhooks/<span className="text-[#CC0000]">order.created</span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-semibold">● Active</span>
          </div>
          <div className="text-xs text-on-surface-variant">
            最近 24 小時：142 次觸發・成功率 99.3%
          </div>
        </div>
      </MockCard>
    </MockShell>
  );
}
