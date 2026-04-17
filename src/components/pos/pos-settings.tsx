"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

export function PosSettings() {
  useSetPageHeader({
    breadcrumb: [{ label: "POS 收銀", href: "/pos" }, { label: "POS 設定" }],
  });

  const [payCash, setPayCash] = useState(true);
  const [payTransfer, setPayTransfer] = useState(true);
  const [payLinePay, setPayLinePay] = useState(true);
  const [offlineMode, setOfflineMode] = useState(false);
  const [lowStockAlert, setLowStockAlert] = useState(true);
  const [storeName, setStoreName] = useState("Ducati Taipei");
  const [storeAddress, setStoreAddress] = useState("台北市信義區松仁路 100 號");

  return (
    <div className="max-w-3xl space-y-4">
      <SettingCard
        title="店家資訊"
        icon="storefront"
        description="會顯示在收據 / 發票抬頭，以及月報檔案標題"
      >
        <TextInput label="店名" value={storeName} onChange={setStoreName} />
        <TextInput label="店址" value={storeAddress} onChange={setStoreAddress} />
      </SettingCard>

      <SettingCard
        title="收款方式"
        icon="payments"
        description="關閉的方式不會出現在收款 Wizard 選單"
      >
        <ToggleRow
          label="現金"
          sub="現場收現，系統計算找零"
          value={payCash}
          onChange={setPayCash}
        />
        <ToggleRow
          label="銀行轉帳"
          sub="顯示店家帳戶資訊"
          value={payTransfer}
          onChange={setPayTransfer}
        />
        <ToggleRow
          label="LINE Pay"
          sub="QR Code 掃碼付款"
          value={payLinePay}
          onChange={setPayLinePay}
        />
      </SettingCard>

      <SettingCard
        title="進階"
        icon="tune"
        description="可選設定，依需求開啟"
      >
        <ToggleRow
          label="低庫存預警"
          sub="商品庫存低於警戒值時，在商品頁顯示橘色 chip"
          value={lowStockAlert}
          onChange={setLowStockAlert}
        />
        <ToggleRow
          label="離線模式"
          sub="網路中斷時繼續收銀，上線後自動同步（Phase 2）"
          value={offlineMode}
          onChange={setOfflineMode}
          disabled
        />
      </SettingCard>

      <SettingCard
        title="角色權限"
        icon="admin_panel_settings"
        description="Phase 2 接入 RBAC，目前 demo 全員皆可操作所有功能"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <RolePreviewCard
            name="老闆"
            icon="workspace_premium"
            perms={["全部功能", "報表與匯出", "權限管理"]}
          />
          <RolePreviewCard
            name="員工"
            icon="badge"
            perms={["快速收銀", "中古車銷售", "商品查詢"]}
          />
        </div>
      </SettingCard>
    </div>
  );
}

function SettingCard({
  title,
  icon,
  description,
  children,
}: {
  title: string;
  icon: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <header className="px-5 pt-5 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-indigo-600 text-[22px]">{icon}</span>
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
        </div>
      </header>
      <div className="px-5 pb-5 space-y-3">{children}</div>
    </section>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 px-4 text-sm text-slate-900 bg-slate-50 rounded-lg border-2 border-transparent focus:bg-white focus:border-indigo-400 outline-none"
      />
    </div>
  );
}

function ToggleRow({
  label,
  sub,
  value,
  onChange,
  disabled,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">
          {label}
          {disabled && (
            <span className="ml-2 text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              Phase 2
            </span>
          )}
        </p>
        {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!value)}
        disabled={disabled}
        className={`relative w-12 h-7 rounded-full transition-colors ${
          disabled
            ? "bg-slate-100 cursor-not-allowed"
            : value
              ? "bg-indigo-600"
              : "bg-slate-300"
        }`}
        aria-label={label}
      >
        <span
          className={`absolute top-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${
            value ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

function RolePreviewCard({
  name,
  icon,
  perms,
}: {
  name: string;
  icon: string;
  perms: string[];
}) {
  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="material-symbols-outlined text-indigo-600 text-[20px]">{icon}</span>
        <span className="text-sm font-bold text-slate-800">{name}</span>
      </div>
      <ul className="space-y-1">
        {perms.map((p) => (
          <li key={p} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="material-symbols-outlined text-emerald-500 text-[14px]">check</span>
            {p}
          </li>
        ))}
      </ul>
    </div>
  );
}
