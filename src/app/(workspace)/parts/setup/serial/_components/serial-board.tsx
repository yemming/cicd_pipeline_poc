"use client";

import type { BusinessRuleRow, SerialTrackingConfig } from "@/domain/rules";

const TONE_PALETTE: Record<
  SerialTrackingConfig["tone"],
  { bg: string; border: string; titleColor: string }
> = {
  red: { bg: "bg-[#FDECEA]", border: "border-[#F5AEAD]", titleColor: "text-[#CC0000]" },
  amber: { bg: "bg-[#FDF3E3]", border: "border-[#FAC775]", titleColor: "text-[#854F0B]" },
  neutral: { bg: "bg-[#F8F7F4]", border: "border-[#EEECE6]", titleColor: "text-[#2C2C2A]" },
};

export function SerialBoard({ rules }: { rules: BusinessRuleRow[] }) {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">序列號 / 批號追蹤設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          3.5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定哪些備件需要序列號追蹤・追蹤規則與查詢
        </span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 左：追蹤規則 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">追蹤規則設定</h2>
            <button
              type="button"
              disabled
              title="Phase 2 開放"
              className="h-[26px] px-3 rounded text-[11.5px] bg-[#1A3A5C] text-white opacity-60 cursor-not-allowed"
            >
              儲存
            </button>
          </header>
          <div className="px-4 py-3 flex flex-col gap-2.5">
            {rules.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] text-center py-6">尚無設定</div>
            ) : (
              rules.map((rule) => {
                const cfg = (rule.config ?? {}) as Partial<SerialTrackingConfig>;
                const tone = cfg.tone ?? "neutral";
                const palette = TONE_PALETTE[tone];
                return (
                  <div key={rule.id} className={`px-3 py-2.5 rounded-md border ${palette.bg} ${palette.border}`}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className={`text-[12.5px] font-semibold ${palette.titleColor}`}>
                        {cfg.label ?? "—"}
                      </div>
                      <label className="text-[12px] text-[#5A5955] flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={!!cfg.required || !!cfg.by_category}
                          disabled
                        />
                        {cfg.required ? "強制序列號" : cfg.by_category ? "部分品類啟用" : "不追蹤（預設）"}
                      </label>
                    </div>
                    <div className="text-[12px] text-[#5A5955]">{cfg.description ?? "—"}</div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* 右：序列號查詢 placeholder */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">序列號查詢</h2>
          </header>
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex flex-col gap-1 flex-1">
                <label className="text-[11px] text-[#9A9890] font-medium">輸入序列號</label>
                <input
                  type="text"
                  placeholder="掃描或輸入序列號..."
                  disabled
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 font-mono text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]"
                />
              </div>
              <button
                type="button"
                disabled
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white opacity-60 cursor-not-allowed"
              >
                查詢
              </button>
            </div>
            <div className="bg-[#F8F7F4] rounded-md px-3 py-2.5 text-[12px] text-[#9A9890] text-center">
              輸入序列號後顯示完整軌跡記錄（Phase 2 接通 stock_items 即時查）
            </div>
          </div>
        </section>
      </div>
      <div className="text-[11px] text-[#9A9890]">
        💡 規則已從舊 parts_serial_tracking_rules 遷移到 business_rules（rule_kind=serial_tracking）。Phase 2 接編輯 + 序列號軌跡查詢。
      </div>
    </main>
  );
}
