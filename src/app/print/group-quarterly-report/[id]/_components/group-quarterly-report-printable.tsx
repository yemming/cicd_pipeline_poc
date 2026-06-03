"use client";

import {
  PrintShell,
  PrintTable,
  PrintToolbar,
  type PrintColumn,
  type PrintBrand,
} from "@/components/print";
import {
  GRADE_DEF,
  type GroupQuarterlyReportForPrint,
  type QuarterlyStoreRow,
} from "@/domain/group-quarterly-report.constants";

/* ── 格式化 ── */
const int = (n: number | null): string =>
  n == null ? "—" : Math.round(n).toLocaleString("en-US");
const pct = (r: number | null): string =>
  r == null ? "—" : `${(r * 100).toFixed(1)}%`;
const nps = (n: number | null): string =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${Math.round(n)}`;
const turn = (n: number | null): string => (n == null ? "—" : `${n.toFixed(1)}x`);

/** 比例環比箭頭（ratio，可負） */
function ratioArrow(r: number | null) {
  if (r == null) return <span style={{ color: "#9A9890" }}>—</span>;
  const up = r >= 0;
  return (
    <span style={{ color: up ? "#0F6E56" : "#CC0000", fontWeight: 600 }}>
      {up ? "▲" : "▼"} {up ? "+" : ""}
      {(r * 100).toFixed(1)}%
    </span>
  );
}
/** 整數環比（health delta） */
function intArrow(d: number | null) {
  if (d == null) return <span style={{ color: "#9A9890" }}>—</span>;
  if (d === 0) return <span style={{ color: "#5A5955" }}>→ 持平</span>;
  const up = d > 0;
  return (
    <span style={{ color: up ? "#0F6E56" : "#CC0000", fontWeight: 600 }}>
      {up ? "▲ +" : "▼ "}
      {d}
    </span>
  );
}

const STORE_COLUMNS: PrintColumn[] = [
  { header: "門店", width: 76, align: "left" },
  { header: "新車銷量\n季合計", width: 54, align: "right" },
  { header: "新車\n達成率", width: 50, align: "right" },
  { header: "售後台次\n季合計", width: 56, align: "right" },
  { header: "NPS\n季平均", width: 44, align: "right" },
  { header: "零件周轉\n近月", width: 48, align: "right" },
  { header: "Health\nScore", width: 48, align: "right" },
  { header: "vs 上季", width: 46, align: "right" },
  { header: "評級", width: 58, align: "center" },
];

function GradeChip({ grade }: { grade: QuarterlyStoreRow["grade"] }) {
  if (!grade) return <span style={{ color: "#9A9890" }}>—</span>;
  const g = GRADE_DEF[grade];
  return (
    <span
      style={{
        display: "inline-block",
        background: g.bg,
        color: g.color,
        fontWeight: 700,
        fontSize: "9pt",
        padding: "1pt 5pt",
        borderRadius: "3pt",
        whiteSpace: "nowrap",
      }}
    >
      {g.emoji} {g.label}
    </span>
  );
}

/* ── KPI 卡 ── */
function KpiCard({
  label,
  value,
  sub,
  delta,
}: {
  label: string;
  value: string;
  sub?: string;
  delta?: React.ReactNode;
}) {
  return (
    <div
      style={{
        flex: 1,
        border: "0.5pt solid #D5D3CB",
        borderRadius: "4pt",
        padding: "6pt 8pt",
        background: "#FBFAF7",
      }}
    >
      <div style={{ fontSize: "8.5pt", color: "#5A5955" }}>{label}</div>
      <div style={{ fontSize: "16pt", fontWeight: 700, color: "#1A3A5C", lineHeight: 1.2 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: "8pt", color: "#5A5955" }}>{sub}</div>}
      {delta != null && <div style={{ fontSize: "8.5pt", marginTop: "2pt" }}>{delta}</div>}
    </div>
  );
}

export function GroupQuarterlyReportPrintable({
  data,
  brand,
}: {
  data: GroupQuarterlyReportForPrint;
  brand: PrintBrand;
}) {
  return (
    <>
      <PrintToolbar pdfHref={`/api/pdf/group-quarterly-report/${data.quarterKey}`} />
      <PrintShell
        brand={brand}
        buyer={{ legalName: brand.displayName }}
        docTitle="集團季度績效報告 QUARTERLY PERFORMANCE"
        docNo={data.quarterLabel.replace(/\s/g, "")}
        docDate={`資料截止 ${data.dataCutoff}`}
      >
        {/* 報告抬頭 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: "8pt",
          }}
        >
          <div style={{ fontSize: "13pt", fontWeight: 700, color: "#2C2C2A" }}>
            📋 {data.periodRangeLabel}　季度績效彙整
          </div>
          <div style={{ fontSize: "9pt", color: "#5A5955" }}>
            門店數 <b>{data.storeCount}</b>　達標門店{" "}
            <b style={{ color: "#0F6E56" }}>
              {data.achievedStoreCount}/{data.storeCount}
            </b>
          </div>
        </div>

        {/* 季度核心指標 */}
        <h3 className="print-section-title">季度核心指標</h3>
        <div style={{ display: "flex", gap: "8pt" }}>
          <KpiCard
            label="全台新車銷量"
            value={`${int(data.groupNewCar)} 台`}
            sub={
              data.groupNewCarTarget != null
                ? `目標 ${int(data.groupNewCarTarget)}｜達成率 ${pct(data.groupNewCarRate)}`
                : undefined
            }
            delta={
              <span>
                {ratioArrow(data.groupNewCarDelta)}{" "}
                <span style={{ color: "#9A9890" }}>{data.compareLabel}</span>
              </span>
            }
          />
          <KpiCard
            label="全台售後台次"
            value={`${int(data.groupService)} 次`}
            sub={
              data.groupServiceTarget != null
                ? `目標 ${int(data.groupServiceTarget)}｜達成率 ${pct(data.groupServiceRate)}`
                : undefined
            }
            delta={
              <span>
                {ratioArrow(data.groupServiceDelta)}{" "}
                <span style={{ color: "#9A9890" }}>{data.compareLabel}</span>
              </span>
            }
          />
          <KpiCard
            label="季平均 NPS"
            value={nps(data.groupNps)}
            sub="集團整體淨推薦值"
          />
          <KpiCard
            label="平均 Health Score"
            value={data.groupHealth == null ? "—" : `${Math.round(data.groupHealth)}`}
            sub="五門店綜合體質均分"
            delta={
              <span>
                {intArrow(data.groupHealthDelta)}{" "}
                <span style={{ color: "#9A9890" }}>vs 上季</span>
              </span>
            }
          />
        </div>

        {/* 各門店季度績效對比 */}
        <PrintTable
          title="各門店季度績效對比"
          columns={STORE_COLUMNS}
          rows={data.stores.map((s) => [
            <span key="n" style={{ fontWeight: 600 }}>{s.name}</span>,
            int(s.newCar),
            pct(s.newCarRate),
            int(s.service),
            nps(s.nps),
            turn(s.turnover),
            s.health == null ? "—" : String(s.health),
            intArrow(s.healthDelta),
            <GradeChip key="g" grade={s.grade} />,
          ])}
        />

        {/* 季度月度拆解 */}
        <PrintTable
          title="季度月度拆解（全台彙總）"
          columns={[
            { header: "月份", width: 80, align: "left" },
            { header: "新車銷量（台）", align: "right" },
            { header: "售後台次（次）", align: "right" },
            { header: "平均 NPS", align: "right" },
          ]}
          rows={[
            ...data.monthly.map((m) => [
              m.label,
              int(m.newCar),
              int(m.service),
              nps(m.nps),
            ]),
            [
              <b key="t">季合計 / 季平均</b>,
              <b key="nc">{int(data.groupNewCar)}</b>,
              <b key="sv">{int(data.groupService)}</b>,
              <b key="np">{nps(data.groupNps)}</b>,
            ],
          ]}
        />

        {/* 季度重點摘要 */}
        <h3 className="print-section-title">季度重點摘要</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "4pt" }}>
          {data.highlights.length === 0 ? (
            <div style={{ fontSize: "9.5pt", color: "#9A9890" }}>（本季無自動摘要）</div>
          ) : (
            data.highlights.map((h, i) => (
              <div
                key={i}
                style={{
                  fontSize: "9.5pt",
                  color: "#2C2C2A",
                  padding: "3pt 8pt",
                  borderLeft: `2pt solid ${h.tone === "good" ? "#0F6E56" : "#CC0000"}`,
                  background: h.tone === "good" ? "#F3F8EE" : "#FDECEA",
                }}
              >
                {h.tone === "good" ? "✅ " : "🔴 "}
                {h.text}
              </div>
            ))
          )}
        </div>

        <div style={{ marginTop: "12pt", fontSize: "8pt", color: "#9A9890" }}>
          本報告由 DealerOS 集團管理模組自動彙整 kpi_snapshots 門店層數據生成。零件周轉率以最近月份快照呈現；
          缺資料欄位以「—」標示，不以估算值填充。
        </div>
      </PrintShell>
    </>
  );
}
