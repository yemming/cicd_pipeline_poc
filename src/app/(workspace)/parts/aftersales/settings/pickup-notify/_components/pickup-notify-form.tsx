"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  updatePickupNotifySettings,
  type PickupNotifySettings,
  type PickupNotifyChannels,
} from "@/domain/aftersales-pickup-notify";
import { useSetPageHeader } from "@/components/page-header-context";

type Props = {
  settings: PickupNotifySettings;
  canEdit: boolean;
};

type Banner = { ok: boolean; msg: string } | null;

export function PickupNotifyForm({ settings, canEdit }: Props) {
  useSetPageHeader({
    title: "取車通知設定",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales/repair-orders" },
      { label: "設定" },
      { label: "取車通知設定" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [pending, start] = useTransition();
  const [lineTpl, setLineTpl] = useState(settings.config.line_template);
  const [smsTpl, setSmsTpl] = useState(settings.config.sms_template);
  const [channels, setChannels] = useState<PickupNotifyChannels>(settings.config.default_channels);
  const [banner, setBanner] = useState<Banner>(null);
  // 用 stable ISO 子字串避開 toLocaleString 在 SSR / client 不同 TZ / locale 造成的 hydration mismatch
  const updatedLabel = settings.updated_at
    ? formatStableTimestamp(settings.updated_at)
    : null;

  const dirty =
    lineTpl !== settings.config.line_template ||
    smsTpl !== settings.config.sms_template ||
    channels.line !== settings.config.default_channels.line ||
    channels.sms !== settings.config.default_channels.sms ||
    channels.phone !== settings.config.default_channels.phone;

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) {
      setTimeout(() => setBanner(null), 2200);
    }
  }

  function reset() {
    setLineTpl(settings.config.line_template);
    setSmsTpl(settings.config.sms_template);
    setChannels(settings.config.default_channels);
    setBanner(null);
  }

  function save() {
    if (!canEdit || pending) return;
    start(async () => {
      const res = await updatePickupNotifySettings({
        line_template: lineTpl,
        sms_template: smsTpl,
        default_channels: channels,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存通知設定" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const lineLen = lineTpl.length;
  const smsLen = smsTpl.length;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">取車通知設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          AS-Settings
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定 LINE / SMS 通知範本與預設通知管道；竣工複檢通過後 SA 手動觸發發送
        </span>
        {updatedLabel && (
          <span className="text-[11px] text-[#9A9890] ml-auto" suppressHydrationWarning>
            最後更新：{updatedLabel}
          </span>
        )}
      </header>

      {/* Info Alert */}
      <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-lg px-4 py-2.5 text-[12px] text-[#185FA5] leading-relaxed">
        📱 SA 手動確認後才會發送通知，系統不會自動推播。確認按鈕設計為「緩衝機制」，讓 SA
        在車輛準備妥當後再通知車主。
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* LEFT 2/3 — 範本設定 */}
        <section className="lg:col-span-2 bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">⚙️ 通知範本設定</span>
            <span className="text-[11px] text-[#9A9890]">
              支援變數：{"{車主姓名}"} / {"{車型}"} / {"{車牌}"} / {"{工單號}"}
            </span>
          </header>
          <div className={`px-4 py-4 space-y-4 ${pending ? "opacity-60 pointer-events-none" : ""}`}>
            {/* LINE */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[11.5px] font-semibold text-[#5A5955]">
                  LINE 通知範本 <span className="text-[#CC0000]">*</span>
                </label>
                <span
                  className={`text-[11px] ${
                    lineLen > 600 ? "text-[#CC0000]" : "text-[#9A9890]"
                  }`}
                >
                  {lineLen} / 600
                </span>
              </div>
              <textarea
                value={lineTpl}
                disabled={!canEdit || pending}
                onChange={(e) => setLineTpl(e.target.value)}
                rows={6}
                className="w-full border border-[#D5D3CB] rounded p-2.5 text-[12.5px] font-mono leading-relaxed bg-[#F8F7F4] focus:bg-white focus:border-[#185FA5] focus:outline-none resize-y disabled:opacity-60"
                placeholder="親愛的 {車主姓名} 您好…"
              />
            </div>

            {/* SMS */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className="text-[11.5px] font-semibold text-[#5A5955]">
                  簡訊（SMS）通知範本 <span className="text-[#CC0000]">*</span>
                </label>
                <span
                  className={`text-[11px] ${
                    smsLen > 70 ? "text-[#CC0000]" : "text-[#9A9890]"
                  }`}
                >
                  {smsLen} / 70（單則上限）
                </span>
              </div>
              <textarea
                value={smsTpl}
                disabled={!canEdit || pending}
                onChange={(e) => setSmsTpl(e.target.value)}
                rows={3}
                className="w-full border border-[#D5D3CB] rounded p-2.5 text-[12.5px] font-mono leading-relaxed bg-[#F8F7F4] focus:bg-white focus:border-[#185FA5] focus:outline-none resize-y disabled:opacity-60"
                placeholder="{車主姓名} 您好…"
              />
            </div>

            {/* 預設通知方式 */}
            <div className="flex flex-col gap-2">
              <label className="text-[11.5px] font-semibold text-[#5A5955]">預設通知方式</label>
              <div className="flex gap-3 flex-wrap">
                {(
                  [
                    { key: "line", label: "LINE", icon: "💬" },
                    { key: "sms", label: "簡訊", icon: "📱" },
                    { key: "phone", label: "電話提醒", icon: "📞" },
                  ] as const
                ).map((c) => (
                  <label
                    key={c.key}
                    className={`flex items-center gap-2 px-3 h-[36px] border rounded-md text-[12.5px] cursor-pointer ${
                      channels[c.key]
                        ? "bg-[#EAF4FB] border-[#85B7EB] text-[#185FA5]"
                        : "bg-white border-[#D5D3CB] text-[#5A5955]"
                    } ${!canEdit || pending ? "opacity-60 cursor-not-allowed" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={channels[c.key]}
                      disabled={!canEdit || pending}
                      onChange={(e) =>
                        setChannels({ ...channels, [c.key]: e.target.checked })
                      }
                      className="accent-[#1A3A5C]"
                    />
                    <span>
                      {c.icon} {c.label}
                    </span>
                  </label>
                ))}
              </div>
              <span className="text-[11px] text-[#9A9890]">
                至少需勾選一種；個別工單仍可在發送時臨時調整
              </span>
            </div>

            {/* Save Bar */}
            <div className="flex items-center gap-2 pt-2 border-t border-[#EEECE6]">
              <button
                onClick={save}
                disabled={!canEdit || pending || !dirty}
                className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {pending ? "儲存中⋯" : "儲存範本"}
              </button>
              <button
                onClick={reset}
                disabled={pending || !dirty}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                重設
              </button>
              {!canEdit && (
                <span className="text-[11px] text-[#9A9890] ml-2">
                  （無編輯權限，僅檢視）
                </span>
              )}
              {dirty && canEdit && (
                <span className="text-[11px] text-[#854F0B] ml-auto">尚有未儲存的變更</span>
              )}
            </div>
          </div>
        </section>

        {/* RIGHT 1/3 — 預覽 + 統計 */}
        <aside className="space-y-3">
          {/* 預覽 */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">👁️ LINE 預覽</span>
            </header>
            <div className="px-4 py-3">
              <div className="bg-[#06C755] text-white text-[10px] px-2 py-0.5 rounded inline-block mb-2">
                LINE
              </div>
              <div className="border border-[#EEECE6] rounded-lg p-3 bg-[#F8F7F4] text-[12px] whitespace-pre-wrap font-mono leading-relaxed text-[#2C2C2A]">
                {lineTpl
                  .replace("{車主姓名}", "鄭宗勳")
                  .replace("{車型}", "PANIGALE V2")
                  .replace("{車牌}", "LGX-8096")
                  .replace("{工單號}", "MN-CP-260508-003") || "（範本為空）"}
              </div>
            </div>
          </section>

          {/* 統計 placeholder */}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">📊 今日通知統計</span>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12.5px]">
              <Stat label="已發送通知" value="—" />
              <Stat label="待發送" value="—" />
              <Stat label="平均等候時間" value="—" />
              <p className="text-[10.5px] text-[#9A9890] pt-2 border-t border-[#EEECE6] leading-relaxed">
                統計資料將於串接 notification_deliveries 後自動填入。
              </p>
            </div>
          </section>
        </aside>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatStableTimestamp(iso: string): string {
  // 顯示 UTC+8 wall-clock (Asia/Taipei)，但用純算數避免 toLocaleString 的 SSR/client TZ 差異
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const y = t.getUTCFullYear();
  const m = pad(t.getUTCMonth() + 1);
  const day = pad(t.getUTCDate());
  const hh = pad(t.getUTCHours());
  const mm = pad(t.getUTCMinutes());
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[#F2F2F2] last:border-b-0">
      <span className="text-[#5A5955]">{label}</span>
      <span className="font-semibold text-[#2C2C2A]">{value}</span>
    </div>
  );
}
