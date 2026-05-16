"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  createOfficialTag,
  deleteOfficialTag,
  setOfficialTagActive,
  updateOfficialTag,
  type BrandAggregatedTag,
  type OfficialTag,
} from "@/domain/customer-tags";
import {
  TAG_COLORS,
  TAG_COLOR_EMOJI,
  TAG_COLOR_LABEL,
  type TagColor,
} from "@/domain/customer-tags.constants";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "dict" | "obs";

const COLOR_TONE: Record<
  TagColor,
  { bg: string; bd: string; fg: string; chipDot: string; chipBg: string; sectionTitle: string }
> = {
  red: {
    bg: "#FDECEA",
    bd: "#F5AEAD",
    fg: "#7A1010",
    chipDot: "#C8001A",
    chipBg: "#FDECEA",
    sectionTitle: "🔴 注意事項（高風險）",
  },
  yellow: {
    bg: "#FDF3E3",
    bd: "#F0C97E",
    fg: "#6B3A00",
    chipDot: "#F0C97E",
    chipBg: "#FDF3E3",
    sectionTitle: "🟡 偏好習慣",
  },
  green: {
    bg: "#E5F5EE",
    bd: "#80CCA8",
    fg: "#084D30",
    chipDot: "#5DCAA5",
    chipBg: "#E1F5EE",
    sectionTitle: "🟢 服務備忘",
  },
  blue: {
    bg: "#EAF4FB",
    bd: "#85B7EB",
    fg: "#0C3E70",
    chipDot: "#185FA5",
    chipBg: "#EAF4FB",
    sectionTitle: "🔵 費用／溝通偏好",
  },
};

