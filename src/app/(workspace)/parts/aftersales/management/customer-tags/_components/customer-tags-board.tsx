"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createOfficialTag,
  deleteOfficialTag,
  setOfficialTagActive,
  updateOfficialTag,
  type OfficialTag,
} from "@/domain/customer-tags";
import {
  TAG_COLORS,
  TAG_COLOR_EMOJI,
  TAG_COLOR_LABEL,
  type TagColor,
} from "@/domain/customer-tags.constants";

type Banner = { ok: boolean; msg: string } | null;

const COLOR_TONE: Record<TagColor, { bg: string; bd: string; fg: string; sectionTitle: string }> = {
  red: { bg: "#FDECEA", bd: "#F5AEAD", fg: "#7A1010", sectionTitle: `${TAG_COLOR_EMOJI.red} 注意事項（高風險）` },
  yellow: { bg: "#FDF3E3", bd: "#F0C97E", fg: "#6B3A00", sectionTitle: `${TAG_COLOR_EMOJI.yellow} 偏好習慣` },
  green: { bg: "#E5F5EE", bd: "#80CCA8", fg: "#084D30", sectionTitle: `${TAG_COLOR_EMOJI.green} 服務備忘` },
  blue: { bg: "#EAF4FB", bd: "#85B7EB", fg: "#0C3E70", sectionTitle: `${TAG_COLOR_EMOJI.blue} 費用／溝通偏好` },
};

