"use client";

import Link from "next/link";
import { PosPageShell } from "@/components/pos/page-shell";
import { KpiCard, Card } from "@/components/pos/card";
import { Button, ButtonLink } from "@/components/pos/button";
import { Badge } from "@/components/pos/badge";
import { formatNTD, formatTime } from "@/lib/pos/format";
import { todayTransactions, transactions } from "@/lib/pos/pos-mock-transactions";
import { getCustomer, getStore } from "@/lib/pos/pos-mock-customers";

export default function PosDashboardPage() {
  const today = todayTransactions();
  const totalToday = today.reduce((a, b) => a + b.total, 0);
  const retailCount = today.filter((t) => t.mode === "retail").length;
  const serviceCount = today.filter((t) => t.mode === "service").length;
  const vehicleCount = today.filter((t) => t.mode === "vehicle").length;
  const marginToday = today.reduce((a, b) => a + (b.margin ?? 0), 0);
  const recent = transactions.slice(0, 6);

  return (
    <PosPageShell
      title="POS 儀表板"
      subtitle="今日營運概況 · Ducati 台北旗艦"
      actions={
        <ButtonLink href="/pos/checkout" icon="shopping_cart_checkout" size="lg">
          開始結帳
        </ButtonLink>
      }
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard
          label="今日營業額"
          value={formatNTD(totalToday)}
          icon="monetization_on"
          tone="indigo"
          delta="+18% vs 昨日"
          deltaTone="positive"
        />
        <KpiCard
          label="今日交易筆數"
          value={today.length}
          icon="receipt_long"
          tone="emerald"
          subtitle={`精品 ${retailCount} · 維修 ${serviceCount} · 車輛 ${vehicleCount}`}
        />
        <KpiCard
          label="今日毛利"
          value={formatNTD(marginToday)}
          icon="trending_up"
          tone="amber"
          delta={`毛利率 ${totalToday ? Math.round((marginToday / totalToday) * 100) : 0}%`}
          deltaTone="neutral"
        />
        <KpiCard
          label="當班狀態"
          value="進行中"
          icon="schedule"
          tone="sky"
          subtitle="王雅雯 · 09:00 開班"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card
          title="快速操作"
          subtitle="最常用功能一鍵直達"
          icon="bolt"
          className="lg:col-span-1"
        >
          <div className="grid grid-cols-2 gap-2">
            {[
              { href: "/pos/checkout/vehicle", icon: "two_wheeler", label: "車輛結帳" },
              { href: "/pos/checkout/service", icon: "build", label: "維修結帳" },
              { href: "/pos/checkout/retail", icon: "shopping_bag", label: "精品結帳" },
              { href: "/pos/returns", icon: "assignment_return", label: "退貨" },
              { href: "/pos/ai-assistant", icon: "smart_toy", label: "AI 助手" },
              { href: "/pos/inventory/cross-store", icon: "hub", label: "跨店庫存" },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group flex flex-col items-center justify-center gap-2 p-4 rounded-xl bg-slate-50 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 transition-colors"
              >
                <span className="material-symbols-outlined text-indigo-600 text-[24px] group-hover:scale-110 transition-transform">
                  {item.icon}
                </span>
                <span className="text-xs font-medium text-slate-700">{item.label}</span>
              </Link>
            ))}
          </div>
        </Card>

        <Card
          title="近期交易"
          subtitle={`最新 ${recent.length} 筆`}
          icon="receipt"
          className="lg:col-span-2"
          action={
            <Link href="/pos/transactions" className="text-xs text-indigo-600 hover:underline font-medium">
              全部記錄 →
            </Link>
          }
        >
          <div className="divide-y divide-slate-100 -my-3">
            {recent.map((tx) => {
              const customer = tx.customerId ? getCustomer(tx.customerId) : undefined;
              const store = getStore(tx.store);
              const modeIcon =
                tx.mode === "vehicle" ? "two_wheeler" : tx.mode === "service" ? "build" : "shopping_bag";
              return (
                <div key={tx.id} className="py-3 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-indigo-600 text-[20px]">
                      {modeIcon}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm text-slate-900 truncate">
                        {tx.lines[0]?.name ?? "交易"}
                        {tx.lines.length > 1 && (
                          <span className="text-slate-400 font-normal"> +{tx.lines.length - 1}</span>
                        )}
                      </p>
                      {tx.status === "refunded" && <Badge tone="danger">已退貨</Badge>}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {customer?.name ?? "零售"} · {store.shortName} · {tx.clerk}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm text-slate-900 tabular-nums">
                      {formatNTD(tx.total)}
                    </p>
                    <p className="text-[10px] text-slate-400 tabular-nums">{formatTime(tx.date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card title="今日關注" icon="notifications_active">
          <div className="space-y-3">
            <Alert
              tone="warning"
              icon="warning"
              title="2 項 SKU 低於安全庫存"
              desc="AGV Pista GP RR (剩 1)、Termignoni 排氣 (0)"
              href="/pos/inventory"
            />
            <Alert
              tone="brand"
              icon="smart_toy"
              title="AI 推薦 5 個加購機會"
              desc="根據今日 12 位到店客戶歷史消費"
              href="/pos/ai-assistant"
            />
            <Alert
              tone="info"
              icon="card_giftcard"
              title="3 位本月壽星客戶"
              desc="一鍵發送生日專屬禮券"
              href="/pos/vip"
            />
            <Alert
              tone="success"
              icon="sync_alt"
              title="1 筆跨店調撥到達"
              desc="新竹→內湖 · AGV 安全帽 × 1 · 請驗收"
              href="/pos/inventory/transfer"
            />
          </div>
        </Card>

        <Card title="班別現況" icon="badge">
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Stat label="應有現金" value={formatNTD(28450)} />
            <Stat label="開班底金" value={formatNTD(10000)} />
            <Stat label="本班交易" value={`${today.length} 筆`} />
            <Stat label="連續工時" value="6h 42m" />
          </div>
          <div className="flex items-center gap-2">
            <ButtonLink href="/pos/cash-drawer" variant="secondary" size="sm" icon="savings">
              錢箱明細
            </ButtonLink>
            <ButtonLink href="/pos/shift" variant="ghost" size="sm" icon="schedule">
              班別紀錄
            </ButtonLink>
            <Button variant="ghost" size="sm" icon="logout" className="ml-auto">
              準備交班
            </Button>
          </div>
        </Card>
      </div>
    </PosPageShell>
  );
}

function Alert({
  tone,
  icon,
  title,
  desc,
  href,
}: {
  tone: "warning" | "success" | "info" | "brand";
  icon: string;
  title: string;
  desc: string;
  href: string;
}) {
  const bg = {
    warning: "bg-amber-50 border-amber-200 text-amber-700",
    success: "bg-emerald-50 border-emerald-200 text-emerald-700",
    info: "bg-sky-50 border-sky-200 text-sky-700",
    brand: "bg-indigo-50 border-indigo-200 text-indigo-700",
  }[tone];
  return (
    <Link
      href={href}
      className={`flex items-start gap-3 p-3 rounded-xl border hover:shadow-sm transition-shadow ${bg}`}
    >
      <span className="material-symbols-outlined text-[20px] shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-sm">{title}</p>
        <p className="text-xs opacity-80 mt-0.5">{desc}</p>
      </div>
      <span className="material-symbols-outlined text-[16px] opacity-60">chevron_right</span>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="font-display font-bold text-slate-900 text-sm tabular-nums">{value}</p>
    </div>
  );
}
