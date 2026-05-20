/**
 * Design Tokens 預覽 — 全站「華麗版」KPI / chart tone 系統的參考頁。
 *
 * 任何要做 chart / KPI card / status badge / hover-lift 互動的開發者，
 * 來這頁挑 tone、複製 utility class、確認 hex 對映。
 *
 * 來源：src/styles/design-tokens.css（同步以 @theme inline 註冊給 Tailwind v4）。
 * 既有色票（#1A3A5C / #0F6E56 / #185FA5 / #CC0000 …）為 list/page view 標準色，
 * 不在本頁展示 — 請看 CLAUDE.md §Design Pattern。
 */

const TONES = [
  { key: "blue", label: "Blue · 主資訊 / Primary KPI" },
  { key: "teal", label: "Teal · 效率 / 完成率" },
  { key: "amber", label: "Amber · 警示 / 等待" },
  { key: "red", label: "Red · 風險 / 逾期" },
  { key: "purple", label: "Purple · 高階 / accent" },
  { key: "green", label: "Green · 成功 / 達標" },
  { key: "gray", label: "Gray · 中性 / 停用" },
] as const;

const STEPS = [50, 100, 500, 700, 900] as const;

const CHIPS = [
  { key: "active", label: "active · 啟用" },
  { key: "inactive", label: "inactive · 停用" },
  { key: "warning", label: "warning · 警示" },
  { key: "error", label: "error · 錯誤" },
  { key: "info", label: "info · 資訊" },
  { key: "pending", label: "pending · 處理中" },
] as const;

const GRADIENTS = [
  { key: "hero", label: "hero · 大背景 / 登入 / dashboard header" },
  { key: "kpi-blue", label: "kpi-blue · 主資訊 KPI" },
  { key: "kpi-amber", label: "kpi-amber · 警示 / 待辦 KPI" },
  { key: "kpi-teal", label: "kpi-teal · 完成率 KPI" },
  { key: "kpi-red", label: "kpi-red · 風險 / 逾期 KPI" },
  { key: "accent", label: "accent · 強調 / 推廣模組" },
] as const;

const SHADOWS = [
  { key: "sm", varName: "--shadow-sm", label: "shadow-sm · 卡片浮起" },
  { key: "md", varName: "--shadow-md", label: "shadow-md · modal / popover" },
  { key: "lg", varName: "--shadow-lg", label: "shadow-lg · 大型 overlay" },
  { key: "lift", varName: "--shadow-lift", label: "shadow-lift · hover 提升（中性）" },
  { key: "tone-blue", varName: "--shadow-tone-blue", label: "shadow-tone-blue" },
  { key: "tone-teal", varName: "--shadow-tone-teal", label: "shadow-tone-teal" },
  { key: "tone-amber", varName: "--shadow-tone-amber", label: "shadow-tone-amber" },
  { key: "tone-red", varName: "--shadow-tone-red", label: "shadow-tone-red" },
  { key: "tone-purple", varName: "--shadow-tone-purple", label: "shadow-tone-purple" },
  { key: "tone-green", varName: "--shadow-tone-green", label: "shadow-tone-green" },
] as const;

