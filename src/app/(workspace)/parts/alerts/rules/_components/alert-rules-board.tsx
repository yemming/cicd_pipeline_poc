"use client";

import type { BusinessRuleRow, AlertRuleConfig } from "@/domain/rules";

const TONE_PALETTE: Record<AlertRuleConfig["tone"], { bg: string; border: string; titleColor: string }> = {
  red: { bg: "bg-[#FDECEA]", border: "border-[#F5AEAD]", titleColor: "text-[#CC0000]" },
  amber: { bg: "bg-[#FDF3E3]", border: "border-[#FAC775]", titleColor: "text-[#854F0B]" },
  navy: { bg: "bg-[#EBF3FF]", border: "border-[#B5D4F4]", titleColor: "text-[#1A3A5C]" },
  neutral: { bg: "bg-[#F8F7F4]", border: "border-[#EEECE6]", titleColor: "text-[#2C2C2A]" },
};

const PRIORITY_LABEL: Record<AlertRuleConfig["priority"], string> = {
  critical: "緊急",
  high: "高",
  normal: "一般",
  low: "低",
};

export function AlertRulesBoard({ rules }: { rules: BusinessRuleRow[] }) {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">告警類型與規則</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.2
        </span>
        <span className="text-[12px] text-[#9A9890]">系統告警類型定義與觸發條件</span>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rules.length === 0 ? (
          <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center text-[12px] text-[#9A9890] col-span-2">
            尚無告警規則
          </div>
        ) : (
          rules.map((rule) => {
            const cfg = (rule.config ?? {}) as Partial<AlertRuleConfig>;
            const tone = cfg.tone ?? "neutral";
            const palette = TONE_PALETTE[tone];
            return (
              <section
                key={rule.id}
                className={`${palette.bg} border-2 ${palette.border} rounded-lg overflow-hidden`}
              >
                <header className="px-4 py-2.5 border-b border-[#EEECE6]">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className={`text-[13px] font-semibold ${palette.titleColor}`}>
                        {cfg.label ?? "—"}
                      </div>
                      <div className="font-mono text-[11px] text-[#9A9890] mt-0.5">{cfg.code}</div>
                    </div>
                    {cfg.priority && (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${palette.bg} ${palette.titleColor}`}>
                        {PRIORITY_LABEL[cfg.priority]}
                      </span>
                    )}
                  </div>
                </header>
                <div className="px-4 py-3 bg-white">
                  <p className="text-[12.5px] text-[#5A5955] mb-3">{cfg.description ?? "—"}</p>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-[#9A9890]">通知通道：</span>
                    {(cfg.channels ?? []).map((ch) => (
                      <span
                        key={ch}
                        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#EAF4FB] text-[#185FA5]"
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
