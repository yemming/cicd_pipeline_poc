"use client";

import { PosPageShell } from "@/components/pos/page-shell";
import { Card, KpiCard } from "@/components/pos/card";
import { Badge } from "@/components/pos/badge";
import { DataTable, type Column } from "@/components/pos/data-table";
import { skus, skuCategoryMeta } from "@/lib/pos/pos-mock-skus";
import { inventory, crossStoreAvailable } from "@/lib/pos/pos-mock-inventory";
import { ButtonLink } from "@/components/pos/button";
import { formatNTD } from "@/lib/pos/format";

type Row = {
  id: string;
  code: string;
  name: string;
  category: string;
  price: number;
  local: number;
  network: number;
};

export default function InventoryPage() {
  const rows: Row[] = skus.map((s) => {
    const local = inventory.find((r) => r.sku === s.id && r.store === "tpe-flagship");
    return {
      id: s.id,
      code: s.code,
      name: s.name,
      category: s.category,
      price: s.price,
      local: local?.stock ?? 0,
      network: crossStoreAvailable(s.id),
    };
  });

  const lowStock = rows.filter((r) => r.local <= 2).length;
  const outOfStock = rows.filter((r) => r.local === 0).length;
  const totalValue = rows.reduce((a, b) => a + b.price * b.local, 0);

  const columns: Column<Row>[] = [
    { key: "code", header: "料號", render: (r) => <span className="font-mono text-xs tabular-nums">{r.code}</span> },
    { key: "name", header: "品名", render: (r) => <span className="text-sm font-medium">{r.name}</span> },
    { key: "category", header: "類別", render: (r) => {
      const meta = skuCategoryMeta[r.category];
      return <Badge tone="neutral">{meta.label}</Badge>;
    }},
    { key: "price", header: "單價", align: "right", render: (r) => <span className="tabular-nums">{formatNTD(r.price)}</span>, sortValue: (r) => r.price },
    { key: "local", header: "本店庫存", align: "right", render: (r) => (
      <span className={`tabular-nums font-bold ${r.local === 0 ? "text-rose-600" : r.local <= 2 ? "text-amber-600" : "text-slate-900"}`}>
        {r.local}
      </span>
    ), sortValue: (r) => r.local },
    { key: "network", header: "全網", align: "right", render: (r) => <span className="tabular-nums text-slate-600">{r.network}</span> },
    { key: "status", header: "狀態", render: (r) => r.local === 0 ? <Badge tone="danger">缺貨</Badge> : r.local <= 2 ? <Badge tone="warning">低庫存</Badge> : <Badge tone="success">正常</Badge> },
  ];

  return (
    <PosPageShell title="即時庫存" subtitle="Ducati 台北旗艦 · 全品項">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard label="品項總數" value={rows.length} icon="inventory_2" tone="indigo" />
        <KpiCard label="庫存總值" value={formatNTD(totalValue)} icon="monetization_on" tone="emerald" />
        <KpiCard label="低庫存 (≤2)" value={lowStock} icon="warning" tone="amber" />
        <KpiCard label="缺貨 (0)" value={outOfStock} icon="error" tone="rose" />
      </div>

      <Card title="庫存列表" icon="list" padded={false} action={
        <div className="flex gap-2">
          <ButtonLink href="/pos/inventory/cross-store" variant="secondary" size="sm" icon="hub">跨店查詢</ButtonLink>
          <ButtonLink href="/pos/inventory/replenish" size="sm" icon="add_box">補貨申請</ButtonLink>
        </div>
      }>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(r) => r.id}
          searchable
          searchFields={(r) => `${r.code} ${r.name}`}
        />
      </Card>
    </PosPageShell>
  );
}
