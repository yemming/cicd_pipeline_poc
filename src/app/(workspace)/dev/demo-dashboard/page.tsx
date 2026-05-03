"use client";

import { useSetPageHeader } from "@/components/page-header-context";
import { DealerDemoProvider, useDealerDB, useDropoffCases, useFunnelStats, usePIWithDetails } from "@/lib/dealer-demo/store";

export default function DemoDashboardPage() {
  useSetPageHeader({
    breadcrumb: [{ label: "新功能開發區" }, { label: "Demo Dashboard（資料層連通示範）" }],
  });
  return (
    <DealerDemoProvider>
      <div className="max-w-[1400px] mx-auto p-6 space-y-8">
        <Header />
        <SalesSection />
        <ServiceSection />
        <DropoffSection />
        <RawDBSection />
      </div>
    </DealerDemoProvider>
  );
}

function Header() {
  return (
    <div className="border-b border-neutral-200 pb-4">
      <h1 className="text-2xl font-bold text-neutral-900">Ducati DealerOS — 資料層連通示範</h1>
      <p className="mt-2 text-sm text-neutral-600">
        本頁讀取自 <code className="px-1.5 py-0.5 rounded bg-neutral-100 font-mono text-xs">src/lib/dealer-demo</code> 的記憶體 store，
        seed 由 Russell 的 Excel 七張表抽出 14 個正規化 entity；之後想接 Supabase 直接用同一份 schema。
      </p>
    </div>
  );
}

