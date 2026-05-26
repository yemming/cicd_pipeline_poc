"use client";

import { useState, useTransition, useEffect } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import type {
  KpiTargetsPageData,
  KpiTargetRow,
  HabcThresholdRow,
} from "@/domain/sales-kpi-targets";
import {
  updateSalesKpiTarget,
  updateHabcThreshold,
} from "@/domain/sales-kpi-targets";
import { HABC_ACCENT } from "@/domain/sales-kpi-targets.constants";

type BannerState = { ok: boolean; msg: string } | null;

export default function KpiTargetsView({ data }: { data: KpiTargetsPageData }) {
  useSetPageHeader({
    title: "KPI 目標與 HABC 閾值",
    breadcrumb: [{ label: "銷售管理" }, { label: "主管工作台" }, { label: "KPI 目標與 HABC 閾值" }],
  });

  const [banner, setBanner] = useState<BannerState>(null);
  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  function showBanner(b: BannerState) {
    setBanner(b);
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">KPI 目標與 HABC 閾值</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">RS_M3 主管設定</span>
        <span className="text-[12px] text-[#9A9890]">Layer 1 結果指標 / Layer 2 過程指標 / HABC 級別天數閾值；儲存後同步至 RS_M1 漏斗看板紅 / 黃 / 綠標示</span>
      </header>

      <section className="rounded-lg border border-[#85B7EB] bg-[#EAF4FB] px-4 py-3 text-[12px] leading-[1.7] text-[#0C3E70]">
        <div className="font-semibold mb-1">📋 三段設定說明</div>
        <ul className="ml-4 list-disc space-y-0.5">
          <li><strong>Layer 1 結果指標</strong>：給總經理看的成果指標（成交台數 / 訂車台數 / 成交率），影響 RS_M1 看板紅／黃／綠標示</li>
          <li><strong>Layer 2 過程指標</strong>：給銷售主管看的流程指標（建檔率 / 試駕率 / 報價率…），影響儀表盤指針位置與警示顏色</li>
          <li><strong>HABC 閾值</strong>：系統依「購買時機 × 試駕狀態」自動建議 HABC 級別的天數條件，RS 可採用或手動覆蓋</li>
          <li>所有變更<strong>即存即生效</strong>，不需「儲存所有」整批送出</li>
        </ul>
      </section>

      <KpiSection
        title="Layer 1 — 結果指標目標值"
        subtitle="給總經理看的成果指標，影響 RS_M1 看板紅／黃／綠標示"
        icon="🏆"
        iconBg="bg-[#FDF3E3]"
        rows={data.layer1}
        onBanner={showBanner}
      />

      <KpiSection
        title="Layer 2 — 過程指標目標值"
        subtitle="給銷售主管看的流程指標，影響 RS_M1 儀表盤指針位置與警示顏色"
        icon="🎯"
        iconBg="bg-[#EAF4FB]"
        rows={data.layer2}
        onBanner={showBanner}
      />

      <HabcSection rows={data.habc} onBanner={showBanner} />

      {banner && (
        <div
          className={
            "fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 " +
            (banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]")
          }
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

// ────────────────────────────── KPI Section (Layer 1 / 2 共用) ──────────────────────────────

function KpiSection({
  title,
  subtitle,
  icon,
  iconBg,
  rows,
  onBanner,
}: {
  title: string;
  subtitle: string;
  icon: string;
  iconBg: string;
  rows: KpiTargetRow[];
  onBanner: (b: BannerState) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-lg border border-[#EEECE6] bg-white overflow-hidden">
      <header
        className="flex items-center justify-between px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className={"w-[30px] h-[30px] rounded-md flex items-center justify-center text-[14px] " + iconBg}>{icon}</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
            <div className="text-[11px] text-[#9A9890]">{subtitle}</div>
          </div>
        </div>
        <div className="text-[12px] text-[#9A9890] flex items-center gap-1.5">
          <span>{rows.length} 項</span>
          <span className={"inline-block transition-transform " + (open ? "rotate-90" : "")}>›</span>
        </div>
      </header>
      {open && (
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map((r) => (
            <KpiItem key={r.id} row={r} onBanner={onBanner} />
          ))}
        </div>
      )}
    </section>
  );
}

function KpiItem({ row, onBanner }: { row: KpiTargetRow; onBanner: (b: BannerState) => void }) {
  const [value, setValue] = useState<number>(row.config.value);
  const [isPending, startTransition] = useTransition();
  const dirty = value !== row.config.value;

  function save(next: number) {
    startTransition(async () => {
      const res = await updateSalesKpiTarget(row.id, next);
      if (res.ok) onBanner({ ok: true, msg: `✓ 已更新「${row.config.label}」` });
      else {
        onBanner({ ok: false, msg: res.error });
        setValue(row.config.value);
      }
    });
  }

  function reset() {
    setValue(row.config.default_value);
    save(row.config.default_value);
  }

  return (
    <div
      data-testid={`kpi-${row.config.key}`}
      className={"rounded-lg border border-[#EEECE6] bg-[#F8F7F4] p-3 " + (isPending ? "opacity-60" : "")}
    >
      <div className="flex items-center gap-1.5 mb-0.5">
        {row.config.icon && <span className="text-[14px]">{row.config.icon}</span>}
        <div className="text-[11.5px] font-semibold text-[#4A4A48]">{row.config.label}</div>
      </div>
      <div className="text-[11px] text-[#9A9890] leading-[1.5]">{row.config.description}</div>
      <div className="flex items-center gap-2.5 mt-2.5">
        <input
          type="number"
          className="w-[80px] h-[30px] px-2 text-center font-mono font-semibold text-[14px] text-[#2C2C2A] rounded border border-[#D5D3CB] bg-white focus:border-[#185FA5] outline-none"
          value={value}
          min={row.config.min}
          max={row.config.max}
          onChange={(e) => setValue(Number(e.target.value))}
          onBlur={() => dirty && save(value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && save(value)}
          disabled={isPending}
        />
        <span className="text-[11.5px] text-[#7A7A78]">{row.config.unit}</span>
        <button
          className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#9A9890] hover:bg-[#F4F3F0]"
          onClick={reset}
          disabled={isPending}
        >
          還原預設（{row.config.default_value}）
        </button>
        {isPending && <span className="text-[11px] text-[#185FA5]">儲存中⋯</span>}
      </div>
    </div>
  );
}

// ────────────────────────────── HABC Section ──────────────────────────────

function HabcSection({
  rows,
  onBanner,
}: {
  rows: HabcThresholdRow[];
  onBanner: (b: BannerState) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded-lg border border-[#EEECE6] bg-white overflow-hidden">
      <header
        className="flex items-center justify-between px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] rounded-md flex items-center justify-center text-[14px] bg-[#E1F5EE]">🎯</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">HABC 輔助判斷閾值設定</div>
            <div className="text-[11px] text-[#9A9890]">系統自動推算 HABC 建議級別的天數條件，RS 可採用或手動覆蓋</div>
          </div>
        </div>
        <div className="text-[12px] text-[#9A9890] flex items-center gap-1.5">
          <span>{rows.length} 項</span>
          <span className={"inline-block transition-transform " + (open ? "rotate-90" : "")}>›</span>
        </div>
      </header>
      {open && (
        <div className="px-4 py-3 space-y-2">
          <div className="rounded-md bg-[#EAF4FB] border border-[#85B7EB] px-3 py-2 text-[11.5px] text-[#0C3E70] leading-[1.6]">
            💡 系統根據「購買時機」×「試駕狀態」自動建議 HABC 級別，顯示為提示框（非強制），RS 可採用或手動調整後才存檔。
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {rows.map((r) => (
              <HabcCard key={r.id} row={r} onBanner={onBanner} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

const HABC_NAME: Record<string, string> = { H: "高度意願", A: "中度意願", B: "低度意願", C: "保留意願" };

function HabcCard({ row, onBanner }: { row: HabcThresholdRow; onBanner: (b: BannerState) => void }) {
  const [value, setValue] = useState<number>(row.config.value);
  const [isPending, startTransition] = useTransition();
  const dirty = value !== row.config.value;
  const accent = HABC_ACCENT[row.config.key];

  function save(next: number) {
    startTransition(async () => {
      const res = await updateHabcThreshold(row.id, next);
      if (res.ok) onBanner({ ok: true, msg: `✓ 已更新「${row.config.key} 級 ${row.config.label}」` });
      else {
        onBanner({ ok: false, msg: res.error });
        setValue(row.config.value);
      }
    });
  }

  function reset() {
    setValue(row.config.default_value);
    save(row.config.default_value);
  }

  return (
    <div
      data-testid={`habc-${row.config.key}`}
      className={
        "rounded-lg border p-3 " +
        accent.bg +
        " " +
        accent.border +
        " " +
        (isPending ? "opacity-60" : "")
      }
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className={"w-[28px] h-[28px] rounded-full text-white text-[14px] font-bold flex items-center justify-center " + accent.letterBg}>
          {row.config.key}
        </div>
        <div>
          <div className={"text-[12.5px] font-semibold " + accent.text}>{HABC_NAME[row.config.key]}</div>
          <div className="text-[10.5px] text-[#7A7A78]">{row.config.label}</div>
        </div>
      </div>
      <div className="text-[11px] text-[#5A5955] leading-[1.55] min-h-[40px]">{row.config.description}</div>
      <div className="flex items-center gap-2 mt-2.5">
        <span className="text-[11px] text-[#7A7A78]">天數</span>
        <input
          type="number"
          className="w-[72px] h-[30px] px-2 text-center font-mono font-semibold text-[14px] text-[#2C2C2A] rounded border border-[#D5D3CB] bg-white focus:border-[#185FA5] outline-none"
          value={value}
          min={row.config.min}
          max={row.config.max}
          onChange={(e) => setValue(Number(e.target.value))}
          onBlur={() => dirty && save(value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && save(value)}
          disabled={isPending}
        />
        <span className="text-[11px] text-[#7A7A78]">{row.config.unit}</span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <button
          className="h-[22px] px-1.5 rounded text-[10.5px] bg-white border border-[#D5D3CB] text-[#9A9890] hover:bg-[#F4F3F0]"
          onClick={reset}
          disabled={isPending}
        >
          還原預設（{row.config.default_value}）
        </button>
        {isPending && <span className="text-[10.5px] text-[#185FA5]">儲存中⋯</span>}
        <span className="text-[10px] text-[#9A9890] ml-auto">{row.config.min}~{row.config.max}</span>
      </div>
    </div>
  );
}
