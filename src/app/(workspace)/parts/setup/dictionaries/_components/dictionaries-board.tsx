"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createDictionaryAction,
  deleteDictionaryAction,
  setDictionaryActiveAction,
  updateDictionaryAction,
  type DictionaryInput,
  type DictionaryKind,
  type DictionaryRow,
} from "@/lib/parts-setup/dictionary-actions";

type Banner = { ok: boolean; msg: string } | null;

const TABS: { kind: DictionaryKind; label: string; hint: string }[] = [
  { kind: "category", label: "品類", hint: "備件主檔的「品類」下拉，例：耗材、煞車系統" },
  { kind: "control_level", label: "管控等級", hint: "備件主檔的「管控」下拉，例：A 類 / B 類 / C 類" },
  { kind: "uom", label: "單位", hint: "備件主檔的「單位」下拉，例：個、瓶、組" },
];

const ACCENT_OPTIONS = [
  { value: "", label: "—" },
  { value: "red", label: "紅" },
  { value: "amber", label: "琥珀" },
  { value: "teal", label: "綠" },
  { value: "blue", label: "藍" },
  { value: "navy", label: "深藍" },
  { value: "gray", label: "灰" },
];

function accentClass(c: string | null): string {
  switch (c) {
    case "red":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "amber":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "teal":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "blue":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "navy":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "gray":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    default:
      return "bg-[#F8F7F4] text-[#5A5955]";
  }
}