// ============== 銷售側 ==============
function SalesSection() {
  const { db } = useDealerDB();
  const today = "2026-04-28";
  const storeFunnel = useFunnelStats({ date: today, scope: "store" });
  const myFunnel = useFunnelStats({ date: today, scope: "individual", employee_id: "emp-001" });

  const habcCounts = db.customers.reduce(
    (acc, c) => {
      if (c.habc_level) acc[c.habc_level] = (acc[c.habc_level] ?? 0) + 1;
      return acc;
    },
    { H: 0, A: 0, B: 0, C: 0 } as Record<string, number>
  );

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">🛵 銷售動線</h2>

      {/* 漏斗看板 — 整店 vs 個人 */}
      <div className="grid grid-cols-2 gap-4">
        {storeFunnel && <FunnelCard title="整店今日（4/28）" stats={storeFunnel} accent="#CC0000" />}
        {myFunnel && <FunnelCard title="陳大為個人（emp-001）" stats={myFunnel} accent="#185FA5" />}
      </div>

      {/* HABC 客戶分佈 */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">HABC 客戶級別分佈</h3>
        <div className="grid grid-cols-4 gap-3">
          {(["H", "A", "B", "C"] as const).map((lvl) => (
            <div key={lvl} className="rounded-lg border border-neutral-200 p-4 text-center">
              <div className={`text-3xl font-bold ${LEVEL_COLOR[lvl]}`}>{habcCounts[lvl]}</div>
              <div className="text-xs text-neutral-500 mt-1">{lvl} 級 — {LEVEL_NAME[lvl]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 最近手卡 */}
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">最近銷售手卡（{db.sales_cards.length} 筆）</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-neutral-500 border-b border-neutral-200">
              <tr>
                <th className="text-left py-2 px-2">手卡號</th>
                <th className="text-left py-2 px-2">客戶</th>
                <th className="text-left py-2 px-2">接待</th>
                <th className="text-center py-2 px-2">級別</th>
                <th className="text-left py-2 px-2">意向車型</th>
                <th className="text-center py-2 px-2">試駕</th>
                <th className="text-center py-2 px-2">報價</th>
                <th className="text-left py-2 px-2">到店時間</th>
              </tr>
            </thead>
            <tbody>
              {db.sales_cards.map((sc) => {
                const cus = db.customers.find((c) => c.id === sc.customer_id);
                const emp = db.employees.find((e) => e.id === sc.reception_employee_id);
                const newModel = sc.intent_new_model_id ? db.vehicle_models.find((m) => m.id === sc.intent_new_model_id) : undefined;
                return (
                  <tr key={sc.id} className="border-b border-neutral-100">
                    <td className="py-2 px-2 font-mono text-xs">{sc.card_no}</td>
                    <td className="py-2 px-2">{cus?.name ?? "—"}</td>
                    <td className="py-2 px-2">{emp?.name}</td>
                    <td className="py-2 px-2 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${LEVEL_BG[sc.habc_level]}`}>{sc.habc_level}</span>
                    </td>
                    <td className="py-2 px-2">{newModel?.name ?? "—"}</td>
                    <td className="py-2 px-2 text-center">{sc.test_drive ? "✅" : "—"}</td>
                    <td className="py-2 px-2 text-center">{sc.quote_issued ? "✅" : "—"}</td>
                    <td className="py-2 px-2 text-xs text-neutral-500">{sc.visited_at.slice(5, 16).replace("T", " ")}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FunnelCard({ title, stats, accent }: { title: string; stats: { reception_total: number; showroom_visits: number; new_leads: number; test_drives: number; quotes: number; deals: number; deliveries: number }; accent: string }) {
  const rows = [
    { label: "總接待數", v: stats.reception_total },
    { label: "展廳接待", v: stats.showroom_visits },
    { label: "新增潛客", v: stats.new_leads },
    { label: "試駕數",   v: stats.test_drives },
    { label: "報價數",   v: stats.quotes },
    { label: "成交數",   v: stats.deals },
    { label: "交車數",   v: stats.deliveries },
  ];
  const max = Math.max(...rows.map((r) => r.v), 1);
  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-neutral-900 mb-3">{title}</h3>
      <div className="space-y-1.5">
        {rows.map((r) => {
          const w = (r.v / max) * 100;
          return (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-20 text-xs text-neutral-500">{r.label}</div>
              <div className="flex-1 bg-neutral-100 h-6 rounded relative overflow-hidden">
                <div className="h-full rounded" style={{ width: `${Math.max(w, 8)}%`, background: accent }} />
                <div className="absolute inset-0 flex items-center justify-end px-2 text-xs font-semibold text-white">{r.v}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============== 維修側 ==============
function ServiceSection() {
  const { db } = useDealerDB();

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">🔧 維修動線</h2>

      <div className="grid grid-cols-2 gap-4">
        <PICard piId="pi-001" />
        <ROCard roId="ro-002" />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">進行中預檢單（{db.pre_inspections.length} 張）</h3>
        <div className="space-y-2">
          {db.pre_inspections.map((pi) => {
            const v = db.vehicles.find((x) => x.id === pi.vehicle_id);
            const c = v ? db.customers.find((x) => x.id === v.customer_id) : undefined;
            const m = v ? db.vehicle_models.find((x) => x.id === v.model_id) : undefined;
            const sa = db.employees.find((e) => e.id === pi.sa_employee_id);
            const fc = db.pi_findings.filter((f) => f.pi_id === pi.id).length;
            return (
              <div key={pi.id} className="flex items-center gap-4 p-3 rounded border border-neutral-200 bg-neutral-50">
                <div className="font-mono text-xs text-neutral-500 w-44">{pi.pi_no}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{c?.name} — {m?.name}（{v?.plate}）</div>
                  <div className="text-xs text-neutral-500">SA：{sa?.name} ／ 進廠 {pi.check_in_at.slice(5, 16).replace("T", " ")} ／ 技師檢查 {fc} 項</div>
                </div>
                <span className="px-2 py-1 text-xs rounded bg-amber-100 text-amber-800">{PI_STATUS_LABEL[pi.status]}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function PICard({ piId }: { piId: string }) {
  const detail = usePIWithDetails(piId);
  if (!detail) return null;
  const { pi, customer, model, vehicle, sa, findings, estimates } = detail;
  const total = estimates.reduce((s, e) => s + e.subtotal, 0);
  const tax = Math.round(total * 0.05);
  const decisions = findings.reduce(
    (acc, f) => {
      acc[f.owner_decision] = (acc[f.owner_decision] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
      <div className="bg-red-600 text-white px-4 py-2 flex items-center gap-2">
        <span className="text-sm font-bold">PI 預檢單</span>
        <span className="text-xs opacity-90 font-mono">{pi.pi_no}</span>
        <span className="ml-auto text-xs">第四關 報價彙整中</span>
      </div>
      <div className="p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <Field label="車主" value={customer?.name} />
          <Field label="車型" value={`${model?.name}（${vehicle?.plate}）`} />
          <Field label="SA"   value={sa?.name} />
          <Field label="里程" value={`${pi.mileage_km} km`} />
        </div>

        <div className="border-t border-neutral-200 pt-3">
          <div className="text-xs text-neutral-500 mb-2">技師檢查 {findings.length} 項</div>
          <div className="flex gap-2 text-xs">
            {decisions.agreed   ? <span className="px-2 py-0.5 rounded bg-green-100 text-green-800">✅ 同意 {decisions.agreed}</span> : null}
            {decisions.deferred ? <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">⏸ 暫緩 {decisions.deferred}</span> : null}
            {decisions.rejected ? <span className="px-2 py-0.5 rounded bg-red-100 text-red-800">❌ 拒絕 {decisions.rejected}</span> : null}
          </div>
        </div>

        <div className="border-t border-neutral-200 pt-3">
          <div className="text-xs text-neutral-500 mb-2">報價彙整（自同意項目）</div>
          <table className="w-full text-xs">
            <tbody>
              {estimates.map((e) => (
                <tr key={e.id} className="border-b border-neutral-100">
                  <td className="py-1">{e.service_name}</td>
                  <td className="py-1 text-right text-neutral-500">{e.lu} LU</td>
                  <td className="py-1 text-right font-mono">${e.subtotal.toLocaleString()}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="pt-2">小計</td>
                <td></td>
                <td className="pt-2 text-right font-mono">${total.toLocaleString()}</td>
              </tr>
              <tr className="text-neutral-500">
                <td>稅額（5%）</td>
                <td></td>
                <td className="text-right font-mono">${tax.toLocaleString()}</td>
              </tr>
              <tr className="text-base font-bold text-red-700">
                <td className="pt-2">預估總費用</td>
                <td></td>
                <td className="pt-2 text-right font-mono">${(total + tax).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ROCard({ roId }: { roId: string }) {
  const { db } = useDealerDB();
  const ro = db.repair_orders.find((r) => r.id === roId);
  if (!ro) return null;
  const v = db.vehicles.find((x) => x.id === ro.vehicle_id);
  const c = v ? db.customers.find((x) => x.id === v.customer_id) : undefined;
  const m = v ? db.vehicle_models.find((x) => x.id === v.model_id) : undefined;
  const sa = db.employees.find((e) => e.id === ro.sa_employee_id);
  const tech = db.employees.find((e) => e.id === ro.lead_technician_id);
  const qa = ro.qa_signed_by ? db.employees.find((e) => e.id === ro.qa_signed_by) : undefined;
  const parts = db.ro_parts.filter((p) => p.ro_id === roId);

  return (
    <div className="bg-white border border-blue-200 rounded-xl overflow-hidden">
      <div className="bg-[#1A3A5C] text-white px-4 py-2 flex items-center gap-2">
        <span className="text-sm font-bold">RO 正式工單</span>
        <span className="text-xs opacity-90 font-mono">{ro.ro_no}</span>
        <span className="ml-auto text-xs">{RO_STATUS_LABEL[ro.status]}</span>
      </div>
      <div className="p-4 space-y-3 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <Field label="車主" value={c?.name} />
          <Field label="車型" value={`${m?.name}（${v?.plate}）`} />
          <Field label="SA"   value={sa?.name} />
          <Field label="技師" value={tech?.name} />
          <Field label="QA"   value={qa?.name ?? "—"} />
          <Field label="保固類型" value={ro.warranty_claim_type} />
        </div>

        <div className="border-t border-neutral-200 pt-3">
          <div className="text-xs text-neutral-500 mb-2">零件 {parts.length} 項</div>
          <div className="text-xs space-y-1">
            {parts.slice(0, 4).map((p) => (
              <div key={p.id} className="flex justify-between">
                <span>{p.part_name} × {p.qty}</span>
                <span className="font-mono">${p.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t border-neutral-200 pt-3 grid grid-cols-2 gap-2 text-xs">
          <Field label="工時費" value={`$${ro.labor_total.toLocaleString()}`} mono />
          <Field label="零件費" value={`$${ro.parts_total.toLocaleString()}`} mono />
          <Field label="稅額"   value={`$${ro.tax.toLocaleString()}`} mono />
          <Field label="總計"   value={`$${ro.grand_total.toLocaleString()}`} mono highlight />
        </div>

        {ro.pickup_notified_at && (
          <div className="border-t border-neutral-200 pt-3">
            <div className="text-xs text-green-700">
              ✓ 已推播取車通知（{ro.pickup_notified_via?.join(" / ")}）— {ro.pickup_notified_at.slice(5, 16).replace("T", " ")}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============== 增項閉環看板 ==============
function DropoffSection() {
  const cases = useDropoffCases();
  const { db } = useDealerDB();
  const counts = cases.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const totalAmount = cases.filter((c) => c.status === "open" || c.status === "d3_contacted").reduce((s, c) => s + c.amount, 0);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-neutral-900">📋 增項閉環失銷追蹤（Russell 核心 IP）</h2>

      <div className="grid grid-cols-4 gap-3">
        <Stat label="待聯繫"     value={counts.open ?? 0}            color="bg-red-50 text-red-700" />
        <Stat label="D+3 已聯繫" value={counts.d3_contacted ?? 0}    color="bg-amber-50 text-amber-700" />
        <Stat label="閉環成功"   value={counts.recovered ?? 0}       color="bg-green-50 text-green-700" />
        <Stat label="未收金額"   value={`$${totalAmount.toLocaleString()}`} color="bg-neutral-50 text-neutral-700" />
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-neutral-900 mb-3">案件清單</h3>
        <div className="space-y-2">
          {cases.map((c) => {
            const cust = db.customers.find((x) => x.id === c.customer_id);
            const veh = db.vehicles.find((x) => x.id === c.vehicle_id);
            const model = veh ? db.vehicle_models.find((m) => m.id === veh.model_id) : undefined;
            return (
              <div key={c.id} className={`flex items-center gap-4 p-3 rounded border ${c.safety_level === "critical" ? "border-red-300 bg-red-50/50" : "border-neutral-200"}`}>
                <div className="text-2xl">{SAFETY_ICON[c.safety_level]}</div>
                <div className="font-mono text-xs text-neutral-500 w-36">{c.case_no}</div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{cust?.name} ／ {model?.name}</div>
                  <div className="text-xs text-neutral-600">{c.item}</div>
                  {c.d3_note && <div className="text-xs text-neutral-500 mt-0.5">D+3：{c.d3_note}</div>}
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm">${c.amount.toLocaleString()}</div>
                  <div className="text-xs mt-0.5">
                    <span className={`inline-block px-2 py-0.5 rounded ${DROPOFF_STATUS_COLOR[c.status]}`}>{DROPOFF_STATUS_LABEL[c.status]}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ============== Raw DB inspector（供開發確認 schema） ==============
function RawDBSection() {
  const { db, dispatch } = useDealerDB();
  const counts = Object.entries(db).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]) as [string, number][];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-900">🗄️ 資料層（記憶體 store）</h2>
        <button onClick={() => dispatch({ type: "RESET" })} className="px-3 py-1.5 text-xs rounded border border-neutral-300 hover:bg-neutral-50">
          ↻ Reset 回 seed
        </button>
      </div>
      <div className="bg-white border border-neutral-200 rounded-xl p-5">
        <div className="grid grid-cols-4 gap-x-6 gap-y-2 text-xs font-mono">
          {counts.map(([k, n]) => (
            <div key={k} className="flex justify-between">
              <span className="text-neutral-500">{k}</span>
              <span className="font-bold text-neutral-900">{n}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============== Atoms ==============
function Field({ label, value, mono, highlight }: { label: string; value?: React.ReactNode; mono?: boolean; highlight?: boolean }) {
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className={`${mono ? "font-mono" : ""} ${highlight ? "text-red-700 font-bold" : ""}`}>{value ?? "—"}</div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: React.ReactNode; color: string }) {
  return (
    <div className={`rounded-xl p-4 ${color}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1">{label}</div>
    </div>
  );
}

const LEVEL_NAME: Record<string, string> = { H: "高度", A: "中度", B: "低度", C: "保留" };
const LEVEL_COLOR: Record<string, string> = { H: "text-red-600", A: "text-orange-600", B: "text-blue-600", C: "text-neutral-500" };
const LEVEL_BG: Record<string, string> = {
  H: "bg-red-100 text-red-700",
  A: "bg-orange-100 text-orange-700",
  B: "bg-blue-100 text-blue-700",
  C: "bg-neutral-100 text-neutral-600",
};

const PI_STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  in_progress: "進行中",
  estimating: "報價中",
  signed: "已簽名",
  transferred: "已轉 RO",
  void: "作廢",
};

const RO_STATUS_LABEL: Record<string, string> = {
  opened: "已開立",
  in_progress: "施工中",
  completed: "完工",
  qa_passed: "竣工複檢通過",
  notified: "已通知取車",
  delivered: "已交車",
  closed: "結案",
};

const SAFETY_ICON: Record<string, string> = { critical: "🔴", near_term: "🟡", advisory: "🟢" };

const DROPOFF_STATUS_LABEL: Record<string, string> = {
  open: "待 D+3 聯繫",
  d3_contacted: "D+3 已聯繫",
  d10_contacted: "D+10 已聯繫",
  scheduled: "已預約回廠",
  recovered: "✓ 閉環成功",
  lost: "戰敗結束",
  follow_up_30d: "持續跟進",
};

const DROPOFF_STATUS_COLOR: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  d3_contacted: "bg-amber-100 text-amber-700",
  d10_contacted: "bg-orange-100 text-orange-700",
  scheduled: "bg-blue-100 text-blue-700",
  recovered: "bg-green-100 text-green-700",
  lost: "bg-neutral-200 text-neutral-600",
  follow_up_30d: "bg-violet-100 text-violet-700",
};