export function CustomerTagsBoard({
  tags,
  canEdit,
}: {
  tags: OfficialTag[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [newColor, setNewColor] = useState<TagColor>("red");
  const [newLabel, setNewLabel] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState<TagColor>("red");

  const grouped = useMemo(() => {
    const map: Record<TagColor, OfficialTag[]> = { red: [], yellow: [], green: [], blue: [] };
    for (const t of tags) {
      if (TAG_COLORS.includes(t.color)) map[t.color].push(t);
    }
    return map;
  }, [tags]);

  const totalActive = tags.filter((t) => t.is_active).length;
  const totalAll = tags.length;

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function handleCreate() {
    if (!canEdit) return;
    const label = newLabel.trim();
    if (!label) {
      showBanner({ ok: false, msg: "請輸入標籤文字" });
      return;
    }
    startTransition(async () => {
      const res = await createOfficialTag({ label, color: newColor });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增「${label}」` });
        setNewLabel("");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleDelete(tag: OfficialTag) {
    if (!canEdit) return;
    const ok = window.confirm(
      `確認刪除官方標籤「${tag.label}」？\n\n已使用此標籤的客戶不受影響，但未來 SA 無法再選用。`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deleteOfficialTag(tag.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已刪除「${tag.label}」` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleToggleActive(tag: OfficialTag) {
    if (!canEdit) return;
    startTransition(async () => {
      const res = await setOfficialTagActive(tag.id, !tag.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: tag.is_active ? `已停用「${tag.label}」` : `已啟用「${tag.label}」` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function startEdit(tag: OfficialTag) {
    setEditingId(tag.id);
    setEditLabel(tag.label);
    setEditColor(tag.color);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditLabel("");
  }

  function commitEdit(tag: OfficialTag) {
    if (!canEdit) return;
    const label = editLabel.trim();
    if (!label) {
      showBanner({ ok: false, msg: "標籤文字不可空白" });
      return;
    }
    if (label === tag.label && editColor === tag.color) {
      cancelEdit();
      return;
    }
    startTransition(async () => {
      const res = await updateOfficialTag(tag.id, { label, color: editColor });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已更新「${label}」` });
        cancelEdit();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
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

      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">客戶標籤主管設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          主管工作檯
        </span>
        <span className="text-[12px] text-[#9A9890]">
          維護 SA 預檢/接待時可選用的官方標籤字典 — 共 {totalActive} 個啟用 / {totalAll} 個
        </span>
      </header>

      {/* 說明 alert */}
      <div className="bg-[#EAF4FB] border border-[#B7DAF1] text-[#0D3166] rounded-lg px-4 py-2.5 text-[12.5px] leading-[1.7]">
        <strong>🔒 此頁面僅限「售後主管」操作。</strong>
        在此設定的官方標籤，SA 在預檢／接待時只能選用，不可修改或刪除。
        🔴 類標籤會在每次預檢顯示風險提醒，請謹慎設定。
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* 左 / 中：4 色標籤分區 */}
        <div className="lg:col-span-2 space-y-3">
          {TAG_COLORS.map((color) => {
            const tone = COLOR_TONE[color];
            const list = grouped[color];
            return (
              <section
                key={color}
                className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
                  isPending ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
                  <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                    {tone.sectionTitle}
                    <span className="ml-2 text-[11.5px] font-normal text-[#9A9890]">
                      （{TAG_COLOR_LABEL[color]}）
                    </span>
                  </h2>
                  <span className="text-[11px] text-[#9A9890]">{list.length} 個</span>
                </header>
                <div className="px-4 py-3">
                  {list.length === 0 ? (
                    <div className="text-[12px] text-[#9A9890] py-2">此分類尚未設定任何標籤</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {list.map((tag) =>
                        editingId === tag.id ? (
                          <div
                            key={tag.id}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-full border"
                            style={{ backgroundColor: tone.bg, borderColor: tone.bd }}
                          >
                            <select
                              value={editColor}
                              onChange={(e) => setEditColor(e.target.value as TagColor)}
                              className="h-[24px] text-[11px] border border-[#D5D3CB] rounded px-1 bg-white"
                              disabled={isPending}
                            >
                              {TAG_COLORS.map((c) => (
                                <option key={c} value={c}>
                                  {TAG_COLOR_EMOJI[c]} {TAG_COLOR_LABEL[c]}
                                </option>
                              ))}
                            </select>
                            <input
                              autoFocus
                              type="text"
                              maxLength={20}
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitEdit(tag);
                                if (e.key === "Escape") cancelEdit();
                              }}
                              className="h-[24px] text-[11.5px] border border-[#D5D3CB] rounded px-2 w-[140px] bg-white"
                              disabled={isPending}
                            />
                            <button
                              type="button"
                              onClick={() => commitEdit(tag)}
                              disabled={isPending}
                              className="h-[24px] px-2 rounded text-[11px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
                            >
                              {isPending ? "⋯" : "✓"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={isPending}
                              className="h-[24px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <span
                            key={tag.id}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11.5px] ${
                              tag.is_active ? "" : "opacity-50 line-through"
                            }`}
                            style={{ backgroundColor: tone.bg, borderColor: tone.bd, color: tone.fg }}
                          >
                            <span>
                              {TAG_COLOR_EMOJI[color]} {tag.label}
                            </span>
                            {!tag.is_active && (
                              <span className="text-[10px] bg-white/70 px-1 rounded">已停用</span>
                            )}
                            {canEdit && (
                              <span className="inline-flex items-center gap-0.5 ml-1 border-l border-current/30 pl-1.5 opacity-70">
                                <button
                                  type="button"
                                  title="編輯"
                                  onClick={() => startEdit(tag)}
                                  disabled={isPending}
                                  className="text-[11px] hover:opacity-100"
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  title={tag.is_active ? "停用" : "啟用"}
                                  onClick={() => handleToggleActive(tag)}
                                  disabled={isPending}
                                  className="text-[11px] hover:opacity-100"
                                >
                                  {tag.is_active ? "⏸" : "▶"}
                                </button>
                                <button
                                  type="button"
                                  title="刪除"
                                  onClick={() => handleDelete(tag)}
                                  disabled={isPending}
                                  className="text-[12px] hover:opacity-100 hover:text-[#CC0000]"
                                >
                                  ×
                                </button>
                              </span>
                            )}
                          </span>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>

        {/* 右：新增 + 規則說明 */}
        <div className="space-y-3">
          <section
            className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
              isPending ? "pointer-events-none opacity-60" : ""
            }`}
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">＋ 新增官方標籤</h2>
            </header>
            <div className="px-4 py-3 space-y-2.5">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">標籤類別</label>
                <select
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value as TagColor)}
                  disabled={!canEdit || isPending}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
                >
                  {TAG_COLORS.map((c) => (
                    <option key={c} value={c}>
                      {TAG_COLOR_EMOJI[c]} {TAG_COLOR_LABEL[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  標籤文字（20 字以內）
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                  }}
                  disabled={!canEdit || isPending}
                  placeholder="例：曾有客訴紀錄"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
                />
              </div>
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canEdit || isPending || !newLabel.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "新增中⋯" : "＋ 新增官方標籤"}
              </button>
              <div className="text-[11px] text-[#9A9890] pt-2 border-t border-[#EEECE6]">
                新增後，SA 在預檢單／接待單的「客戶標籤」可從此清單選用。
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">📋 使用規則說明</h2>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12.5px] leading-[1.8] text-[#5A5955]">
              <div>🔒 <b>官方標籤</b>（主管設定）：SA 可選用，<b>不可移除</b></div>
              <div>✏️ <b>自訂標籤</b>（SA 自行新增）：本人可移除，他人不可移除</div>
              <div>🌐 <b>標籤來源</b>：銷售接待、售後回廠均可添加，跨模組共用</div>
              <div>⚠️ <b>安全事項</b>：🔴 類標籤請謹慎設定，會在每次預檢顯示提醒</div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
