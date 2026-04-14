"use client";

import { MockShell, MockCard, Field, MockInput, MockSelect, SaveBar } from "../_mock/mock-shell";

export default function Page() {
  return (
    <MockShell
      title="基本設定"
      breadcrumb={[{ label: "系統設定", href: "/settings/org" }, { label: "基本設定" }]}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold font-display text-on-surface">基本設定</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            門店資訊、業務規則與顯示語系等共用參數。
          </p>
        </div>
        <div className="flex gap-2">
          <button className="h-10 px-4 rounded-lg border border-outline-variant/40 text-sm font-medium text-on-surface hover:bg-surface-container-low">
            重設為預設
          </button>
          <button className="h-10 px-5 rounded-lg bg-[#CC0000] text-white text-sm font-medium hover:bg-[#a80000]">
            儲存設定
          </button>
        </div>
      </div>

      <MockCard title="門店資訊">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="經銷商名稱">
            <MockInput defaultValue="DUCATI 台北展示中心" />
          </Field>
          <Field label="經銷商代碼" hint="由總部配發，無法編輯">
            <MockInput defaultValue="DUCATI-TPE-001" disabled />
          </Field>
          <Field label="地址">
            <MockInput defaultValue="台北市信義區松仁路 100 號" />
          </Field>
          <Field label="營業時間">
            <MockInput defaultValue="週一至週六 09:00–21:00 / 週日 10:00–18:00" />
          </Field>
          <Field label="電話">
            <MockInput defaultValue="02-2345-6789" />
          </Field>
          <Field label="品牌">
            <MockSelect value="DUCATI" options={["DUCATI", "DUCATI Scrambler"]} />
          </Field>
          <Field label="所屬集團">
            <MockInput defaultValue="和泰機車" />
          </Field>
          <Field label="官方網站">
            <MockInput defaultValue="https://ducati.tw" />
          </Field>
        </div>
      </MockCard>

      <MockCard title="業務規則">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="手卡自動編號格式" hint="客戶接待手卡單據編號">
            <MockInput defaultValue="NC-YYYYMMDD-NNN" />
          </Field>
          <Field label="訂單自動編號格式">
            <MockInput defaultValue="ORD-YYYYMMDD-NNN" />
          </Field>
          <Field label="工單自動編號格式">
            <MockInput defaultValue="WO-YYYYMMDD-NNN" />
          </Field>
          <Field label="客戶級別定義" hint="A: 30 天內有交易 / B: 60 天內 / C: 90 天內 / D: 其餘">
            <MockInput defaultValue="A30 / B60 / C90 / D∞" />
          </Field>
          <Field label="線索自動關閉天數">
            <MockInput defaultValue="90" suffix="天" />
          </Field>
          <Field label="休眠客戶定義">
            <MockInput defaultValue="180" suffix="天未互動" />
          </Field>
          <Field label="回訪提醒頻率">
            <MockSelect value="每週" options={["每日", "每週", "每月"]} />
          </Field>
          <Field label="報價單有效期">
            <MockInput defaultValue="14" suffix="天" />
          </Field>
        </div>
      </MockCard>

      <MockCard title="顯示與地區">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="介面語言">
            <MockSelect value="繁體中文 (台灣)" options={["繁體中文 (台灣)", "English", "Italiano"]} />
          </Field>
          <Field label="時區">
            <MockSelect value="(GMT+8) Taipei" options={["(GMT+8) Taipei", "(GMT+1) Bologna", "(GMT+9) Tokyo"]} />
          </Field>
          <Field label="日期格式">
            <MockSelect value="YYYY/MM/DD" options={["YYYY/MM/DD", "DD/MM/YYYY", "MM/DD/YYYY"]} />
          </Field>
          <Field label="貨幣">
            <MockSelect value="TWD 新台幣" options={["TWD 新台幣", "EUR 歐元", "USD 美元"]} />
          </Field>
          <Field label="單位制">
            <MockSelect value="公制 (km / L)" options={["公制 (km / L)", "英制 (mi / gal)"]} />
          </Field>
          <Field label="第一個工作日">
            <MockSelect value="星期一" options={["星期日", "星期一"]} />
          </Field>
        </div>
      </MockCard>

      <SaveBar />
    </MockShell>
  );
}
