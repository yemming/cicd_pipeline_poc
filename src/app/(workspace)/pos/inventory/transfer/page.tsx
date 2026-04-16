"use client";

import { useState } from "react";
import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { Button } from "@/components/pos/button";
import { DataTable, type Column } from "@/components/pos/data-table";
import { transferOrders } from "@/lib/pos/pos-mock-inventory";
import { getStore } from "@/lib/pos/pos-mock-customers";
import { formatTaiwanDate } from "@/lib/pos/format";
import type { TransferOrder, TransferStatus } from "@/lib/pos/pos-types";

const statusMeta: Record<TransferStatus, { tone: "neutral" | "warning" | "info" | "success" | "danger"; label: string; icon: string }> = {
  draft: { tone: "neutral", label: "草稿", icon: "edit" },
  dispatched: { tone: "warning", label: "已出庫", icon: "local_shipping" },
  "in-transit": { tone: "info", label: "運送中", icon: "directions_car" },
  received: { tone: "success", label: "已簽收", icon: "check" },
  cancelled: { tone: "danger", label: "已取消", icon: "close" },
};

export default function TransferPage() {
  const [selected, setSelected] = useState<TransferOrder | null>(null);

  const columns: Column<TransferOrder>[] = [
    { key: "code", header: "調撥單號", render: (r) => <span className="font-mono text-xs">{r.code}</span> },
    { key: "created", header: "建立", render: (r) => <span className="text-xs text-slate-600">{formatTaiwanDate(r.createdAt)}</span> },
    { key: "route", header: "路線", render: (r) => (
      <span className="text-sm inline-flex items-center gap-1">
        {getStore(r.from).shortName}
        <span className="material-symbols-outlined text-[16px] text-indigo-500">arrow_forward</span>
        {getStore(r.to).shortName}
      </span>
    )},
    { key: "items", header: "品項", render: (r) => <span className="text-xs text-slate-500">{r.lines.map(l => `${l.skuName}×${l.quantity}`).join("・")}</span> },
    { key: "status", header: "狀態", render: (r) => {
      const m = statusMeta[r.status];
      return <Badge tone={m.tone} icon={m.icon}>{m.label}</Badge>;
    }},
    { key: "driver", header: "司機", render: (r) => <span className="text-xs text-slate-500">{r.driver ?? "—"}</span> },
  ];

  return (
    <PosPageShell title="跨店調撥" subtitle="即時調度・QR 碼追蹤・全流程掌握" preview>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="本月調撥單" value={transferOrders.length} icon="sync_alt" tone="indigo" />
        <KpiCard label="進行中" value={transferOrders.filter(t => t.status === "in-transit" || t.status === "dispatched").length} icon="local_shipping" tone="amber" />
        <KpiCard label="平均到貨時間" value="18h" icon="schedule" tone="sky" />
        <KpiCard label="庫存流動率" value="+32%" icon="trending_up" tone="emerald" subtitle="啟用跨店後" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-6">
        <Card title="調撥列表" icon="list" padded={false} action={
          <Button icon="add" size="sm">新增調撥</Button>
        }>
          <DataTable
            columns={columns}
            data={transferOrders}
            rowKey={(r) => r.id}
            onRowClick={setSelected}
          />
        </Card>

        {selected ? (
          <Card title="調撥詳情" icon="info">
            <div className="space-y-4">
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-1">單號</p>
                <p className="font-mono font-bold">{selected.code}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">路線</p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-indigo-50 px-3 py-2 rounded-lg">
                    <p className="text-[9px] text-indigo-500">來源</p>
                    <p className="font-bold text-indigo-900">{getStore(selected.from).name}</p>
                  </div>
                  <span className="material-symbols-outlined text-slate-400">arrow_forward</span>
                  <div className="flex-1 bg-emerald-50 px-3 py-2 rounded-lg">
                    <p className="text-[9px] text-emerald-500">目的</p>
                    <p className="font-bold text-emerald-900">{getStore(selected.to).name}</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">品項</p>
                <ul className="space-y-1 text-sm">
                  {selected.lines.map((l, i) => (
                    <li key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                      <span>{l.skuName}</span>
                      <span className="font-bold tabular-nums">× {l.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-widest text-slate-400 mb-2">狀態流程</p>
                <ol className="space-y-2 border-l-2 border-slate-200 pl-4 ml-2">
                  {(["draft", "dispatched", "in-transit", "received"] as TransferStatus[]).map((s) => {
                    const reached = ["draft", "dispatched", "in-transit", "received"].indexOf(selected.status) >= ["draft", "dispatched", "in-transit", "received"].indexOf(s);
                    return (
                      <li key={s} className="relative text-xs">
                        <span className={`absolute -left-[22px] w-3 h-3 rounded-full ${reached ? "bg-emerald-500" : "bg-slate-300"}`} />
                        <span className={reached ? "text-slate-800 font-medium" : "text-slate-400"}>
                          {statusMeta[s].label}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
              {selected.status !== "received" && selected.status !== "cancelled" && (
                <div className="pt-4 border-t border-slate-100 flex gap-2">
                  <Button variant="success" size="sm" fullWidth icon="check">確認簽收</Button>
                  <Button variant="ghost" size="sm" icon="qr_code_2" />
                </div>
              )}
            </div>
          </Card>
        ) : (
          <Card title="選擇一筆調撥" icon="arrow_back">
            <p className="text-sm text-slate-500 py-8 text-center">
              點選左方列表中的調撥單，查看詳細資訊與流程追蹤
            </p>
          </Card>
        )}
      </div>
    </PosPageShell>
  );
}
