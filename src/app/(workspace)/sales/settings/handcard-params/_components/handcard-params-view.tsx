"use client";

import { useState, useTransition, useEffect } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import {
  SALES_DICT_KINDS,
  SALES_DICT_LABELS,
  type SalesDictKind,
} from "@/domain/sales-settings.constants";
import type {
  HandcardParamsData,
  SalesDictRow,
  SalesThresholdRow,
  SalesFlagRow,
} from "@/domain/sales-settings";
import {
  addSalesDictItem,
  updateSalesDictItem,
  deleteSalesDictItem,
  moveSalesDictItem,
  updateSalesThreshold,
  setSalesFeatureFlag,
} from "@/domain/sales-settings";

type BannerState = { ok: boolean; msg: string } | null;

const ACCENT_BG: Record<string, string> = {
  blue: "bg-[#EAF4FB]",
  amber: "bg-[#FDF3E3]",
  teal: "bg-[#E1F5EE]",
  red: "bg-[#FDECEA]",
  purple: "bg-[#EEEDFE]",
};

export default function HandcardParamsView({ data }: { data: HandcardParamsData }) {
  useSetPageHeader({
    title: "手卡參數設定",
    breadcrumb: [{ label: "銷售管理" }, { label: "手卡參數設定" }],
    hideSearch: true,
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

  // 將 dictionary 依群組分組顯示
  const groups: { group: string; kinds: SalesDictKind[] }[] = [];
  for (const kind of SALES_DICT_KINDS) {
    const g = SALES_DICT_LABELS[kind].group;
    const last = groups[groups.length - 1];
    if (last && last.group === g) last.kinds.push(kind);
    else groups.push({ group: g, kinds: [kind] });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">手卡參數設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">銷售模組 / Settings</span>
        <span className="text-[12px] text-[#9A9890]">下拉選單、數值閾值、功能開關，主管可自行新增、修改、停用、排序。</span>
      </header>

      {/* 規範說明 */}
      <section className="rounded-lg border border-[#85B7EB] bg-[#EAF4FB] px-4 py-3 text-[12px] leading-[1.7] text-[#0C3E70]">
        <div className="font-semibold mb-1">📋 三類參數說明</div>
        <ul className="ml-4 list-disc space-y-0.5">
          <li><strong>清單型</strong>：可新增、修改、停用、排序，適用線索來源、購買方式、競品清單等下拉選單字典</li>
          <li><strong>數值型</strong>：直接輸入數字，有預設值與還原按鈕，適用跟進天數、閾值設定等</li>
          <li><strong>開關型</strong>：On/Off 切換，適用功能啟用 / 停用</li>
          <li>所有變更<strong>即存即生效</strong>，不需「儲存所有」整批送出</li>
        </ul>
      </section>

      {/* 清單型 section（八個） */}
      {groups.map((grp) => (
        <div key={grp.group} className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#9A9890] pt-1 px-1">
            {grp.group}
          </div>
          {grp.kinds.map((kind) => (
            <DictSection
              key={kind}
              kind={kind}
              rows={data.byKind[kind] ?? []}
              onBanner={showBanner}
            />
          ))}
        </div>
      ))}

      {/* 數值型 */}
      <ThresholdSection rows={data.thresholds} onBanner={showBanner} />

      {/* 開關型 */}
      <FlagSection rows={data.flags} onBanner={showBanner} />

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

// ────────────────────────────── Dict Section ──────────────────────────────

function DictSection({
  kind,
  rows,
  onBanner,
}: {
  kind: SalesDictKind;
  rows: SalesDictRow[];
  onBanner: (b: BannerState) => void;
}) {
  const meta = SALES_DICT_LABELS[kind];
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleAdd() {
    if (!newLabel.trim()) {
      onBanner({ ok: false, msg: "請輸入選項名稱" });
      return;
    }
    startTransition(async () => {
      const res = await addSalesDictItem({ kind, label: newLabel.trim(), description: newDesc.trim() });
      if (res.ok) {
        onBanner({ ok: true, msg: `✓ 已新增「${newLabel.trim()}」` });
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
      data-testid={`dict-section-${kind}`}
      className={"rounded-lg border border-[#EEECE6] bg-white overflow-hidden " + (isPending ? "opacity-60 pointer-events-none" : "")}
    >
      <header
        className="flex items-center justify-between px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center gap-2.5">
          <div className={"w-[30px] h-[30px] rounded-md flex items-center justify-center text-[14px] " + (ACCENT_BG[meta.accent] ?? "bg-[#F2F2F2]")}>
            {meta.icon}
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">{meta.title}</div>
            <div className="text-[11px] text-[#9A9890]">{meta.subtitle}</div>
          </div>
        </div>
        <div className="text-[12px] text-[#9A9890] flex items-center gap-1.5">
          <span>{rows.length} 項</span>
          <span className={"inline-block transition-transform " + (open ? "rotate-90" : "")}>›</span>
        </div>
      </header>
      {open && (
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11.5px] text-[#7A7A78]">用「↑ ↓」調整排序；停用後不再於下拉顯示</div>
            <button
              className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#E1F5EE] border border-[#5DCAA5] text-[#0F6E56] hover:bg-[#C8EEE0] disabled:opacity-60"
              onClick={() => setAdding((v) => !v)}
            >
              {adding ? "取消新增" : "＋ 新增項目"}
            </button>
          </div>

          {adding && (
            <div className="flex gap-2 items-center p-2.5 mb-2 rounded-md bg-[#F8F7F4] border border-dashed border-[#D5D3CB]">
              <span className="text-[11px] text-[#9A9890] whitespace-nowrap">名稱</span>
              <input
                className="flex-1 h-[28px] px-2 rounded border border-[#D5D3CB] bg-white text-[12px] focus:border-[#185FA5] outline-none"
                placeholder="例：IG 社群廣告"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
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
            <div className="text-center text-[12px] text-[#9A9890] py-6">尚無項目，點「＋ 新增項目」開始</div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="text-left">
                  <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-1.5 px-2 border-b-2 border-[#EEECE6] w-[60px]">排序</th>
                  <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-1.5 px-2 border-b-2 border-[#EEECE6]">選項名稱</th>
                  <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-1.5 px-2 border-b-2 border-[#EEECE6]">說明備註</th>
                  <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-1.5 px-2 border-b-2 border-[#EEECE6] w-[80px] whitespace-nowrap">類型</th>
                  <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-1.5 px-2 border-b-2 border-[#EEECE6] w-[64px] text-center">狀態</th>
                  <th className="text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] py-1.5 px-2 border-b-2 border-[#EEECE6] w-[210px] text-right">操作</th>
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
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

function DictRow({
  row,
  canMoveUp,
  canMoveDown,
  onBanner,
}: {
  row: SalesDictRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onBanner: (b: BannerState) => void;
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
          <span>{row.sort_order}</span>
        </div>
      </td>
      <td className="py-1.5 px-2 text-[12.5px]">
        {editing ? (
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
        {editing ? (
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
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#F1EFE8] text-[#5A5955] border border-[#D5D3CB] whitespace-nowrap">系統預設</span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#EAF3DE] text-[#3B6D11] border border-[#B5D4B0] whitespace-nowrap">自訂</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-center">
        {row.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">啟用</span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">停用</span>
        )}
      </td>
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
    </tr>
  );
}

// ────────────────────────────── Threshold Section ──────────────────────────────

function ThresholdSection({
  rows,
  onBanner,
}: {
  rows: SalesThresholdRow[];
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
          <div className="w-[30px] h-[30px] rounded-md flex items-center justify-center text-[14px] bg-[#FDF3E3]">📅</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">數值閾值設定</div>
            <div className="text-[11px] text-[#9A9890]">CRM03A 跟進邀約 / 休眠激活 / CRM01B 保有率計算</div>
          </div>
        </div>
        <div className="text-[12px] text-[#9A9890] flex items-center gap-1.5">
          <span>{rows.length} 項</span>
          <span className={"inline-block transition-transform " + (open ? "rotate-90" : "")}>›</span>
        </div>
      </header>
      {open && (
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {rows.map((r) => (
            <ThresholdItem key={r.id} row={r} onBanner={onBanner} />
          ))}
        </div>
      )}
    </section>
  );
}

function ThresholdItem({
  row,
  onBanner,
}: {
  row: SalesThresholdRow;
  onBanner: (b: BannerState) => void;
}) {
  const [value, setValue] = useState<number>(row.config.value);
  const [isPending, startTransition] = useTransition();
  const dirty = value !== row.config.value;

  function save(next: number) {
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

// ────────────────────────────── Flag Section ──────────────────────────────

function FlagSection({
  rows,
  onBanner,
}: {
  rows: SalesFlagRow[];
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
          <div className="w-[30px] h-[30px] rounded-md flex items-center justify-center text-[14px] bg-[#E1F5EE]">🔧</div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">功能開關</div>
            <div className="text-[11px] text-[#9A9890]">各功能模組的啟用 / 停用控制</div>
          </div>
        </div>
        <div className="text-[12px] text-[#9A9890] flex items-center gap-1.5">
          <span>{rows.length} 項</span>
          <span className={"inline-block transition-transform " + (open ? "rotate-90" : "")}>›</span>
        </div>
      </header>
      {open && (
        <div className="px-4 py-1">
          {rows.map((r) => (
            <FlagItem key={r.id} row={r} onBanner={onBanner} />
          ))}
        </div>
      )}
    </section>
  );
}

function FlagItem({
  row,
  onBanner,
}: {
  row: SalesFlagRow;
  onBanner: (b: BannerState) => void;
}) {
  const [enabled, setEnabled] = useState<boolean>(row.config.enabled);
  const [isPending, startTransition] = useTransition();

  function toggle() {
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
        disabled={isPending}
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
