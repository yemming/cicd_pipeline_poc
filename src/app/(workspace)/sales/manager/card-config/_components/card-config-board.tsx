"use client";

/**
 * RS_M3 主管設定 — 手卡參數設定（A 級 board）
 *
 * 工項：M01-4「/sales/manager/card-config 升 A 級」
 * Spec：docs/DUCATI_v2_output/01_銷售接待/01_主管工作台/RS_M3_主管設定_v2.html
 *
 * 結構：
 *   1. Page Header（title + sprint chip + caption）
 *   2. KpiCard 頂列（總選項 / 啟用 / 字典 / 閾值 / 開關啟用率）
 *   3. 主視覺：左 sidebar（按 group 列 category）+ 右內容區
 *      - dict category → 表格 CRUD + 排序
 *      - threshold → 數值輸入 + 還原
 *      - flag → on/off switch
 *   4. Banner（成功 / 失敗 toast，右下 fixed）
 *
 * 互動規範遵守 §UX：所有寫入 useTransition + pending lock + 進行式文字。
 * 資料層：呼叫 @/domain/sales-settings 的 helper（天條：不直 import supabase）。
 */

import { useState, useTransition, useEffect, useMemo } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { KpiCard } from "@/components/visualization";
import {
  SALES_DICT_KINDS,
  SALES_DICT_LABELS,
  type SalesDictKind,
} from "@/domain/sales-settings.constants";
import type {
  CardConfigBoardData,
  SalesDictRow,
  SalesThresholdRow,
  SalesFlagRow,
} from "@/domain/sales-settings";
import {
  addSalesDictItem,
  updateSalesDictItem,
  deleteSalesDictItem,
  moveSalesDictItem,
  setSalesDictItemActive,
  updateSalesThreshold,
  setSalesFeatureFlag,
} from "@/domain/sales-settings";

type BannerState = { ok: boolean; msg: string } | null;

type CategoryKey =
  | { kind: "dict"; dictKind: SalesDictKind }
  | { kind: "thresholds" }
  | { kind: "flags" };

function categoryKeyId(c: CategoryKey): string {
  if (c.kind === "dict") return `dict:${c.dictKind}`;
  return c.kind;
}