export default function DesignTokensPage() {
  return (
    <main className="px-6 py-6 max-w-[1280px] space-y-8">
      {/* Page header */}
      <header className="space-y-1.5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[18px] font-semibold text-[#2C2C2A]">Design Tokens</h1>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
            P0-1 · A 級基建
          </span>
        </div>
        <p className="text-[12.5px] text-[#5A5955]">
          DealerOS 全站「華麗版」KPI / chart tone palette + chip + gradient + shadow 預覽。
          來源 <code className="font-mono text-[11.5px] bg-[#F8F7F4] px-1 rounded">src/styles/design-tokens.css</code>。
          既有 list/page view 標準色（<span className="font-mono">#1A3A5C / #0F6E56 / #185FA5 …</span>）未變動。
        </p>
      </header>

      {/* 1. Tone palette — 7 tone × 5 steps */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 1. Tone Palette — 7 tone × 5 step
          </h2>
          <p className="text-[11.5px] text-[#9A9890] mt-0.5">
            Utility 範例：<code className="font-mono">bg-tone-blue-100 text-tone-blue-700</code>，
            CSS var：<code className="font-mono">var(--tone-blue-500)</code>
          </p>
        </header>
        <div className="p-4 space-y-3">
          {TONES.map((tone) => (
            <div key={tone.key} className="flex items-center gap-3">
              <div className="w-[200px] shrink-0 text-[12px] text-[#2C2C2A] font-medium">
                {tone.label}
              </div>
              <div className="flex gap-2 flex-1">
                {STEPS.map((step) => (
                  <div key={step} className="flex-1 min-w-[100px]">
                    <div
                      className="h-12 rounded border border-[#EEECE6]"
                      style={{ background: `var(--tone-${tone.key}-${step})` }}
                    />
                    <div className="mt-1 text-[10.5px] font-mono text-[#5A5955]">
                      tone-{tone.key}-{step}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 2. Chip — status badge demo */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 2. Chip · Status Badge（6 種）</h2>
          <p className="text-[11.5px] text-[#9A9890] mt-0.5">
            Utility 範例：<code className="font-mono">bg-chip-active-bg text-chip-active-text border border-chip-active-border</code>
          </p>
        </header>
        <div className="p-4 flex gap-3 flex-wrap">
          {CHIPS.map((chip) => (
            <span
              key={chip.key}
              className="inline-flex items-center px-2.5 py-1 rounded-md text-[12px] font-medium border"
              style={{
                backgroundColor: `var(--chip-${chip.key}-bg)`,
                color: `var(--chip-${chip.key}-text)`,
                borderColor: `var(--chip-${chip.key}-border)`,
              }}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </section>

      {/* 3. Gradient */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 3. Gradient（6 種）</h2>
          <p className="text-[11.5px] text-[#9A9890] mt-0.5">
            Utility 範例：<code className="font-mono">bg-gradient-kpi-blue</code> 或
            <code className="font-mono"> style={'{{ backgroundImage: \'var(--gradient-hero)\' }}'}</code>
          </p>
        </header>
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          {GRADIENTS.map((g) => (
            <div
              key={g.key}
              className="h-24 rounded-lg p-4 flex flex-col justify-between text-white shadow"
              style={{ backgroundImage: `var(--gradient-${g.key})` }}
            >
              <span className="text-[12px] font-mono opacity-80">--gradient-{g.key}</span>
              <span className="text-[14px] font-semibold drop-shadow">{g.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Shadows */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 4. Shadow — 中性 + colored</h2>
          <p className="text-[11.5px] text-[#9A9890] mt-0.5">
            Utility 範例：<code className="font-mono">shadow-lift</code>、<code className="font-mono">shadow-tone-purple</code>；
            hover-lift 包裝：<code className="font-mono">hover-lift</code>（class 套 transition + translateY -2px）
          </p>
        </header>
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {SHADOWS.map((s) => (
            <div
              key={s.key}
              className="h-24 rounded-lg bg-white border border-[#EEECE6] p-3 flex flex-col justify-between"
              style={{ boxShadow: `var(${s.varName})` }}
            >
              <span className="text-[11px] font-mono text-[#5A5955]">{s.varName}</span>
              <span className="text-[12px] font-medium text-[#2C2C2A]">{s.label}</span>
            </div>
          ))}
        </div>
        <div className="border-t border-[#EEECE6] bg-[#F8F7F4] p-4">
          <p className="text-[11.5px] text-[#5A5955] mb-3">
            <b>hover-lift demo</b>：滑鼠移上去看 translateY 與光暈
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div
              className="hover-lift rounded-lg p-5 text-white cursor-pointer"
              style={{ backgroundImage: "var(--gradient-kpi-blue)" }}
            >
              <div className="text-[11px] opacity-80">未交車待辦</div>
              <div className="text-[24px] font-semibold">12 台</div>
            </div>
            <div
              className="hover-lift rounded-lg p-5 text-white cursor-pointer"
              style={{ backgroundImage: "var(--gradient-kpi-amber)" }}
            >
              <div className="text-[11px] opacity-80">本月來店</div>
              <div className="text-[24px] font-semibold">87 組</div>
            </div>
            <div
              className="hover-lift rounded-lg p-5 text-white cursor-pointer"
              style={{ backgroundImage: "var(--gradient-kpi-teal)" }}
            >
              <div className="text-[11px] opacity-80">維修完成率</div>
              <div className="text-[24px] font-semibold">94.2%</div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Transition */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 5. Transition Utility</h2>
        </header>
        <div className="p-4 space-y-2 text-[12.5px] text-[#2C2C2A]">
          <div>
            <code className="font-mono bg-[#F8F7F4] px-1.5 py-0.5 rounded">.transition-tone</code>
            <span className="text-[#5A5955] ml-2">— color / bg / border 切換 200ms ease（chip hover、tab 切換）</span>
          </div>
          <div>
            <code className="font-mono bg-[#F8F7F4] px-1.5 py-0.5 rounded">.transition-lift</code>
            <span className="text-[#5A5955] ml-2">— transform / box-shadow 切換 250ms cubic-bezier（hover lift 卡片）</span>
          </div>
          <div>
            <code className="font-mono bg-[#F8F7F4] px-1.5 py-0.5 rounded">.hover-lift</code>
            <span className="text-[#5A5955] ml-2">— 同時包含 transition + translateY(-2px) + shadow-lift</span>
          </div>
        </div>
      </section>

      <footer className="text-[11.5px] text-[#9A9890] pt-2">
        若需新增 tone 或修改 hex 值 → 改 <code className="font-mono">src/styles/design-tokens.css</code> 即可，
        Tailwind v4 @theme inline 註冊會自動更新 utility class。
      </footer>
    </main>
  );
}
