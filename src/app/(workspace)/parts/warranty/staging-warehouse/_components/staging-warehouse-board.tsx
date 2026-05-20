"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  HierarchyTree,
  KpiCard,
  type TreeNode,
} from "@/components/visualization";
import { BarChart } from "@/components/charts/BarChart";
import { setWarrantyStaging } from "@/lib/parts-warranty/staging-warehouse-actions";
import type {
  StagingOccupancy,
  TreeNodeData,
  WarehouseListRow,
} from "@/domain/parts-warranty-staging";

type Banner = { ok: boolean; msg: string } | null;

type ConfirmState =
  | null
  | {
      warehouseId: string;
      warehouseName: string;
      nextValue: boolean;
      storedCount: number;
    };

export function StagingWarehouseBoard({
  tree,
  warehouses,
  stagingWarehouses,
  selectedWarehouse,
  occupancy,
  totals,
  canEdit,
}: {
  tree: TreeNodeData[];
  warehouses: WarehouseListRow[];
  stagingWarehouses: WarehouseListRow[];
  selectedWarehouse: WarehouseListRow | null;
  occupancy: StagingOccupancy | null;
  totals: { stagingCount: number; storedTotal: number };
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // 樹的選中節點 id 用 "wh:<id>" 前綴；點 brand / zone / bin 也可看，但只有 warehouse 會更新 right panel
  const selectedNodeId = selectedWarehouse
    ? `wh:${selectedWarehouse.id}`
    : undefined;

  const handleSelectNode = (node: TreeNode) => {
    const info = nodeKindById.get(node.id);
    if (!info || info.kind !== "warehouse" || !info.warehouseId) return;
    const url = new URL(window.location.href);
    url.searchParams.set("wh", info.warehouseId);
    router.push(url.pathname + url.search);
  };

  // React Compiler 自動 memo（"use client"）— 不用手動 useMemo
  const decoratedTree = toHierarchyNodes(tree);
  // 維護 click → warehouse id 的快查（HierarchyTree 拿到的是 TreeNode 不帶 kind）
  const nodeKindById = buildNodeKindMap(tree);

  const triggerToggle = (value: boolean) => {
    if (!selectedWarehouse) return;
    const stored = occupancy?.storedCount ?? 0;
    // 取消 staging 且有件數 → 跳 confirm
    if (!value && stored > 0) {
      setConfirm({
        warehouseId: selectedWarehouse.id,
        warehouseName: selectedWarehouse.name,
        nextValue: value,
        storedCount: stored,
      });
      return;
    }
    runToggle(selectedWarehouse.id, value);
  };

  const runToggle = (warehouseId: string, value: boolean) => {
    startTransition(async () => {
      const res = await setWarrantyStaging(warehouseId, value);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: value ? "✓ 已設為保固暫存倉" : "✓ 已取消保固暫存倉",
        });
        setConfirm(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
        setConfirm(null);
      }
    });
  };

  const ageData = occupancy?.ageDistribution ?? [
    { bucket: "0-30" as const, count: 0 },
    { bucket: "30-60" as const, count: 0 },
    { bucket: "60-90" as const, count: 0 },
    { bucket: "90+" as const, count: 0 },
  ];

  const isLoadingOverlay = isPending ? "pointer-events-none opacity-60" : "";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          保固暫存倉設定
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          11.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          標示哪個倉作為保固索賠舊件的暫存隔離倉 · 含庫齡分佈視覺化
        </span>
      </header>

      {/* Info banner */}
      <div className="px-4 py-2.5 rounded-lg bg-[#EAF4FB] border border-[#B5D4F4] text-[12px] text-[#1A3A5C]">
        🏗 保固暫存倉專門存放保固舊件（客戶送回有問題的舊件）— 不計入可售庫存、
        不參與盤點差異計算；等原廠審核後再決定退原廠或銷毀。每 brand 通常 1–2 個倉。
      </div>

      {/* KPI 列 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <KpiCard
          label="目前保固暫存倉數"
          value={totals.stagingCount}
          tone="blue"
          icon={<span className="text-[18px]">🏗</span>}
        />
        <KpiCard
          label="全部倉庫總數"
          value={warehouses.length}
          tone="gray"
          icon={<span className="text-[18px]">📦</span>}
        />
        <KpiCard
          label="保固暫存倉總佔用件數"
          value={totals.storedTotal}
          tone={totals.storedTotal > 0 ? "amber" : "green"}
          icon={<span className="text-[18px]">⏰</span>}
        />
      </div>

      {/* 雙欄主體：左 tree、右 detail */}
      <div className={`grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-3 ${isLoadingOverlay}`}>
        {/* 左：HierarchyTree 倉庫架構 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              🌳 倉儲架構樹
            </h2>
            <span className="ml-auto text-[11px] text-[#9A9890]">
              點選倉庫節點檢視
            </span>
          </header>
          <div className="p-2 max-h-[640px] overflow-y-auto">
            {decoratedTree.length === 0 ||
            decoratedTree[0]?.children?.length === 0 ? (
              <div className="px-3 py-8 text-[12px] text-[#9A9890] text-center">
                目前 brand 還沒有任何倉庫。請先到「倉庫管理」建立倉。
              </div>
            ) : (
              <HierarchyTree
                data={decoratedTree}
                selectedId={selectedNodeId}
                onSelect={handleSelectNode}
              />
            )}
          </div>
        </section>

        {/* 右：選中倉的 Panel */}
        <section className="space-y-3">
          {selectedWarehouse ? (
            <>
              {/* Title bar + toggle */}
              <div className="bg-white border border-[#EEECE6] rounded-lg p-4">
                <div className="flex items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] tracking-wider text-[#9A9890]">
                      WAREHOUSE
                    </div>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      <h2 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                        {selectedWarehouse.name}
                      </h2>
                      <span className="font-mono text-[12px] text-[#5A5955]">
                        {selectedWarehouse.code}
                      </span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                          selectedWarehouse.is_active
                            ? "bg-[#EAF3DE] text-[#3B6D11]"
                            : "bg-[#F2F2F2] text-[#6B6A68]"
                        }`}
                      >
                        {selectedWarehouse.is_active ? "啟用" : "停用"}
                      </span>
                      {selectedWarehouse.is_warranty_staging ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
                          🏗 保固暫存倉
                        </span>
                      ) : null}
                      {selectedWarehouse.type === "consignment" ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                          寄存倉
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[12px] text-[#5A5955] mt-1.5">
                      所屬門店：{selectedWarehouse.org_name ?? "—"}
                    </div>
                  </div>

                  {/* Toggle */}
                  <div className="flex flex-col items-end gap-1.5">
                    <span className="text-[11px] text-[#9A9890]">
                      是否為保固暫存倉
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={selectedWarehouse.is_warranty_staging}
                      disabled={!canEdit || isPending}
                      onClick={() =>
                        triggerToggle(!selectedWarehouse.is_warranty_staging)
                      }
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-150 disabled:opacity-50 ${
                        selectedWarehouse.is_warranty_staging
                          ? "bg-[#0F6E56]"
                          : "bg-[#D5D3CB]"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform duration-150 ${
                          selectedWarehouse.is_warranty_staging
                            ? "translate-x-6"
                            : "translate-x-1"
                        }`}
                      />
                    </button>
                    {isPending ? (
                      <span className="text-[11px] text-[#854F0B]">
                        切換中⋯
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* KPI + BarChart 雙欄（僅 staging 倉顯示佔用統計） */}
              {selectedWarehouse.is_warranty_staging && occupancy ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <KpiCard
                      label="暫存件數"
                      value={occupancy.storedCount}
                      tone={occupancy.storedCount > 0 ? "blue" : "gray"}
                      icon={<span className="text-[18px]">📦</span>}
                    />
                    <KpiCard
                      label="平均庫齡（天）"
                      value={occupancy.avgAgeDays}
                      tone={
                        occupancy.avgAgeDays >= 60
                          ? "red"
                          : occupancy.avgAgeDays >= 30
                            ? "amber"
                            : "green"
                      }
                      icon={<span className="text-[18px]">📅</span>}
                    />
                    <KpiCard
                      label="最老件（天）"
                      value={occupancy.oldestDays}
                      tone={
                        occupancy.oldestDays >= 90
                          ? "red"
                          : occupancy.oldestDays >= 60
                            ? "amber"
                            : "green"
                      }
                      icon={<span className="text-[18px]">⏰</span>}
                    />
                  </div>

                  <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                    <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
                      <h3 className="text-[13px] font-semibold text-[#2C2C2A]">
                        📊 庫齡分佈
                      </h3>
                      <span className="ml-auto text-[11px] text-[#9A9890]">
                        天數區間 / 件數
                      </span>
                    </header>
                    <div className="px-4 py-3">
                      {occupancy.storedCount === 0 ? (
                        <div className="py-8 text-center text-[12px] text-[#9A9890]">
                          目前該倉沒有任何暫存舊件。
                        </div>
                      ) : (
                        <BarChart
                          data={ageData}
                          categoryKey="bucket"
                          valueKey="count"
                          tone="amber"
                          size="md"
                          showTooltip
                        />
                      )}
                    </div>
                  </section>
                </>
              ) : (
                <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-8 text-center">
                  <div className="text-[13px] text-[#5A5955] mb-1">
                    此倉尚未設為保固暫存倉
                  </div>
                  <div className="text-[12px] text-[#9A9890]">
                    打開右上角開關後可看到佔用件數、庫齡分佈、最老件統計。
                  </div>
                </div>
              )}

              {/* 目前所有 staging 倉 quick list */}
              <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
                  <h3 className="text-[13px] font-semibold text-[#2C2C2A]">
                    🏗 當前已標記為保固暫存倉
                  </h3>
                  <span className="ml-auto text-[11px] text-[#9A9890]">
                    共 <b className="text-[#2C2C2A]">{totals.stagingCount}</b> 個
                  </span>
                </header>
                {stagingWarehouses.length === 0 ? (
                  <div className="px-4 py-6 text-[12px] text-[#9A9890]">
                    目前還沒有任何倉被標記為保固暫存倉。從左側樹點選倉、打開上方開關。
                  </div>
                ) : (
                  <ul className="divide-y divide-[#EEECE6]">
                    {stagingWarehouses.map((w) => (
                      <li
                        key={w.id}
                        className="px-4 py-2 flex items-center gap-2 text-[12.5px]"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const url = new URL(window.location.href);
                            url.searchParams.set("wh", w.id);
                            router.push(url.pathname + url.search);
                          }}
                          className="text-left flex-1 hover:underline"
                        >
                          <span className="font-semibold text-[#2C2C2A]">
                            {w.name}
                          </span>
                          <span className="ml-2 font-mono text-[11.5px] text-[#5A5955]">
                            {w.code}
                          </span>
                          <span className="ml-2 text-[11.5px] text-[#9A9890]">
                            {w.org_name ?? "—"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-10 text-center">
              <div className="text-[13px] text-[#5A5955] mb-1">
                從左側樹選一個倉開始
              </div>
              <div className="text-[12px] text-[#9A9890]">
                目前 brand 還沒有任何倉庫可供選擇。
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Confirm modal — 取消 staging 且有件數時提醒 */}
      {confirm ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !isPending && setConfirm(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 border-b border-[#EEECE6]">
              <h2 className="text-[14px] font-semibold text-[#2C2C2A]">
                確認取消保固暫存倉？
              </h2>
            </div>
            <div className="px-5 py-4 text-[12.5px] text-[#2C2C2A] space-y-2">
              <p>
                <b>{confirm.warehouseName}</b> 目前還有{" "}
                <b className="text-[#CC0000]">{confirm.storedCount}</b> 件保固舊件存放在內。
              </p>
              <p className="text-[#854F0B]">
                取消後該倉將計入可售庫存、納入盤點作業，請確認是否已移轉或處理完所有舊件。
              </p>
            </div>
            <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirm(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() =>
                  runToggle(confirm.warehouseId, confirm.nextValue)
                }
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-60"
              >
                {isPending ? "切換中⋯" : "確認取消"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Tree decorator — TreeNodeData → HierarchyTree.TreeNode + staging chip badge
// ────────────────────────────────────────────────────────────────────────────

function buildNodeKindMap(
  nodes: TreeNodeData[],
): Map<string, { kind: string; warehouseId?: string }> {
  const map = new Map<string, { kind: string; warehouseId?: string }>();
  const stack: TreeNodeData[] = [...nodes];
  while (stack.length > 0) {
    const n = stack.pop()!;
    map.set(n.id, { kind: n.kind, warehouseId: n.warehouseId });
    if (n.children) {
      for (const c of n.children) stack.push(c);
    }
  }
  return map;
}

function toHierarchyNodes(nodes: TreeNodeData[]): TreeNode[] {
  return nodes.map((n) => {
    let badge = null;
    if (n.kind === "warehouse" && n.isStaging) {
      badge = (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
          🏗 暫存
        </span>
      );
    } else if (n.kind === "warehouse" && n.isActive === false) {
      badge = (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
          停用
        </span>
      );
    }
    return {
      id: n.id,
      label: n.label,
      badge,
      children: n.children ? toHierarchyNodes(n.children) : undefined,
    };
  });
}