export default function CardConfigBoard({
  data,
  canEdit,
}: {
  data: CardConfigBoardData;
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: "手卡參數設定",
    breadcrumb: [{ label: "銷售管理" }, { label: "主管工作台" }, { label: "手卡參數設定" }],
  });

  const [banner, setBanner] = useState<BannerState>(null);
  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  // sidebar group 結構（與 SALES_DICT_LABELS.group 一致）
  const groups = useMemo(() => {
    const arr: { group: string; kinds: SalesDictKind[] }[] = [];
    for (const kind of SALES_DICT_KINDS) {
      const g = SALES_DICT_LABELS[kind].group;
      const last = arr[arr.length - 1];
      if (last && last.group === g) last.kinds.push(kind);
      else arr.push({ group: g, kinds: [kind] });
    }
    return arr;
  }, []);

  // 預設選第一個 dict category
  const [selected, setSelected] = useState<CategoryKey>({ kind: "dict", dictKind: SALES_DICT_KINDS[0] });

  const { params, stats } = data;
  const flagEnabledPct = stats.flag_total > 0 ? Math.round((stats.flag_enabled / stats.flag_total) * 100) : 0;
  const dictActivePct = stats.dict_total > 0 ? Math.round((stats.dict_active / stats.dict_total) * 100) : 0;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">手卡參數設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_M3 主管設定
        </span>
        <span className="text-[12px] text-[#9A9890]">
          電子手卡的下拉選單、跟進天數、功能開關，主管統一管理 — 即存即生效
        </span>
        {!canEdit && (
          <span className="ml-auto px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
            🔒 唯讀視角（無 SALES_ORDER_EDIT 權限）
          </span>
        )}
      </header>

      {/* 2. KpiCard 統計列 */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <KpiCard label="設定總數" value={stats.total_options} icon="⚙️" tone="blue" layout="horizontal" />
        <KpiCard
          label="字典選項"
          value={stats.dict_total}
          delta={{ value: dictActivePct, tone: "neutral" }}
          icon="📋"
          tone="teal"
          layout="horizontal"
        />
        <KpiCard label="字典啟用" value={stats.dict_active} icon="✓" tone="green" layout="horizontal" />
        <KpiCard label="數值閾值" value={stats.threshold_count} icon="📅" tone="amber" layout="horizontal" />
        <KpiCard
          label="功能開關"
          value={`${stats.flag_enabled} / ${stats.flag_total}`}
          delta={{ value: flagEnabledPct, tone: "neutral" }}
          icon="🔧"
          tone="purple"
          layout="horizontal"
        />
      </section>

      {/* 3. 規範說明 */}
      <section className="rounded-lg border border-[#85B7EB] bg-[#EAF4FB] px-4 py-3 text-[12px] leading-[1.7] text-[#0C3E70]">
        <div className="font-semibold mb-1">📋 三類參數</div>
        <ul className="ml-4 list-disc space-y-0.5">
          <li><strong>清單型字典</strong>：可新增、修改、停用、排序（RS01 電子手卡、CRM03A、RS_EX1 使用）</li>
          <li><strong>數值型閾值</strong>：跟進天數、休眠天數、保有率區間（CRM03A / CRM01B 使用）</li>
          <li><strong>功能開關</strong>：模組級的 on/off 控制</li>
        </ul>
      </section>

      {/* 4. 主視覺：左 sidebar + 右內容區 */}
      <section className="grid grid-cols-1 lg:grid-cols-[260px,1fr] gap-3 items-start">
        {/* Sidebar */}
        <aside className="rounded-lg border border-[#EEECE6] bg-white overflow-hidden">
          <header className="px-3 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <div className="text-[12px] font-semibold text-[#2C2C2A]">設定分類</div>
            <div className="text-[10.5px] text-[#9A9890] mt-0.5">點擊切換右側內容</div>
          </header>
          <nav className="py-2">
            {groups.map((grp) => (
              <div key={grp.group} className="mb-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9A9890] px-3 py-1.5">
                  {grp.group}
                </div>
                {grp.kinds.map((k) => {
                  const meta = SALES_DICT_LABELS[k];
                  const rows = params.byKind[k] ?? [];
                  const isActive = selected.kind === "dict" && selected.dictKind === k;
                  return (
                    <button
                      key={k}
                      onClick={() => setSelected({ kind: "dict", dictKind: k })}
                      className={
                        "w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12px] transition-colors " +
                        (isActive
                          ? "bg-[#EAF4FB] text-[#185FA5] font-semibold border-l-2 border-[#185FA5]"
                          : "text-[#4A4A48] hover:bg-[#F4F3F0] border-l-2 border-transparent")
                      }
                    >
                      <span>{meta.icon}</span>
                      <span className="flex-1 truncate">{meta.title}</span>
                      <span className="text-[10.5px] text-[#9A9890]">{rows.length}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <div className="mb-1.5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9A9890] px-3 py-1.5">
                跨模組
              </div>
              <button
                onClick={() => setSelected({ kind: "thresholds" })}
                className={
                  "w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12px] transition-colors " +
                  (selected.kind === "thresholds"
                    ? "bg-[#EAF4FB] text-[#185FA5] font-semibold border-l-2 border-[#185FA5]"
                    : "text-[#4A4A48] hover:bg-[#F4F3F0] border-l-2 border-transparent")
                }
              >
                <span>📅</span>
                <span className="flex-1 truncate">數值閾值</span>
                <span className="text-[10.5px] text-[#9A9890]">{stats.threshold_count}</span>
              </button>
              <button
                onClick={() => setSelected({ kind: "flags" })}
                className={
                  "w-full text-left px-3 py-1.5 flex items-center gap-2 text-[12px] transition-colors " +
                  (selected.kind === "flags"
                    ? "bg-[#EAF4FB] text-[#185FA5] font-semibold border-l-2 border-[#185FA5]"
                    : "text-[#4A4A48] hover:bg-[#F4F3F0] border-l-2 border-transparent")
                }
              >
                <span>🔧</span>
                <span className="flex-1 truncate">功能開關</span>
                <span className="text-[10.5px] text-[#9A9890]">{stats.flag_enabled}/{stats.flag_total}</span>
              </button>
            </div>
          </nav>
        </aside>

        {/* 內容區 */}
        <div className="min-w-0" key={categoryKeyId(selected)}>
          {selected.kind === "dict" && (
            <DictPanel
              kind={selected.dictKind}
              rows={params.byKind[selected.dictKind] ?? []}
              onBanner={setBanner}
              canEdit={canEdit}
            />
          )}
          {selected.kind === "thresholds" && (
            <ThresholdPanel rows={params.thresholds} onBanner={setBanner} canEdit={canEdit} />
          )}
          {selected.kind === "flags" && (
            <FlagPanel rows={params.flags} onBanner={setBanner} canEdit={canEdit} />
          )}
        </div>
      </section>

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

// ────────────────────────────── Dict Panel ──────────────────────────────

function DictPanel({
  kind,
  rows,
  onBanner,
  canEdit,
}: {
  kind: SalesDictKind;
  rows: SalesDictRow[];
  onBanner: (b: BannerState) => void;
  canEdit: boolean;
}) {
  const meta = SALES_DICT_LABELS[kind];
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!canEdit) return;
    const label = newLabel.trim();
    if (!label) {
      onBanner({ ok: false, msg: "請輸入選項名稱" });
      return;
    }
    startTransition(async () => {
      const res = await addSalesDictItem({ kind, label, description: newDesc.trim() });
      if (res.ok) {
        onBanner({ ok: true, msg: `✓ 已新增「${label}」` });
        setNewLabel("");
        setNewDesc("");
        setAdding(false);
      } else {
        onBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <section
      data-testid={`dict-panel-${kind}`}
      className={"rounded-lg border border-[#EEECE6] bg-white overflow-hidden " + (isPending ? "opacity-60 pointer-events-none" : "")}
    >
      <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-[34px] h-[34px] rounded-md flex items-center justify-center text-[16px] bg-[#EAF4FB]">
            {meta.icon}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">{meta.title}</div>
            <div className="text-[11px] text-[#9A9890]">{meta.subtitle}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{rows.length}</b> 項 · 啟用{" "}
            <b className="text-[#2C2C2A]">{rows.filter((r) => r.is_active).length}</b>
          </span>
          {canEdit && (
            <button
              className="h-[28px] px-3 rounded text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              onClick={() => setAdding((v) => !v)}
              disabled={isPending}
            >
              {adding ? "取消新增" : "＋ 新增項目"}
            </button>
          )}
        </div>
      </header>

      <div className="px-4 py-3">
        {adding && canEdit && (
          <div className="flex gap-2 items-center p-2.5 mb-3 rounded-md bg-[#F8F7F4] border border-dashed border-[#D5D3CB]">
            <span className="text-[11px] text-[#9A9890] whitespace-nowrap">名稱</span>
            <input
              className="flex-1 h-[28px] px-2 rounded border border-[#D5D3CB] bg-white text-[12px] focus:border-[#185FA5] outline-none"
              placeholder="例：IG 社群廣告"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              autoFocus
            />
            <span className="text-[11px] text-[#9A9890] whitespace-nowrap">說明</span>
            <input
              className="w-[220px] h-[28px] px-2 rounded border border-[#D5D3CB] bg-white text-[12px] focus:border-[#185FA5] outline-none"
              placeholder="選填備註"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <button
              className="h-[28px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              onClick={handleAdd}
              disabled={isPending}
            >
              {isPending ? "新增中⋯" : "確認新增"}
            </button>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="text-center text-[12.5px] text-[#9A9890] py-10">
            <div className="text-[28px] mb-2">📭</div>
            <div>尚無項目</div>
            {canEdit && <div className="text-[11px] mt-1">點上方「＋ 新增項目」開始建立</div>}
          </div>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left">
                <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-2 px-2 border-b-2 border-[#EEECE6] w-[80px]">
                  排序
                </th>
                <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-2 px-2 border-b-2 border-[#EEECE6]">
                  選項名稱
                </th>
                <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-2 px-2 border-b-2 border-[#EEECE6]">
                  說明備註
                </th>
                <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-2 px-2 border-b-2 border-[#EEECE6] w-[80px] whitespace-nowrap">
                  類型
                </th>
                <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-2 px-2 border-b-2 border-[#EEECE6] w-[70px] text-center">
                  狀態
                </th>
                {canEdit && (
                  <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-2 px-2 border-b-2 border-[#EEECE6] w-[260px] text-right">
                    操作
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <DictRow
                  key={row.id}
                  row={row}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < rows.length - 1}
                  onBanner={onBanner}
                  canEdit={canEdit}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DictRow({
  row,
  canMoveUp,
  canMoveDown,
  onBanner,
  canEdit,
}: {
  row: SalesDictRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onBanner: (b: BannerState) => void;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [desc, setDesc] = useState(row.description ?? "");
  const [isPending, startTransition] = useTransition();

  function save() {
    const v = label.trim();
    if (!v) {
      onBanner({ ok: false, msg: "選項名稱不可空白" });
      return;
    }
    startTransition(async () => {
      const res = await updateSalesDictItem(row.id, { label: v, description: desc.trim() });
      if (res.ok) {
        onBanner({ ok: true, msg: "✓ 已更新" });
        setEditing(false);
      } else {
        onBanner({ ok: false, msg: res.error });
      }
    });
  }

  function remove() {
    if (!confirm(row.is_system ? `「${row.label}」為系統預設項目，確定刪除？` : `確定刪除「${row.label}」？`)) return;
    startTransition(async () => {
      const res = await deleteSalesDictItem(row.id);
      if (res.ok) onBanner({ ok: true, msg: "✓ 已刪除" });
      else onBanner({ ok: false, msg: res.error });
    });
  }

  function toggleActive() {
    startTransition(async () => {
      const res = await setSalesDictItemActive(row.id, !row.is_active);
      if (res.ok) onBanner({ ok: true, msg: `✓ 已${row.is_active ? "停用" : "啟用"}` });
      else onBanner({ ok: false, msg: res.error });
    });
  }

  function move(dir: "up" | "down") {
    startTransition(async () => {
      const res = await moveSalesDictItem(row.id, dir);
      if (!res.ok) onBanner({ ok: false, msg: res.error });
    });
  }

  return (
    <tr className={"border-b border-[#F4F3F0] last:border-b-0 hover:bg-[#FAFAF8] " + (isPending ? "opacity-60" : "")}>
      <td className="py-1.5 px-2 text-[11.5px] font-mono text-[#534AB7]">
        <div className="flex items-center gap-1">
          {canEdit && (
            <>
              <button
                className="w-5 h-5 rounded text-[10px] hover:bg-[#EAF4FB] disabled:opacity-30"
                disabled={!canMoveUp || isPending}
                onClick={() => move("up")}
                aria-label="上移"
              >
                ↑
              </button>
              <button
                className="w-5 h-5 rounded text-[10px] hover:bg-[#EAF4FB] disabled:opacity-30"
                disabled={!canMoveDown || isPending}
                onClick={() => move("down")}
                aria-label="下移"
              >
                ↓
              </button>
            </>
          )}
          <span>{row.sort_order}</span>
        </div>
      </td>
      <td className="py-1.5 px-2 text-[12.5px]">
        {editing && canEdit ? (
          <input
            className="w-full h-[26px] px-2 rounded border border-[#D5D3CB] bg-white text-[12px] focus:border-[#185FA5] outline-none"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
          />
        ) : (
          row.label
        )}
      </td>
      <td className="py-1.5 px-2 text-[12px] text-[#7A7A78]">
        {editing && canEdit ? (
          <input
            className="w-full h-[26px] px-2 rounded border border-[#D5D3CB] bg-white text-[12px] focus:border-[#185FA5] outline-none"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="選填"
          />
        ) : (
          row.description || "—"
        )}
      </td>
      <td className="py-1.5 px-2">
        {row.is_system ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#F1EFE8] text-[#5A5955] border border-[#D5D3CB] whitespace-nowrap">
            系統預設
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#EAF3DE] text-[#3B6D11] border border-[#B5D4B0] whitespace-nowrap">
            自訂
          </span>
        )}
      </td>
      <td className="py-1.5 px-2 text-center">
        {row.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
            停用
          </span>
        )}
      </td>
      {canEdit && (
        <td className="py-1.5 px-2">
          <div className="flex items-center justify-end gap-1">
            {editing ? (
              <>
                <button
                  className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
                  onClick={save}
                  disabled={isPending}
                >
                  {isPending ? "儲存中⋯" : "儲存"}
                </button>
                <button
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  onClick={() => {
                    setEditing(false);
                    setLabel(row.label);
                    setDesc(row.description ?? "");
                  }}
                >
                  取消
                </button>
              </>
            ) : (
              <>
                <button
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  onClick={() => setEditing(true)}
                  disabled={isPending}
                >
                  編輯
                </button>
                <button
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  onClick={toggleActive}
                  disabled={isPending}
                >
                  {row.is_active ? "停用" : "啟用"}
                </button>
                <button
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
                  onClick={remove}
                  disabled={isPending}
                >
                  刪除
                </button>
              </>
            )}
          </div>
        </td>
      )}
    </tr>
  );
}

// ────────────────────────────── Threshold Panel ──────────────────────────────

function ThresholdPanel({
  rows,
  onBanner,
  canEdit,
}: {
  rows: SalesThresholdRow[];
  onBanner: (b: BannerState) => void;
  canEdit: boolean;
}) {
  return (
    <section className="rounded-lg border border-[#EEECE6] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] rounded-md flex items-center justify-center text-[16px] bg-[#FDF3E3]">
          📅
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#2C2C2A]">數值閾值設定</div>
          <div className="text-[11px] text-[#9A9890]">CRM03A 跟進邀約 / 休眠激活 / CRM01B 保有率計算</div>
        </div>
        <span className="ml-auto text-[11px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 項
        </span>
      </header>
      <div className="px-4 py-3">
        {rows.length === 0 ? (
          <div className="text-center text-[12.5px] text-[#9A9890] py-10">
            <div className="text-[28px] mb-2">📭</div>
            <div>尚無閾值設定</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {rows.map((r) => (
              <ThresholdItem key={r.id} row={r} onBanner={onBanner} canEdit={canEdit} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ThresholdItem({
  row,
  onBanner,
  canEdit,
}: {
  row: SalesThresholdRow;
  onBanner: (b: BannerState) => void;
  canEdit: boolean;
}) {
  const [value, setValue] = useState<number>(row.config.value);
  const [isPending, startTransition] = useTransition();
  const dirty = value !== row.config.value;

  function save(next: number) {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await updateSalesThreshold(row.id, next);
      if (res.ok) onBanner({ ok: true, msg: `✓ 已更新「${row.config.label}」` });
      else {
        onBanner({ ok: false, msg: res.error });
        setValue(row.config.value);
      }
    });
  }

  function reset() {
    if (!canEdit) return;
    setValue(row.config.default_value);
    save(row.config.default_value);
  }

  return (
    <div
      data-testid={`threshold-${row.config.key}`}
      className={"rounded-lg border border-[#EEECE6] bg-[#F8F7F4] p-3 " + (isPending ? "opacity-60" : "")}
    >
      <div className="text-[11.5px] font-semibold text-[#4A4A48]">{row.config.label}</div>
      <div className="text-[11px] text-[#9A9890] mt-0.5 leading-[1.5]">{row.config.description}</div>
      <div className="flex items-center gap-2.5 mt-2.5 flex-wrap">
        <input
          type="number"
          className="w-[80px] h-[30px] px-2 text-center font-mono font-semibold text-[14px] text-[#2C2C2A] rounded border border-[#D5D3CB] bg-white focus:border-[#185FA5] outline-none disabled:bg-[#F2F2F2]"
          value={value}
          min={row.config.min}
          max={row.config.max}
          onChange={(e) => setValue(Number(e.target.value))}
          onBlur={() => dirty && save(value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && save(value)}
          disabled={isPending || !canEdit}
        />
        <span className="text-[11.5px] text-[#7A7A78]">{row.config.unit}</span>
        {canEdit && (
          <button
            className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#9A9890] hover:bg-[#F4F3F0]"
            onClick={reset}
            disabled={isPending}
          >
            還原預設（{row.config.default_value}）
          </button>
        )}
        {isPending && <span className="text-[11px] text-[#185FA5]">儲存中⋯</span>}
      </div>
    </div>
  );
}

// ────────────────────────────── Flag Panel ──────────────────────────────

function FlagPanel({
  rows,
  onBanner,
  canEdit,
}: {
  rows: SalesFlagRow[];
  onBanner: (b: BannerState) => void;
  canEdit: boolean;
}) {
  return (
    <section className="rounded-lg border border-[#EEECE6] bg-white overflow-hidden">
      <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2.5">
        <div className="w-[34px] h-[34px] rounded-md flex items-center justify-center text-[16px] bg-[#E1F5EE]">
          🔧
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#2C2C2A]">功能開關</div>
          <div className="text-[11px] text-[#9A9890]">各功能模組的啟用 / 停用控制</div>
        </div>
        <span className="ml-auto text-[11px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 項
        </span>
      </header>
      <div className="px-4 py-1">
        {rows.length === 0 ? (
          <div className="text-center text-[12.5px] text-[#9A9890] py-10">
            <div className="text-[28px] mb-2">📭</div>
            <div>尚無功能開關</div>
          </div>
        ) : (
          rows.map((r) => <FlagItem key={r.id} row={r} onBanner={onBanner} canEdit={canEdit} />)
        )}
      </div>
    </section>
  );
}

function FlagItem({
  row,
  onBanner,
  canEdit,
}: {
  row: SalesFlagRow;
  onBanner: (b: BannerState) => void;
  canEdit: boolean;
}) {
  const [enabled, setEnabled] = useState<boolean>(row.config.enabled);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    if (!canEdit) return;
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await setSalesFeatureFlag(row.id, next);
      if (res.ok) onBanner({ ok: true, msg: `✓ ${row.config.label} 已${next ? "啟用" : "停用"}` });
      else {
        setEnabled(!next);
        onBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div
      data-testid={`flag-${row.config.key}`}
      className={"flex items-center justify-between py-2.5 border-b border-[#F4F3F0] last:border-b-0 " + (isPending ? "opacity-60" : "")}
    >
      <div className="flex-1 pr-5">
        <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{row.config.label}</div>
        <div className="text-[11px] text-[#9A9890] mt-0.5 leading-[1.5]">{row.config.description}</div>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={row.config.label}
        onClick={toggle}
        disabled={isPending || !canEdit}
        className={
          "relative w-[40px] h-[22px] rounded-full transition-colors disabled:opacity-60 " +
          (enabled ? "bg-[#185FA5]" : "bg-[#D5D3CB]")
        }
      >
        <span
          className={
            "absolute top-[3px] w-[16px] h-[16px] rounded-full bg-white shadow transition-transform " +
            (enabled ? "left-[3px] translate-x-[18px]" : "left-[3px]")
          }
        />
      </button>
    </div>
  );
}
