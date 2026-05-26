"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  resetAllStaffGridAction,
  updateStaffGridPositionAction,
  type StaffGridRow,
} from "@/domain/sales-staff-grid";
import {
  GRID_CELL_ADVICE,
  GRID_CELL_LABELS,
  GRID_CELL_TONE,
  type GridAxis,
  cellKey,
} from "@/domain/sales-staff-grid.constants";

type Banner = { ok: boolean; msg: string } | null;

const AXIS_VALUES: GridAxis[] = [3, 2, 1]; // 上到下：高 → 中 → 低
const ATTITUDE_LABELS: Record<GridAxis, string> = {
  1: "低",
  2: "中",
  3: "高",
};

/** 給 RS 頭像配色（單純依姓名 hash），跟 spec 一致的 palette */
const AVATAR_PALETTE = [
  "#534AB7",
  "#185FA5",
  "#0F6E56",
  "#C8001A",
  "#854F0B",
  "#1A3A5C",
];
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export function StaffGridBoard({
  rows,
  canEdit,
}: {
  rows: StaffGridRow[];
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: "員工評估九宮格",
    breadcrumb: [
      { label: "銷售管理" },
      { label: "主管工作台" },
      { label: "員工評估九宮格" },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // 樂觀狀態 — 拖曳 / 重置時先動 local，後同步 router.refresh
  const [localRows, setLocalRows] = useState<StaffGridRow[]>(rows);
  useEffect(() => {
    setLocalRows(rows);
  }, [rows]);

  // 拖曳中 row id（視覺暗示）
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // 點格時 highlight 顯示說明
  const [activeCell, setActiveCell] = useState<string | null>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const byCell = useMemo(() => {
    const m = new Map<string, StaffGridRow[]>();
    for (const r of localRows) {
      const k = r.grid_cell_key;
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return m;
  }, [localRows]);

  const totalRs = localRows.length;
  const overriddenCount = localRows.filter((r) => r.grid_manual_override).length;

  /* ────────── 拖曳 handlers ────────── */

  const onCardDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    if (!canEdit) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(id);
  };

  const onCardDragEnd = () => {
    setDraggingId(null);
    setDragOverKey(null);
  };

  const onCellDragOver = (e: React.DragEvent<HTMLDivElement>, key: string) => {
    if (!canEdit || !draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverKey(key);
  };

  const onCellDragLeave = (key: string) => {
    setDragOverKey((cur) => (cur === key ? null : cur));
  };

  const onCellDrop = (
    e: React.DragEvent<HTMLDivElement>,
    attitude: GridAxis,
    skill: GridAxis,
  ) => {
    e.preventDefault();
    if (!canEdit) return;
    const id = e.dataTransfer.getData("text/plain");
    setDragOverKey(null);
    setDraggingId(null);
    if (!id) return;

    const row = localRows.find((r) => r.id === id);
    if (!row) return;
    // 沒移位 — skip
    if (row.grid_attitude === attitude && row.grid_skill === skill) return;

    // 樂觀更新
    const prev = localRows;
    const nextKey = cellKey(attitude, skill);
    setLocalRows((curr) =>
      curr.map((r) =>
        r.id === id
          ? {
              ...r,
              grid_attitude: attitude,
              grid_skill: skill,
              grid_manual_override: true,
              grid_evaluated_at: new Date().toISOString(),
              grid_cell_key: nextKey,
            }
          : r,
      ),
    );

    startTransition(async () => {
      const res = await updateStaffGridPositionAction(id, attitude, skill);
      if (res.ok) {
        setBanner({
          ok: true,
          msg: `✓ 已將 ${row.name} 移至「${GRID_CELL_LABELS[nextKey]}」`,
        });
        router.refresh();
      } else {
        // rollback
        setLocalRows(prev);
        setBanner({ ok: false, msg: res.error });
      }
    });
  };

  /* ────────── 重置全部為自動 ────────── */

  const onResetAll = () => {
    if (!canEdit) return;
    if (overriddenCount === 0) {
      setBanner({ ok: false, msg: "目前沒有任何手動覆蓋的位置" });
      return;
    }
    if (
      !window.confirm(
        `將清掉所有手動覆蓋（共 ${overriddenCount} 人），下次依本月接觸 / 成交數重新自動定位，繼續？`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await resetAllStaffGridAction();
      if (res.ok) {
        setBanner({ ok: true, msg: `✓ 已重置 ${res.data.count} 位 RS 為自動` });
        router.refresh();
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  };

  /* ────────── empty state ────────── */

  if (rows.length === 0) {
    return (
      <main className="px-6 py-5 space-y-3">
        <header className="flex items-center gap-2.5">
          <h1 className="text-[16px] font-semibold text-[#2C2C2A]">員工評估九宮格</h1>
          <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
            BDN 第三輪 #4
          </span>
        </header>
        <section className="bg-white border border-[#EEECE6] rounded-lg p-10 text-center">
          <div className="text-[14px] text-[#5A5955] mb-3">
            目前當前品牌沒有在職的 RS 員工。
          </div>
          <a
            href="/sales/manager/staff"
            className="inline-flex h-[30px] items-center px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
          >
            前往 RS 人員管理建立
          </a>
        </section>
      </main>
    );
  }

  /* ────────── 主畫面 ────────── */

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">員工評估九宮格</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          BDN 第三輪 #4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          態度軸（本月接觸數）× 技能軸（本月成交台數）— 系統自動定位，主管可拖曳覆蓋
        </span>
      </header>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalRs}</b> 位在職 RS
          {overriddenCount > 0 && (
            <>
              （手動覆蓋 <b className="text-[#854F0B]">{overriddenCount}</b> 位）
            </>
          )}
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={onResetAll}
            disabled={!canEdit || isPending || overriddenCount === 0}
            className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 disabled:hover:border-[#D5D3CB]"
            title={
              !canEdit
                ? "沒有編輯權限"
                : overriddenCount === 0
                  ? "目前沒有任何手動覆蓋"
                  : "清掉所有手動覆蓋，回到自動計算模式"
            }
          >
            {isPending ? "處理中⋯" : "重置全部為自動"}
          </button>
        </div>
      </div>

      {/* 主體：3×3 grid + 圖例 */}
      <div className={`flex flex-col lg:flex-row gap-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        {/* 3×3 grid + 軸標籤 */}
        <section className="bg-white border border-[#EEECE6] rounded-lg p-4 flex-1">
          <div className="flex">
            {/* Y 軸標籤（技能） */}
            <div className="flex flex-col justify-between pr-2 pt-7 pb-7">
              <span className="text-[11px] text-[#9A9890] font-medium whitespace-nowrap rotate-180 [writing-mode:vertical-rl]">
                ← 技能 高
              </span>
              <span className="text-[11px] text-[#9A9890] font-medium whitespace-nowrap rotate-180 [writing-mode:vertical-rl]">
                技能 低 →
              </span>
            </div>

            <div className="flex-1 flex flex-col gap-2">
              {/* 3 列：skill 3 / 2 / 1 */}
              {AXIS_VALUES.map((skill) => (
                <div key={`row-${skill}`} className="grid grid-cols-3 gap-2">
                  {/* 3 行：attitude 1 / 2 / 3 — 注意 x 軸左到右是 低 → 中 → 高 */}
                  {[1, 2, 3].map((aRaw) => {
                    const attitude = aRaw as GridAxis;
                    const k = cellKey(attitude, skill);
                    const label = GRID_CELL_LABELS[k] ?? "—";
                    const tone = GRID_CELL_TONE[k];
                    const cellRows = byCell.get(k) ?? [];
                    const isOver = dragOverKey === k;
                    const isActive = activeCell === k;
                    return (
                      <div
                        key={k}
                        onClick={() => setActiveCell((v) => (v === k ? null : k))}
                        onDragOver={(e) => onCellDragOver(e, k)}
                        onDragLeave={() => onCellDragLeave(k)}
                        onDrop={(e) => onCellDrop(e, attitude, skill)}
                        className={`min-h-[140px] rounded-lg border-2 px-2 py-2 transition-all cursor-pointer ${
                          isOver
                            ? "border-[#1A3A5C] bg-[#EAF4FB] shadow-md"
                            : isActive
                              ? "border-[#1A3A5C]"
                              : "border-[#EEECE6] hover:border-[#D5D3CB]"
                        }`}
                        style={
                          !isOver
                            ? { backgroundColor: tone?.bg ?? "#F8F7F4" }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-1 mb-1.5">
                          <span
                            className="text-[11px] font-semibold"
                            style={{ color: tone?.text ?? "#5A5955" }}
                          >
                            {label}
                          </span>
                          {cellRows.length > 0 && (
                            <span
                              className="ml-auto text-[10.5px] font-medium px-1.5 rounded-full"
                              style={{
                                backgroundColor: "white",
                                color: tone?.text ?? "#5A5955",
                                border: `1px solid ${tone?.border ?? "#D5D3CB"}`,
                              }}
                            >
                              {cellRows.length}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {cellRows.map((r) => (
                            <div
                              key={r.id}
                              draggable={canEdit}
                              onDragStart={(e) => onCardDragStart(e, r.id)}
                              onDragEnd={onCardDragEnd}
                              title={`${r.name} · 本月接觸 ${r.contacts_this_month} / 成交 ${r.deals_this_month}${r.grid_manual_override ? " · 手動" : " · 自動"}`}
                              data-rs-card={r.id}
                              data-rs-cell={k}
                              data-rs-manual={r.grid_manual_override ? "1" : "0"}
                              className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-white border ${
                                draggingId === r.id
                                  ? "border-[#1A3A5C] opacity-50"
                                  : "border-[#D5D3CB] hover:border-[#9A9890]"
                              } ${canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-default"}`}
                            >
                              <span
                                className="inline-flex w-5 h-5 rounded-full items-center justify-center text-[10px] font-bold text-white"
                                style={{ backgroundColor: avatarColor(r.name) }}
                              >
                                {r.name.charAt(0)}
                              </span>
                              <div className="leading-tight">
                                <div className="text-[11px] font-medium text-[#2C2C2A] whitespace-nowrap">
                                  {r.name}
                                </div>
                                <div className="text-[10px] text-[#9A9890] font-mono">
                                  接{r.contacts_this_month}/成{r.deals_this_month}
                                  {r.grid_manual_override && (
                                    <span className="ml-0.5 text-[#854F0B]">·手</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* X 軸標籤（態度） */}
              <div className="grid grid-cols-3 gap-2 mt-1">
                {([1, 2, 3] as GridAxis[]).map((a) => (
                  <div
                    key={`x-${a}`}
                    className="text-center text-[11px] text-[#9A9890] font-medium"
                  >
                    態度 {ATTITUDE_LABELS[a]}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 圖例 / 說明 panel */}
        <aside className="bg-white border border-[#EEECE6] rounded-lg p-4 lg:w-[280px] shrink-0">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A] mb-2">
            {activeCell
              ? GRID_CELL_LABELS[activeCell] ?? "說明"
              : "格位說明"}
          </h2>
          <p className="text-[12px] text-[#5A5955] leading-relaxed mb-3">
            {activeCell
              ? GRID_CELL_ADVICE[activeCell]
              : "點任一格看主管建議；拖曳卡片可手動覆蓋系統判定。"}
          </p>
          <div className="border-t border-[#EEECE6] pt-3 space-y-1.5">
            <div className="text-[11px] text-[#9A9890] font-medium">自動計算規則</div>
            <div className="text-[11px] text-[#5A5955] leading-relaxed">
              <div>
                <b>技能</b>：本月成交 ≥3 = 高、≥1 = 中、0 = 低
              </div>
              <div>
                <b>態度</b>：本月接觸 ≥10 = 高、≥5 = 中、&lt;5 = 低
              </div>
              <div className="text-[10.5px] text-[#9A9890] mt-1">
                * 手動拖曳後永遠用主管位置，直到「重置全部為自動」
              </div>
            </div>
          </div>
        </aside>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}