export function DictionariesBoard({
  rows,
  canEdit,
}: {
  rows: DictionaryRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [activeKind, setActiveKind] = useState<DictionaryKind>("category");

  // Unified panel state — used for both 新增 and 編輯
  type PanelMode =
    | { kind: "closed" }
    | { kind: "create" }
    | { kind: "edit"; id: string };
  const [panel, setPanel] = useState<PanelMode>({ kind: "closed" });

  const blankDraft = (k: DictionaryKind): DictionaryInput => ({
    kind: k,
    code: "",
    label: "",
    description: "",
    accent_color: "",
    sort_order: 0,
    is_active: true,
  });
  const [draft, setDraft] = useState<DictionaryInput>(blankDraft(activeKind));

  const grouped = useMemo(() => {
    const m = new Map<DictionaryKind, DictionaryRow[]>();
    for (const r of rows) {
      const arr = m.get(r.kind) ?? [];
      arr.push(r);
      m.set(r.kind, arr);
    }
    return m;
  }, [rows]);

  const visibleRows = grouped.get(activeKind) ?? [];

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const switchTab = (k: DictionaryKind) => {
    setActiveKind(k);
    setPanel({ kind: "closed" });
    setDraft(blankDraft(k));
  };

  const openCreate = () => {
    setDraft(blankDraft(activeKind));
    setPanel({ kind: "create" });
  };

  const openEdit = (r: DictionaryRow) => {
    setDraft({
      kind: r.kind,
      code: r.code,
      label: r.label,
      description: r.description ?? "",
      accent_color: r.accent_color ?? "",
      sort_order: r.sort_order,
      is_active: r.is_active,
    });
    setPanel({ kind: "edit", id: r.id });
  };

  const closePanel = () => setPanel({ kind: "closed" });

  const submit = () => {
    startTransition(async () => {
      const res =
        panel.kind === "edit"
          ? await updateDictionaryAction(panel.id, {
              code: draft.code,
              label: draft.label,
              description: draft.description ?? "",
              accent_color: draft.accent_color ?? "",
              sort_order: draft.sort_order,
              is_active: draft.is_active,
            })
          : panel.kind === "create"
            ? await createDictionaryAction({ ...draft, kind: activeKind })
            : null;
      if (!res) return;
      if (res.ok) {
        showBanner({
          ok: true,
          msg: panel.kind === "edit" ? "✓ 已儲存變更" : "✓ 已新增",
        });
        closePanel();
        setDraft(blankDraft(activeKind));
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = (id: string, next: boolean) => {
    startTransition(async () => {
      const res = await setDictionaryActiveAction(id, next);
      if (res.ok) router.refresh();
      else showBanner({ ok: false, msg: res.error });
    });
  };

  const deleteOne = (id: string, label: string) => {
    if (!confirm(`確定刪除「${label}」？此動作無法還原。`)) return;
    startTransition(async () => {
      const res = await deleteDictionaryAction(id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        if (panel.kind === "edit" && panel.id === id) closePanel();
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const tabHint = TABS.find((t) => t.kind === activeKind)?.hint ?? "";

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">下拉選單對應 (Mapping)</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          基礎設定
        </span>
        <span className="text-[12px] text-[#9A9890]">
          管理備件主檔下拉選單的可選項目（品類 / 管控等級 / 單位）
        </span>
        <Link
          href="/parts/setup/items"
          className="ml-auto h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          ← 回商品主檔
        </Link>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Tabs */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="flex border-b border-[#EEECE6] bg-[#F8F7F4]">
          {TABS.map((t) => {
            const count = (grouped.get(t.kind) ?? []).length;
            const active = t.kind === activeKind;
            return (
              <button
                key={t.kind}
                type="button"
                onClick={() => switchTab(t.kind)}
                className={`px-4 h-[40px] text-[12.5px] font-medium border-r border-[#EEECE6] last:border-r-0 ${
                  active
                    ? "bg-white text-[#1A3A5C] border-b-2 border-b-[#0F6E56] -mb-px"
                    : "text-[#5A5955] hover:bg-white"
                }`}
              >
                {t.label}
                <span
                  className={`ml-2 inline-flex items-center px-1.5 rounded text-[10.5px] ${
                    active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#EEECE6] text-[#5A5955]"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="px-4 py-3 flex items-center gap-2 text-[12px] text-[#9A9890] border-b border-[#EEECE6]">
          <span>{tabHint}</span>
          <button
            type="button"
            disabled={!canEdit}
            onClick={openCreate}
            className="ml-auto h-[28px] px-3 rounded text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增{TABS.find((t) => t.kind === activeKind)?.label}
          </button>
        </div>

        {/* Unified Create / Edit panel */}
        {panel.kind !== "closed" ? (
          <div className={`px-4 py-3 bg-[#FDF8EC] border-b border-[#EEECE6] ${lockedClass}`}>
            <div className="text-[11.5px] font-medium text-[#854F0B] mb-2">
              {panel.kind === "edit"
                ? `編輯：${draft.code || "—"}`
                : `新增${TABS.find((t) => t.kind === activeKind)?.label}`}
            </div>
            <div className="grid grid-cols-12 gap-2 items-end">
              <Field cols={2} label="代碼 *">
                <input
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  className={inputClass}
                  placeholder={activeKind === "control_level" ? "A / B / C" : ""}
                />
              </Field>
              <Field cols={3} label="顯示名稱 *">
                <input
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field cols={3} label="說明">
                <input
                  value={draft.description ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  className={inputClass}
                />
              </Field>
              <Field cols={1} label="排序">
                <input
                  type="number"
                  value={draft.sort_order ?? 0}
                  onChange={(e) =>
                    setDraft({ ...draft, sort_order: Number(e.target.value) || 0 })
                  }
                  className={inputClass}
                />
              </Field>
              <Field cols={1} label="顏色">
                <select
                  value={draft.accent_color ?? ""}
                  onChange={(e) =>
                    setDraft({ ...draft, accent_color: e.target.value })
                  }
                  className={inputClass}
                >
                  {ACCENT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="col-span-2 flex items-center gap-1.5 justify-end">
                {panel.kind === "edit" ? (
                  <label className="inline-flex items-center gap-1.5 text-[11.5px] mr-auto">
                    <input
                      type="checkbox"
                      checked={draft.is_active ?? true}
                      onChange={(e) =>
                        setDraft({ ...draft, is_active: e.target.checked })
                      }
                    />
                    啟用
                  </label>
                ) : null}
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="h-[30px] px-3 rounded text-[12px] bg-[#0F6E56] text-white disabled:opacity-60"
                >
                  {isPending
                    ? panel.kind === "edit"
                      ? "儲存中…"
                      : "建立中…"
                    : panel.kind === "edit"
                      ? "儲存變更"
                      : "建立"}
                </button>
                <button
                  type="button"
                  onClick={closePanel}
                  className="h-[30px] px-3 rounded text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955]"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* Table */}
        <div className={`overflow-x-auto ${lockedClass}`}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] w-[110px]">代碼</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6]">顯示名稱</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6]">說明</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] w-[70px]">排序</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] w-[80px]">顏色</th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] w-[80px]">狀態</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] w-[200px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((r) => {
                const editing = panel.kind === "edit" && panel.id === r.id;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-[#EEECE6] last:border-b-0 ${
                      editing ? "bg-[#FFFBEA]" : "hover:bg-[#F8F7F4]"
                    }`}
                  >
                    <td className="px-3 py-2 font-mono text-[12px]">{r.code}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[12px] font-medium ${accentClass(r.accent_color)}`}>
                        {r.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-[#5A5955]">{r.description || "—"}</td>
                    <td className="px-3 py-2 text-center font-mono text-[12px] text-[#5A5955]">{r.sort_order}</td>
                    <td className="px-3 py-2 text-center text-[11px] text-[#9A9890]">{r.accent_color || "—"}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}>
                        {r.is_active ? "啟用" : "停用"}
                      </span>
                    </td>
                    <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                      <button type="button" disabled={!canEdit} onClick={() => openEdit(r)} className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50">編輯</button>
                      <button type="button" disabled={!canEdit} onClick={() => toggleActive(r.id, !r.is_active)} className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50">{r.is_active ? "停用" : "啟用"}</button>
                      <button type="button" disabled={!canEdit} onClick={() => deleteOne(r.id, r.label)} className="h-[26px] px-2.5 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[11.5px] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50">刪除</button>
                    </td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[#9A9890] text-[12.5px]">
                    尚無項目，按右上角「新增」開始建立
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Footer note about control_level */}
      {activeKind === "control_level" ? (
        <p className="text-[11.5px] text-[#9A9890] leading-relaxed">
          ⚠ 管控等級的完整定義（價格基準、盤點頻率、容差％等）請至{" "}
          <Link href="/parts/setup/control-types" className="text-[#185FA5] underline">
            管控類型定義
          </Link>{" "}
          頁面設定；本頁僅維護下拉顯示用的代碼與標籤。
        </p>
      ) : null}
    </main>
  );
}

const COL_SPAN: Record<number, string> = {
  1: "col-span-1",
  2: "col-span-2",
  3: "col-span-3",
  4: "col-span-4",
  5: "col-span-5",
  6: "col-span-6",
};

function Field({
  label,
  children,
  cols,
}: {
  label: string;
  children: React.ReactNode;
  cols: number;
}) {
  return (
    <div className={`flex flex-col gap-1 ${COL_SPAN[cols] ?? "col-span-2"}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