export function ServiceManagerCustomerTagsBoard({
  officialTags,
  brandAggregated,
  canEdit,
}: {
  officialTags: OfficialTag[];
  brandAggregated: BrandAggregatedTag[];
  canEdit: boolean;
}) {
  useSetPageHeader({
    title: "客戶標籤主管設定",
    breadcrumb: [
      { label: "售後主管", href: "/service/manager/employees" },
      { label: "客戶標籤主管設定" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [tab, setTab] = useState<TabKey>("dict");

  // 新增 form state
  const [newColor, setNewColor] = useState<TagColor>("red");
  const [newLabel, setNewLabel] = useState("");

  // 編輯 modal state
  const [editTarget, setEditTarget] = useState<OfficialTag | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState<TagColor>("red");

  const byColor = useMemo(() => {
    const map: Record<TagColor, OfficialTag[]> = { red: [], yellow: [], green: [], blue: [] };
    for (const t of officialTags) {
      if (TAG_COLORS.includes(t.color)) map[t.color].push(t);
    }
    return map;
  }, [officialTags]);

  const activeCount = useMemo(
    () => officialTags.filter((t) => t.is_active).length,
    [officialTags],
  );
  const totalCount = officialTags.length;

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function handleCreate() {
    const label = newLabel.trim();
    if (!label) {
      showBanner({ ok: false, msg: "請輸入標籤文字" });
      return;
    }
    if (label.length > 20) {
      showBanner({ ok: false, msg: "標籤文字最多 20 字" });
      return;
    }
    startTransition(async () => {
      const res = await createOfficialTag({ label, color: newColor });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增官方標籤「${label}」` });
        setNewLabel("");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function openEdit(t: OfficialTag) {
    setEditTarget(t);
    setEditLabel(t.label);
    setEditColor(t.color);
  }
  function closeEdit() {
    setEditTarget(null);
    setEditLabel("");
  }

  function handleSaveEdit() {
    if (!editTarget) return;
    const label = editLabel.trim();
    if (!label) {
      showBanner({ ok: false, msg: "請輸入標籤文字" });
      return;
    }
    if (label === editTarget.label && editColor === editTarget.color) {
      closeEdit();
      return;
    }
    const id = editTarget.id;
    startTransition(async () => {
      const res = await updateOfficialTag(id, { label, color: editColor });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已更新「${label}」` });
        closeEdit();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleToggleActive(t: OfficialTag) {
    const next = !t.is_active;
    const action = next ? "啟用" : "停用";
    if (!window.confirm(`確認${action}官方標籤「${t.label}」？\n\n已使用此標籤的客戶不受影響${next ? "" : "，但未來 SA 無法再選用"}。`)) {
      return;
    }
    startTransition(async () => {
      const res = await setOfficialTagActive(t.id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已${action}「${t.label}」` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleDelete(t: OfficialTag) {
    if (
      !window.confirm(
        `確認刪除官方標籤「${t.label}」？\n\n已使用此標籤的客戶不受影響，但未來 SA 無法再選用。`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteOfficialTag(t.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `已刪除「${t.label}」` });
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

      {/* Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">客戶標籤主管設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          售後主管 · 14
        </span>
        <span className="text-[12px] text-[#9A9890]">
          官方標籤 {activeCount} / {totalCount} 個（啟用 / 總數） · SA 可選用、不可修改字典本身
        </span>
      </header>

      {/* 權限提示 banner */}
      <div className="bg-[#EAF4FB] border border-[#B7DAF1] text-[#0C3E70] rounded-md px-3.5 py-2.5 text-[12.5px] leading-[1.7]">
        🔒 此頁面僅限「售後主管」權限操作。主管在此設定的官方標籤，SA 人員只能選用，不可修改或刪除。
      </div>

      {/* Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="flex border-b border-[#EEECE6] overflow-x-auto">
          {(
            [
              { key: "dict", label: "🏷 官方標籤字典管理" },
              { key: "obs", label: "👁️ 主管觀察視角（RS 自訂趨勢）" },
            ] as Array<{ key: TabKey; label: string }>
          ).map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                  active
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 space-y-3">
          {tab === "dict" && (
            <DictTab
              byColor={byColor}
              totalCount={totalCount}
              canEdit={canEdit}
              isPending={isPending}
              newColor={newColor}
              setNewColor={setNewColor}
              newLabel={newLabel}
              setNewLabel={setNewLabel}
              onCreate={handleCreate}
              onOpenEdit={openEdit}
              onToggleActive={handleToggleActive}
              onDelete={handleDelete}
            />
          )}
          {tab === "obs" && <ObsTab brandAggregated={brandAggregated} />}
        </div>
      </div>

      {/* ── 編輯 Modal ── */}
      {editTarget && (
        <Modal
          title="✏️ 編輯官方標籤"
          onClose={closeEdit}
          footer={
            <>
              <button
                type="button"
                onClick={closeEdit}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isPending || !editLabel.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "💾 儲存修改"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="標籤文字" required>
              <input
                type="text"
                maxLength={20}
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                disabled={isPending}
                className="w-full h-[34px] border border-[#D5D3CB] rounded px-3 text-[12.5px] focus:border-[#185FA5] outline-none disabled:opacity-60"
              />
            </Field>
            <Field label="標籤類別" required>
              <select
                value={editColor}
                onChange={(e) => setEditColor(e.target.value as TagColor)}
                disabled={isPending}
                className="w-full h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white disabled:opacity-60"
              >
                {TAG_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {TAG_COLOR_EMOJI[c]} {TAG_COLOR_LABEL[c]}（{COLOR_TONE[c].sectionTitle.replace(/^\S+\s/, "")}）
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Modal>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Dict Tab — 官方標籤字典管理（左右雙欄）
// ──────────────────────────────────────────────────────────────────────────
function DictTab(props: {
  byColor: Record<TagColor, OfficialTag[]>;
  totalCount: number;
  canEdit: boolean;
  isPending: boolean;
  newColor: TagColor;
  setNewColor: (c: TagColor) => void;
  newLabel: string;
  setNewLabel: (v: string) => void;
  onCreate: () => void;
  onOpenEdit: (t: OfficialTag) => void;
  onToggleActive: (t: OfficialTag) => void;
  onDelete: (t: OfficialTag) => void;
}) {
  const {
    byColor,
    totalCount,
    canEdit,
    isPending,
    newColor,
    setNewColor,
    newLabel,
    setNewLabel,
    onCreate,
    onOpenEdit,
    onToggleActive,
    onDelete,
  } = props;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      {/* 左：4 色分區字典 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">🏷 官方標籤管理</span>
          <span className="text-[11.5px] text-[#9A9890]">
            共 <b className="text-[#2C2C2A]">{totalCount}</b> 個
          </span>
        </header>
        <div className={`px-4 py-3 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
          {TAG_COLORS.map((color) => {
            const tone = COLOR_TONE[color];
            const list = byColor[color];
            return (
              <div key={color}>
                <div className="text-[11px] font-bold tracking-wider text-[#9A9890] mb-2 flex items-center gap-2">
                  <span>{tone.sectionTitle}</span>
                  <span className="text-[10.5px] text-[#9A9890]">（{list.length}）</span>
                </div>
                <div className="flex flex-wrap gap-2 min-h-[32px]">
                  {list.length === 0 ? (
                    <span className="text-[11.5px] text-[#9A9890] italic">尚無此分類標籤</span>
                  ) : (
                    list.map((t) => (
                      <span
                        key={t.id}
                        title={t.description ?? ""}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[12px] font-medium ${
                          !t.is_active ? "opacity-50 line-through" : ""
                        }`}
                        style={{
                          background: tone.bg,
                          borderColor: tone.bd,
                          color: tone.fg,
                        }}
                      >
                        <span>
                          {TAG_COLOR_EMOJI[color]} {t.label}
                        </span>
                        {canEdit && (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenEdit(t)}
                              disabled={isPending}
                              title="編輯"
                              className="text-[11px] opacity-60 hover:opacity-100"
                            >
                              ✎
                            </button>
                            <button
                              type="button"
                              onClick={() => onToggleActive(t)}
                              disabled={isPending}
                              title={t.is_active ? "停用" : "啟用"}
                              className="text-[10.5px] opacity-60 hover:opacity-100"
                            >
                              {t.is_active ? "🔓" : "🔒"}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(t)}
                              disabled={isPending}
                              title="刪除"
                              className="text-[13px] font-bold opacity-40 hover:opacity-100 hover:text-[#CC0000] leading-none"
                            >
                              ×
                            </button>
                          </>
                        )}
                      </span>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 右：新增 + 規則說明 */}
      <div className="space-y-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">➕ 新增官方標籤</span>
          </header>
          <div className="px-4 py-3 space-y-2.5">
            <div>
              <label className="block text-[11.5px] text-[#5A5955] font-medium mb-1">
                標籤類別
              </label>
              <select
                value={newColor}
                onChange={(e) => setNewColor(e.target.value as TagColor)}
                disabled={isPending || !canEdit}
                className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white disabled:opacity-60"
              >
                {TAG_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {COLOR_TONE[c].sectionTitle}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11.5px] text-[#5A5955] font-medium mb-1">
                標籤文字（20 字以內）
              </label>
              <input
                type="text"
                maxLength={20}
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onCreate();
                }}
                disabled={isPending || !canEdit}
                placeholder="例：曾有客訴紀錄"
                className="w-full h-[32px] border border-[#D5D3CB] rounded px-3 text-[12.5px] focus:border-[#185FA5] outline-none disabled:opacity-60"
              />
            </div>
            <button
              type="button"
              onClick={onCreate}
              disabled={isPending || !canEdit || !newLabel.trim()}
              className="h-[32px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
            >
              {isPending ? "建立中⋯" : "＋ 新增官方標籤"}
            </button>
            <div className="text-[11px] text-[#9A9890] pt-2 border-t border-[#EEECE6] leading-relaxed">
              新增後，SA 人員在預檢單的「客戶標籤」區塊中，可從此清單選用。
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">📋 使用規則說明</span>
          </header>
          <div className="px-4 py-3 space-y-2 text-[12.5px] leading-[1.8] text-[#5A5955]">
            <div>
              🔒 <b>官方標籤</b>（主管設定）：SA 可選用、<b>不可移除</b>
            </div>
            <div>
              ✏️ <b>自訂標籤</b>（SA 自行新增）：本人可移除、他人不可移除
            </div>
            <div>
              🌐 <b>標籤來源</b>：銷售接待、售後回廠均可添加，跨模組共用
            </div>
            <div>
              ⚠️ <b>安全事項</b>：🔴 類標籤請謹慎設定，會在每次預檢顯示提醒
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Obs Tab — 主管觀察視角（reuse listBrandPersonalTagsAggregated）
// ──────────────────────────────────────────────────────────────────────────
function ObsTab({ brandAggregated }: { brandAggregated: BrandAggregatedTag[] }) {
  return (
    <>
      <div className="bg-[#EAF4FB] border border-[#B7DAF1] text-[#0C3E70] rounded-md px-3.5 py-2.5 text-[12px] leading-[1.7]">
        <b>主管觀察視角：</b>此處顯示全 brand RS 自行創建的個人標籤使用頻率。
        若某個自訂標籤被多位 RS 高頻使用，代表有潛在需求，可考慮升為官方標籤
        （回左側「官方標籤字典管理」Tab 新增）。
      </div>

      {brandAggregated.length === 0 ? (
        <div className="py-12 text-center text-[12.5px] text-[#9A9890]">
          目前全 brand 尚無自訂標籤使用記錄
        </div>
      ) : (
        <div className="space-y-2">
          {brandAggregated.map((t) => {
            const tone = COLOR_TONE[t.color];
            const trendLabel =
              t.trend === "hot"
                ? "🔴 高頻使用"
                : t.trend === "rising"
                  ? "🟡 上升中"
                  : "⬜ 一般";
            const borderLeft =
              t.trend === "hot"
                ? "border-l-4 border-l-[#C8001A]"
                : t.trend === "rising"
                  ? "border-l-4 border-l-[#F0C97E]"
                  : "border-l-4 border-l-[#EEECE6]";
            return (
              <div
                key={`${t.color}-${t.name}`}
                className={`bg-white border border-[#EEECE6] ${borderLeft} rounded-md px-3 py-3 flex items-center gap-3`}
              >
                <span
                  className="inline-flex items-center px-3 py-1 rounded-full border-[1.5px] border-dashed text-[12px] font-medium shrink-0"
                  style={{ background: tone.bg, borderColor: tone.bd, color: tone.fg }}
                >
                  {TAG_COLOR_EMOJI[t.color]} {t.name}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold"
                      style={{ background: tone.chipBg, color: tone.fg }}
                    >
                      {TAG_COLOR_LABEL[t.color]}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] bg-[#F1EFE8] text-[#5A5955]">
                      {trendLabel}
                    </span>
                    <span className="font-mono font-bold text-[13px] text-[#1A3A5C]">
                      {t.total_use} 次
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {t.rs_users.map((u) => (
                      <span
                        key={u.id}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] bg-[#F1EFE8] border border-[#D5D3CB] text-[#5A5955]"
                      >
                        {u.display_name}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {t.trend !== "normal" ? (
                    <div className="text-[11px] text-[#854F0B] bg-[#FDF3E3] border border-[#F0C97E] rounded-md px-2.5 py-1.5 leading-tight">
                      💡 建議升為官方
                      <div className="text-[10px] text-[#9A9890] mt-0.5">
                        ← 回左 tab 新增同名官方標籤
                      </div>
                    </div>
                  ) : (
                    <div className="text-[10.5px] text-[#9A9890]">觀察中</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers — Modal / Field
// ──────────────────────────────────────────────────────────────────────────
function Modal(props: {
  title: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/35 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="bg-white rounded-lg w-[460px] max-w-[92vw] shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <div className="text-[14px] font-bold text-[#2C2C2A]">{props.title}</div>
          <button
            type="button"
            onClick={props.onClose}
            className="text-[20px] text-[#9A9890] hover:text-[#2C2C2A] leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{props.children}</div>
        {props.footer && (
          <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
            {props.footer}
          </div>
        )}
      </div>
    </div>
  );
}

function Field(props: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold text-[#4A4A48] mb-1">
        {props.label}
        {props.required && <span className="text-[#C8001A] ml-1">*</span>}
      </div>
      {props.children}
    </div>
  );
}
