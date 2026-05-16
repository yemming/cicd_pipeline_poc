"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  updateEnvCheckItems,
  type EnvCheckItem,
} from "@/domain/env-check-items";

type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-full";
const labelClass = "text-[11px] text-[#9A9890] font-medium";
const lockedClass = "pointer-events-none opacity-60";

function reorder(items: EnvCheckItem[]): EnvCheckItem[] {
  return items.map((it, idx) => ({ ...it, sort_order: idx + 1 }));
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EnvCheckItemsBoard({
  initialItems,
  updatedAt,
  canEdit,
}: {
  initialItems: EnvCheckItem[];
  updatedAt: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<EnvCheckItem[]>(initialItems);
  const [banner, setBanner] = useState<Banner>(null);
  const [modal, setModal] = useState<{ open: boolean } | null>(null);

  const dirty = useMemo(() => {
    if (items.length !== initialItems.length) return true;
    return items.some((it, i) => {
      const o = initialItems[i];
      return (
        it.code !== o.code ||
        it.label !== o.label ||
        it.sort_order !== o.sort_order ||
        it.is_active !== o.is_active
      );
    });
  }, [items, initialItems]);

  const activeCount = items.filter((i) => i.is_active).length;

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function moveUp(idx: number) {
    if (idx <= 0) return;
    const next = [...items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    setItems(reorder(next));
  }
  function moveDown(idx: number) {
    if (idx >= items.length - 1) return;
    const next = [...items];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    setItems(reorder(next));
  }
  function toggleActive(idx: number) {
    const next = [...items];
    next[idx] = { ...next[idx], is_active: !next[idx].is_active };
    setItems(next);
  }
  function editLabel(idx: number, value: string) {
    const next = [...items];
    next[idx] = { ...next[idx], label: value };
    setItems(next);
  }
  function removeAt(idx: number) {
    const it = items[idx];
    if (!confirm(`確定刪除「${it.label}」？\n建議改成停用以保留歷史記錄對應。`))
      return;
    setItems(reorder(items.filter((_, i) => i !== idx)));
  }
  function addItem(code: string, label: string) {
    setItems(
      reorder([
        ...items,
        {
          code: code.trim(),
          label: label.trim(),
          sort_order: items.length + 1,
          is_active: true,
        },
      ]),
    );
  }

  function saveAll() {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await updateEnvCheckItems(items);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }
  function resetChanges() {
    setItems(initialItems);
    showBanner({ ok: true, msg: "已還原" });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">環檢項目設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後管理
        </span>
        <span className="text-[12px] text-[#9A9890]">
          維護接待預檢 wizard Step 1「環車檢查」的項目清單
        </span>
      </header>

      {/* 警告提示 */}
      <div className="bg-[#FAEEDA] border border-[#BA7517] rounded-lg px-3.5 py-2.5 text-[12px] text-[#412402] leading-relaxed">
        <strong>⚠️ 重要：</strong>項目代碼一經使用即不建議修改；項目名稱（label）是歷史預檢單勾選的 stable key，
        改 label 不影響舊資料，但找不到對應 label 的舊勾選會顯示為「未檢」。建議**改成「停用」**以保留歷史對應。
      </div>

      {/* 環檢項目表 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${isPending ? lockedClass : ""}`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 環車檢查項目清單</span>
          <span className="text-[11px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{items.length}</b> 項｜啟用中 <b className="text-[#3B6D11]">{activeCount}</b>
            {updatedAt ? `｜最後更新 ${fmtDateTime(updatedAt)}` : ""}
          </span>
        </header>

        <div className="p-3">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] text-left">
                <th className="font-medium px-2 py-1.5 w-[40px]">順序</th>
                <th className="font-medium px-2 py-1.5 w-[140px]">代碼</th>
                <th className="font-medium px-2 py-1.5">項目名稱（顯示於 wizard）</th>
                <th className="font-medium px-2 py-1.5 w-[80px]">狀態</th>
                <th className="font-medium px-2 py-1.5 w-[200px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-[12px] text-[#9A9890] text-center py-6">
                    尚未維護任何環檢項目，請新增至少一項
                  </td>
                </tr>
              ) : (
                items.map((it, idx) => (
                  <tr key={`${it.code}-${idx}`} className="border-t border-[#F2F1ED]">
                    <td className="px-2 py-1.5 text-[12px] text-[#5A5955] font-mono">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <span className="font-mono text-[12px] bg-[#F2F2F2] text-[#5A5955] px-1.5 py-0.5 rounded">
                        {it.code}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className={inputClass}
                        value={it.label}
                        onChange={(e) => editLabel(idx, e.target.value)}
                        disabled={!canEdit || isPending}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      {it.is_active ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11] whitespace-nowrap">
                          啟用
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
                          停用
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          disabled={!canEdit || isPending || idx === 0}
                          onClick={() => moveUp(idx)}
                          title="上移"
                          className="h-[26px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit || isPending || idx === items.length - 1}
                          onClick={() => moveDown(idx)}
                          title="下移"
                          className="h-[26px] px-2 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit || isPending}
                          onClick={() => toggleActive(idx)}
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                        >
                          {it.is_active ? "停用" : "啟用"}
                        </button>
                        <button
                          type="button"
                          disabled={!canEdit || isPending}
                          onClick={() => removeAt(idx)}
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <button
            type="button"
            disabled={!canEdit || isPending}
            onClick={() => setModal({ open: true })}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增項目
          </button>
          <span className="ml-auto flex items-center gap-2">
            {dirty && (
              <span className="text-[11px] text-[#854F0B] bg-[#FDF3E3] px-2 py-0.5 rounded-md">
                有未儲存的變更
              </span>
            )}
            <button
              type="button"
              disabled={!canEdit || isPending || !dirty}
              onClick={resetChanges}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              還原
            </button>
            <button
              type="button"
              disabled={!canEdit || isPending || !dirty}
              onClick={saveAll}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
            >
              {isPending ? "儲存中⋯" : "儲存變更"}
            </button>
          </span>
        </footer>
      </section>

      {/* Add modal */}
      {modal?.open && (
        <AddItemModal
          existingCodes={items.map((i) => i.code)}
          onClose={() => setModal(null)}
          onAdd={(code, label) => {
            addItem(code, label);
            setModal(null);
            showBanner({ ok: true, msg: "已新增，記得按「儲存變更」" });
          }}
        />
      )}

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

function AddItemModal({
  existingCodes,
  onClose,
  onAdd,
}: {
  existingCodes: string[];
  onClose: () => void;
  onAdd: (code: string, label: string) => void;
}) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit() {
    const c = code.trim();
    const l = label.trim();
    if (!c) {
      setError("代碼必填");
      return;
    }
    if (!/^[a-z][a-z0-9_]{0,30}$/i.test(c)) {
      setError("代碼格式錯：英數底線、開頭字母、最多 31 字");
      return;
    }
    if (existingCodes.includes(c)) {
      setError(`代碼「${c}」已存在`);
      return;
    }
    if (!l) {
      setError("名稱必填");
      return;
    }
    if (l.length > 60) {
      setError("名稱最多 60 字");
      return;
    }
    onAdd(c, l);
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[460px] max-w-[92vw] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 bg-[#1A1A1A] text-white text-[13px] font-semibold">
          新增環檢項目
        </header>
        <div className="px-4 py-4 space-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>代碼（英數底線，開頭字母）</label>
            <input
              className={inputClass + " font-mono"}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="chain_slack"
              maxLength={31}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>項目名稱（顯示於 wizard）</label>
            <input
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="鏈條鬆緊度"
              maxLength={60}
            />
          </div>
          {error && (
            <div className="text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2 py-1.5">
              {error}
            </div>
          )}
          <p className="text-[11px] text-[#9A9890] leading-relaxed">
            提示：代碼建立後不可修改，名稱可隨時調整。新項目會放在清單最末、預設啟用。
          </p>
        </div>
        <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
          >
            新增
          </button>
        </footer>
      </div>
    </div>
  );
}
