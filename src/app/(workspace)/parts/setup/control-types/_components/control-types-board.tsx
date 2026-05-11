"use client";

import type { BusinessRuleRow, ControlTypeConfig, ControlTypeBadge } from "@/domain/rules";

// Phase 1: 「商品類型分佈」用 mock 數字（HTML 規格值）；之後串 items 表 group by 動態算
const MOCK_DISTRIBUTION = [
  { accent: "red" as const, label: "A 類", pct: 18, count: 243 },
  { accent: "amber" as const, label: "B 類", pct: 42, count: 568 },
  { accent: "teal" as const, label: "C 類", pct: 40, count: 541 },
];

const ACCENT_PALETTE: Record<
  ControlTypeConfig["accent"],
  { border: string; head: string; bar: string }
> = {
  red: {
    border: "border-[#CC0000]",
    head: "bg-[#CC0000]",
    bar: "bg-[#CC0000]",
  },
  amber: {
    border: "border-[#854F0B]",
    head: "bg-[#854F0B]",
    bar: "bg-[#854F0B]",
  },
  teal: {
    border: "border-[#0F6E56]",
    head: "bg-[#0F6E56]",
    bar: "bg-[#0F6E56]",
  },
};

const BADGE_PALETTE: Record<ControlTypeBadge["kind"], string> = {
  red: "bg-[#FDECEA] text-[#CC0000]",
  pend: "bg-[#FDF3E3] text-[#854F0B]",
  gry: "bg-[#F2F2F2] text-[#6B6A68]",
  done: "bg-[#EAF3DE] text-[#3B6D11]",
};

export function ControlTypesBoard({
  controlTypes,
}: {
  controlTypes: BusinessRuleRow[];
}) {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">管控類型定義</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          1.5
        </span>
        <span className="text-[12px] text-[#9A9890]">
          定義 A / B / C 類商品的管控規則，影響補貨、盤點、告警行為
        </span>
      </header>

      {/* 三張類別卡 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {controlTypes.map((rule) => {
          const cfg = (rule.config ?? {}) as Partial<ControlTypeConfig>;
          const accent = cfg.accent ?? "teal";
          const palette = ACCENT_PALETTE[accent];
          return (
            <section
              key={rule.id}
              className={`bg-white border-2 rounded-lg overflow-hidden ${palette.border}`}
            >
              <header className={`px-4 py-2.5 ${palette.head} text-white`}>
                <div className="text-[16px] font-bold">{cfg.class_label ?? "—"}</div>
                <div className="text-[11px] opacity-85 mt-0.5">{cfg.tier_label ?? ""}</div>
              </header>
              <div className="px-4 py-3 flex flex-col gap-1.5 text-[12px] text-[#2C2C2A]">
                <KvLine label="金額基準" value={cfg.amount_basis ?? "—"} />
                <KvLine label="盤點頻率" value={cfg.count_frequency ?? "—"} />
                <KvLineBadge label="序列號追蹤" badge={cfg.serial_tracking} />
                <KvLineBadge label="出庫審核" badge={cfg.issue_approval} />
                <KvLine
                  label="告警差異容許"
                  value={`${cfg.tolerance_pct ?? 0}%`}
                />
                <div className="text-[12px] text-[#9A9890] mt-1">
                  例：{cfg.examples ?? "—"}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      {/* 商品類型分佈 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            商品類型分佈（目前庫存）
          </h2>
        </header>
        <div className="px-4 py-4 flex items-center gap-6 flex-wrap">
          <div className="flex-1 min-w-[200px] h-2 rounded-md overflow-hidden flex">
            {MOCK_DISTRIBUTION.map((d) => (
              <div
                key={d.label}
                className={ACCENT_PALETTE[d.accent].bar}
                style={{ width: `${d.pct}%` }}
                title={`${d.label} ${d.pct}%`}
              />
            ))}
          </div>
          <div className="flex gap-4 text-[12px] flex-wrap">
            {MOCK_DISTRIBUTION.map((d) => (
              <span key={d.label} className="flex items-center gap-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-sm ${ACCENT_PALETTE[d.accent].bar}`}
                />
                {d.label} {d.pct}% ({d.count} 料號)
              </span>
            ))}
          </div>
        </div>
        <div className="px-4 py-2 border-t border-[#EEECE6] bg-white text-[11px] text-[#9A9890]">
          💡 分佈數據目前為示意值，未來將從商品主檔動態計算（按 control_type 欄分群）
        </div>
      </section>
    </main>
  );
}

function KvLine({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <b className="text-[#2C2C2A]">{label}：</b>
      <span>{value}</span>
    </div>
  );
}

function KvLineBadge({
  label,
  badge,
}: {
  label: string;
  badge: ControlTypeBadge | undefined;
}) {
  return (
    <div>
      <b className="text-[#2C2C2A]">{label}：</b>
      {badge ? (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${BADGE_PALETTE[badge.kind]}`}
        >
          {badge.label}
        </span>
      ) : (
        <span>—</span>
      )}
    </div>
  );
}
