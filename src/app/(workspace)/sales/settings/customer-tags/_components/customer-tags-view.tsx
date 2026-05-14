"use client";

/**
 * 客群標籤管理（銷售端 RS_SET2）
 * - 4 個 tab：標籤庫總覽 / 我的自訂標籤 / 使用統計 / 主管觀察視角
 * - 左 sidenav：顏色 filter (5) + 來源 filter (2)
 * - 標籤庫總覽顯示官方（🔒 唯讀）+ 我的自訂（可編輯/刪除）
 * - 個人標籤上限 5 個（PERSONAL_TAG_LIMIT）
 *
 * 規格：docs/proposals/feature-sales-customer-tags.md
 */

import { useMemo, useState, useTransition } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import {
  PERSONAL_TAG_LIMIT,
  TAG_COLORS,
  TAG_COLOR_EMOJI,
  TAG_COLOR_LABEL,
  type TagColor,
} from "@/domain/customer-tags.constants";
import {
  createPersonalTag,
  updatePersonalTag,
  deletePersonalTag,
  type OfficialTag,
  type PersonalTag,
  type BrandAggregatedTag,
} from "@/domain/customer-tags";

type PageData = {
  officialTags: OfficialTag[];
  myTags: PersonalTag[];
  brandAggregated: BrandAggregatedTag[];
  currentUserId: string;
  brandId: string;
};

type BannerState = { ok: boolean; msg: string } | null;

type TabKey = "lib" | "custom" | "stat" | "obs";

const TAB_DEFS: Array<{ key: TabKey; emoji: string; label: string }> = [
  { key: "lib", emoji: "🏷️", label: "標籤庫總覽" },
  { key: "custom", emoji: "✏️", label: "我的自訂標籤" },
  { key: "stat", emoji: "📊", label: "使用統計" },
  { key: "obs", emoji: "👁️", label: "主管觀察視角" },
];

/** color 對應 chip 顏色 token（對齊 HTML） */
const OFFICIAL_CHIP: Record<TagColor, string> = {
  red: "bg-[#FDECEA] border-[#F5AEAD] text-[#C8001A]",
  yellow: "bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B]",
  green: "bg-[#E1F5EE] border-[#5DCAA5] text-[#0F6E56]",
  blue: "bg-[#EAF4FB] border-[#85B7EB] text-[#185FA5]",
};

const CUSTOM_CHIP: Record<TagColor, string> = {
  red: "bg-[#FFF5F5] border-[#F5AEAD] text-[#C8001A]",
  yellow: "bg-[#FFFAF0] border-[#F0C97E] text-[#854F0B]",
  green: "bg-[#F5FDF9] border-[#5DCAA5] text-[#0F6E56]",
  blue: "bg-[#F0F7FF] border-[#85B7EB] text-[#185FA5]",
};

const DOT_BG: Record<TagColor, string> = {
  red: "bg-[#C8001A]",
  yellow: "bg-[#F0C97E]",
  green: "bg-[#5DCAA5]",
  blue: "bg-[#185FA5]",
};

const BADGE_BG: Record<TagColor, string> = {
  red: "bg-[#FDECEA] text-[#C8001A]",
  yellow: "bg-[#FDF3E3] text-[#854F0B]",
  green: "bg-[#E1F5EE] text-[#0F6E56]",
  blue: "bg-[#EAF4FB] text-[#185FA5]",
};

export default function CustomerTagsView({ data }: { data: PageData }) {
  useSetPageHeader({
    title: "客群標籤設定",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/overview" },
      { label: "主管工作台" },
      { label: "客群標籤設定" },
    ],
    hideSearch: true,
  });

  const [tab, setTab] = useState<TabKey>("lib");
  const [colorFilter, setColorFilter] = useState<TagColor | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "official" | "mine">("all");
  const [search, setSearch] = useState("");

  const [myTags, setMyTags] = useState<PersonalTag[]>(data.myTags);
  const [banner, setBanner] = useState<BannerState>(null);
  const [pending, startTransition] = useTransition();

  // create modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<{ name: string; color: TagColor; note: string }>({
    name: "",
    color: "red",
    note: "",
  });

  // edit modal state
  const [editTarget, setEditTarget] = useState<PersonalTag | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; color: TagColor; note: string }>({
    name: "",
    color: "red",
    note: "",
  });

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2400);
  }

  function openCreate(presetColor?: TagColor) {
    setCreateForm({ name: "", color: presetColor ?? "red", note: "" });
    setCreateOpen(true);
  }

  function openEdit(tag: PersonalTag) {
    setEditTarget(tag);
    setEditForm({ name: tag.name, color: tag.color, note: tag.note ?? "" });
  }

  function handleCreate() {
    const name = createForm.name.trim();
    if (!name) {
      showBanner(false, "請輸入標籤名稱");
      return;
    }
    if (myTags.length >= PERSONAL_TAG_LIMIT) {
      showBanner(false, `已達自訂標籤上限 ${PERSONAL_TAG_LIMIT} 個`);
      return;
    }
    startTransition(async () => {
      const res = await createPersonalTag({ name, color: createForm.color, note: createForm.note });
      if (res.ok) {
        // 樂觀更新：插一筆假 row（之後 router.refresh 會被 server 真資料覆蓋）
        const optimistic: PersonalTag = {
          id: res.data.id,
          brand_id: data.brandId,
          owner_id: data.currentUserId,
          name,
          color: createForm.color,
          note: createForm.note || null,
          is_active: true,
          use_count: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setMyTags((prev) => [optimistic, ...prev]);
        setCreateOpen(false);
        showBanner(true, `已建立：${TAG_COLOR_EMOJI[createForm.color]} ${name}`);
      } else {
        showBanner(false, res.error);
      }
    });
  }

  function handleInlineAdd(color: TagColor, name: string, clearInput: () => void) {
    const v = name.trim();
    if (!v) return;
    if (myTags.length >= PERSONAL_TAG_LIMIT) {
      showBanner(false, `已達自訂標籤上限 ${PERSONAL_TAG_LIMIT} 個`);
      return;
    }
    startTransition(async () => {
      const res = await createPersonalTag({ name: v, color });
      if (res.ok) {
        setMyTags((prev) => [
          {
            id: res.data.id,
            brand_id: data.brandId,
            owner_id: data.currentUserId,
            name: v,
            color,
            note: null,
            is_active: true,
            use_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        clearInput();
        showBanner(true, `已新增：${TAG_COLOR_EMOJI[color]} ${v}`);
      } else {
        showBanner(false, res.error);
      }
    });
  }

  function handleEditSave() {
    if (!editTarget) return;
    const name = editForm.name.trim();
    if (!name) {
      showBanner(false, "請輸入標籤名稱");
      return;
    }
    startTransition(async () => {
      const res = await updatePersonalTag(editTarget.id, {
        name,
        color: editForm.color,
        note: editForm.note,
      });
      if (res.ok) {
        setMyTags((prev) =>
          prev.map((t) =>
            t.id === editTarget.id ? { ...t, name, color: editForm.color, note: editForm.note || null } : t,
          ),
        );
        setEditTarget(null);
        showBanner(true, `已更新：${TAG_COLOR_EMOJI[editForm.color]} ${name}`);
      } else {
        showBanner(false, res.error);
      }
    });
  }

  function handleDelete(tag: PersonalTag) {
    if (!confirm(`確定刪除「${TAG_COLOR_EMOJI[tag.color]} ${tag.name}」？\n已貼在客戶身上的標籤不受影響。`)) {
      return;
    }
    startTransition(async () => {
      const res = await deletePersonalTag(tag.id);
      if (res.ok) {
        setMyTags((prev) => prev.filter((t) => t.id !== tag.id));
        showBanner(true, `已刪除：${tag.name}`);
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // counts
  const counts = useMemo(() => {
    const byColor: Record<TagColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
    for (const t of data.officialTags) byColor[t.color] += 1;
    for (const t of myTags) byColor[t.color] += 1;
    return {
      all: data.officialTags.length + myTags.length,
      red: byColor.red,
      yellow: byColor.yellow,
      green: byColor.green,
      blue: byColor.blue,
      official: data.officialTags.length,
      mine: myTags.length,
    };
  }, [data.officialTags, myTags]);

  return (
    <main className={pending ? "px-6 py-5 space-y-3 opacity-95" : "px-6 py-5 space-y-3"}>
      {/* Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">客群標籤設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          銷售 RS_SET2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          官方 {counts.official} 個 · 我的自訂 {counts.mine} / {PERSONAL_TAG_LIMIT} 個
        </span>
        <div className="ml-auto flex items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋標籤名稱..."
            className="h-[30px] px-3 rounded border border-[#D5D3CB] bg-white text-[12.5px] w-[200px] focus:border-[#185FA5] outline-none"
          />
          <button
            onClick={() => openCreate()}
            disabled={pending || myTags.length >= PERSONAL_TAG_LIMIT}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 disabled:cursor-not-allowed"
            title={myTags.length >= PERSONAL_TAG_LIMIT ? `已達上限 ${PERSONAL_TAG_LIMIT} 個` : "新增自訂標籤"}
          >
            ＋ 新增自訂標籤
          </button>
        </div>
      </header>

      {/* Tab pills */}
      <div className="flex gap-0 border border-[#D5D3CB] rounded-md overflow-hidden w-fit">
        {TAB_DEFS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={
              "px-4 h-[30px] text-[12.5px] border-r last:border-r-0 border-[#D5D3CB] transition-colors " +
              (tab === t.key
                ? "bg-[#1A3A5C] text-white font-medium"
                : "bg-white text-[#5A5955] hover:bg-[#F4F3F0]")
            }
          >
            {t.emoji} {t.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-3">
        {/* Sidenav — 顏色 / 來源 filter */}
        <aside className="bg-white border border-[#EEECE6] rounded-lg p-3 h-fit space-y-3">
          <div>
            <div className="text-[10px] font-semibold tracking-wider text-[#9A9890] uppercase mb-1.5 px-1">
              標籤顏色
            </div>
            <FilterRow
              active={colorFilter === "all" && sourceFilter === "all"}
              onClick={() => {
                setColorFilter("all");
                setSourceFilter("all");
              }}
              dot="bg-[#1A3A5C]"
              label="全部"
              count={counts.all}
              countCls="bg-[#F1EFE8] text-[#5A5955]"
            />
            {TAG_COLORS.map((c) => (
              <FilterRow
                key={c}
                active={colorFilter === c && sourceFilter === "all"}
                onClick={() => {
                  setColorFilter(c);
                  setSourceFilter("all");
                }}
                dot={DOT_BG[c]}
                label={`${TAG_COLOR_EMOJI[c]} ${TAG_COLOR_LABEL[c]}`}
                count={counts[c]}
                countCls={BADGE_BG[c]}
              />
            ))}
          </div>
          <div className="border-t border-[#EEECE6] pt-3">
            <div className="text-[10px] font-semibold tracking-wider text-[#9A9890] uppercase mb-1.5 px-1">
              標籤來源
            </div>
            <FilterRow
              active={sourceFilter === "official"}
              onClick={() => {
                setSourceFilter("official");
                setColorFilter("all");
              }}
              dot="bg-[#1A3A5C]"
              label="官方標籤"
              count={counts.official}
              countCls="bg-[#F1EFE8] text-[#5A5955]"
            />
            <FilterRow
              active={sourceFilter === "mine"}
              onClick={() => {
                setSourceFilter("mine");
                setColorFilter("all");
              }}
              dot="bg-[#534AB7]"
              label="我的自訂"
              count={counts.mine}
              countCls="bg-[#EEEDFE] text-[#534AB7]"
            />
          </div>
        </aside>

        {/* Main content */}
        <div>
          {tab === "lib" && (
            <LibTab
              officialTags={data.officialTags}
              myTags={myTags}
              colorFilter={colorFilter}
              sourceFilter={sourceFilter}
              search={search}
              pending={pending}
              onOpenAdd={openCreate}
              onOpenEdit={openEdit}
              onDelete={handleDelete}
              onInlineAdd={handleInlineAdd}
            />
          )}

          {tab === "custom" && (
            <CustomTab
              myTags={myTags}
              pending={pending}
              onOpenAdd={() => openCreate()}
              onOpenEdit={openEdit}
              onDelete={handleDelete}
            />
          )}

          {tab === "stat" && <StatTab officialTags={data.officialTags} myTags={myTags} />}

          {tab === "obs" && <ObsTab brandAggregated={data.brandAggregated} />}
        </div>
      </div>

      {/* Create modal */}
      {createOpen && (
        <Modal title="✏️ 新增自訂標籤" onClose={() => !pending && setCreateOpen(false)}>
          <div className="space-y-3">
            <Field label="標籤名稱" required>
              <input
                type="text"
                value={createForm.name}
                onChange={(e) => setCreateForm((p) => ({ ...p, name: e.target.value }))}
                maxLength={20}
                placeholder="例：首次騎重機"
                className="w-full h-[34px] px-3 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
              />
              <div className="text-[11px] text-[#9A9890] mt-1">
                最多 20 字 · 每筆客戶資料最多貼 {PERSONAL_TAG_LIMIT} 個自訂標籤
              </div>
            </Field>
            <Field label="標籤顏色分類" required>
              <select
                value={createForm.color}
                onChange={(e) => setCreateForm((p) => ({ ...p, color: e.target.value as TagColor }))}
                className="w-full h-[34px] px-3 rounded border border-[#D5D3CB] bg-white text-[12.5px] outline-none"
              >
                <option value="red">🔴 注意事項（客戶需要特別留意的狀況）</option>
                <option value="yellow">🟡 偏好特質（喜好、興趣、車款傾向）</option>
                <option value="green">🟢 服務備忘（服務過程的重要提醒）</option>
                <option value="blue">🔵 談判協商（議價、讓步、條件交換記錄）</option>
              </select>
            </Field>
            <Field label="說明備註">
              <textarea
                value={createForm.note}
                onChange={(e) => setCreateForm((p) => ({ ...p, note: e.target.value }))}
                placeholder="說明這個標籤的使用情境，方便日後識別..."
                rows={3}
                className="w-full px-3 py-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none resize-y"
              />
            </Field>
            <div className="bg-[#E1F5EE] border border-[#5DCAA5] rounded-md px-3 py-2 text-[11.5px] text-[#085041]">
              ✅ 建立後立即可用，無需審核。主管可在觀察視角看到使用情況。
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setCreateOpen(false)}
              disabled={pending}
              className="h-[32px] px-3.5 rounded bg-white border border-[#D5D3CB] text-[12.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleCreate}
              disabled={pending}
              className="h-[32px] px-3.5 rounded bg-[#1A3A5C] text-white text-[12.5px] font-medium hover:bg-[#142E4A] disabled:opacity-60"
            >
              {pending ? "建立中⋯" : "✅ 立即建立"}
            </button>
          </div>
        </Modal>
      )}

      {/* Edit modal */}
      {editTarget && (
        <Modal title="✏️ 編輯自訂標籤" onClose={() => !pending && setEditTarget(null)}>
          <div className="space-y-3">
            <Field label="標籤名稱">
              <input
                type="text"
                value={editForm.name}
                onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))}
                maxLength={20}
                className="w-full h-[34px] px-3 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
              />
            </Field>
            <Field label="標籤顏色分類">
              <select
                value={editForm.color}
                onChange={(e) => setEditForm((p) => ({ ...p, color: e.target.value as TagColor }))}
                className="w-full h-[34px] px-3 rounded border border-[#D5D3CB] bg-white text-[12.5px] outline-none"
              >
                <option value="red">🔴 注意事項</option>
                <option value="yellow">🟡 偏好特質</option>
                <option value="green">🟢 服務備忘</option>
                <option value="blue">🔵 談判協商</option>
              </select>
            </Field>
            <Field label="說明備註">
              <textarea
                value={editForm.note}
                onChange={(e) => setEditForm((p) => ({ ...p, note: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none resize-y"
              />
            </Field>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setEditTarget(null)}
              disabled={pending}
              className="h-[32px] px-3.5 rounded bg-white border border-[#D5D3CB] text-[12.5px] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              取消
            </button>
            <button
              onClick={handleEditSave}
              disabled={pending}
              className="h-[32px] px-3.5 rounded bg-[#1A3A5C] text-white text-[12.5px] font-medium hover:bg-[#142E4A] disabled:opacity-60"
            >
              {pending ? "儲存中⋯" : "💾 儲存修改"}
            </button>
          </div>
        </Modal>
      )}

      {/* Banner */}
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

// ──────────────────────────────────────────────────────────────────────────
// Tab: 標籤庫總覽
// ──────────────────────────────────────────────────────────────────────────

function LibTab({
  officialTags,
  myTags,
  colorFilter,
  sourceFilter,
  search,
  pending,
  onOpenAdd,
  onOpenEdit,
  onDelete,
  onInlineAdd,
}: {
  officialTags: OfficialTag[];
  myTags: PersonalTag[];
  colorFilter: TagColor | "all";
  sourceFilter: "all" | "official" | "mine";
  search: string;
  pending: boolean;
  onOpenAdd: (color?: TagColor) => void;
  onOpenEdit: (tag: PersonalTag) => void;
  onDelete: (tag: PersonalTag) => void;
  onInlineAdd: (color: TagColor, name: string, clearInput: () => void) => void;
}) {
  const q = search.trim().toLowerCase();
  const sections = TAG_COLORS.filter((c) => colorFilter === "all" || colorFilter === c).map((color) => {
    const off = officialTags.filter(
      (t) => t.color === color && sourceFilter !== "mine" && (!q || t.label.toLowerCase().includes(q)),
    );
    const cust = myTags.filter(
      (t) => t.color === color && sourceFilter !== "official" && (!q || t.name.toLowerCase().includes(q)),
    );
    return { color, off, cust };
  });

  const hasAny = sections.some((s) => s.off.length > 0 || s.cust.length > 0);

  return (
    <div className="space-y-3">
      <InfoBanner tone="blue">
        <b>標籤庫說明：</b>官方標籤由主管在「售後 12」統一設定，RS
        只能使用，不能修改或刪除（🔒）。 自訂標籤由 RS 個人自由新增，每筆客戶資料最多貼{" "}
        <b>{PERSONAL_TAG_LIMIT} 個自訂標籤</b>。
        主管可在「主管觀察視角」Tab 瀏覽全店自訂標籤的使用趨勢。
      </InfoBanner>

      {!hasAny && (
        <div className="bg-white border border-[#EEECE6] rounded-lg p-10 text-center text-[12.5px] text-[#9A9890]">
          沒有符合搜尋的標籤
        </div>
      )}

      {sections.map(({ color, off, cust }) => {
        if (off.length === 0 && cust.length === 0) return null;
        return (
          <section
            key={color}
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
          >
            <header className="flex items-center justify-between px-4 py-2.5 border-b border-[#EEECE6]">
              <div className="flex items-center gap-2.5">
                <div className={`w-3 h-3 rounded-full ${DOT_BG[color]}`} />
                <div>
                  <div className="text-[13px] font-semibold text-[#2C2C2A]">
                    {TAG_COLOR_EMOJI[color]} {TAG_COLOR_LABEL[color]}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-0.5">
                    官方 {off.length} 個{cust.length > 0 ? ` · 自訂 ${cust.length} 個` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-[#9A9890] font-mono">{off.length + cust.length} 個標籤</span>
                <button
                  onClick={() => onOpenAdd(color)}
                  disabled={pending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
                >
                  ＋ 新增自訂
                </button>
              </div>
            </header>

            <div className="px-4 py-3.5">
              {off.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#9A9890] mb-2 flex items-center gap-1.5">
                    官方標籤
                    <span className="bg-[#E8EDF2] text-[#3A5A6C] border border-[#8FAABB] rounded-md px-1.5 py-px text-[9.5px]">
                      🔒 主管管理
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {off.map((t) => (
                      <span
                        key={t.id}
                        title={t.description ?? ""}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-[1.5px] text-[12px] font-medium ${OFFICIAL_CHIP[t.color]}`}
                      >
                        {t.emoji ?? TAG_COLOR_EMOJI[t.color]} {t.label}
                        <span className="text-[10px] opacity-55">🔒</span>
                        <span className="text-[10px] bg-black/10 px-1.5 py-px rounded-full">{t.usage}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}

              {cust.length > 0 && (
                <>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[#534AB7] mb-2">
                    我的自訂標籤
                  </div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {cust.map((t) => (
                      <span
                        key={t.id}
                        title={t.note ?? ""}
                        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-[1.5px] border-dashed text-[12px] font-medium cursor-pointer ${CUSTOM_CHIP[t.color]}`}
                        onClick={() => !pending && onOpenEdit(t)}
                      >
                        {TAG_COLOR_EMOJI[t.color]} {t.name}
                        <span className="text-[11px] opacity-50">✎</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!pending) onDelete(t);
                          }}
                          className="text-[12px] font-bold opacity-50 hover:opacity-100 hover:text-[#C8001A]"
                          aria-label="刪除"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </>
              )}

              <InlineAddRow color={color} pending={pending} onSubmit={onInlineAdd} />
            </div>
          </section>
        );
      })}
    </div>
  );
}

function InlineAddRow({
  color,
  pending,
  onSubmit,
}: {
  color: TagColor;
  pending: boolean;
  onSubmit: (color: TagColor, name: string, clearInput: () => void) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-2 pt-3 border-t border-dashed border-[#EEECE6]">
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !pending) onSubmit(color, value, () => setValue(""));
        }}
        maxLength={20}
        placeholder="輸入新標籤名稱後按 Enter..."
        className="flex-1 h-[28px] px-3 rounded-full border-[1.5px] border-dashed border-[#D5D3CB] bg-[#FAFAF8] text-[12px] focus:border-[#85B7EB] focus:bg-white outline-none"
        disabled={pending}
      />
      <button
        onClick={() => onSubmit(color, value, () => setValue(""))}
        disabled={pending || !value.trim()}
        className={`h-[28px] px-3.5 rounded-full text-[12px] font-semibold border-[1.5px] disabled:opacity-50 ${OFFICIAL_CHIP[color]}`}
      >
        {pending ? "新增中⋯" : "＋ 新增"}
      </button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: 我的自訂標籤
// ──────────────────────────────────────────────────────────────────────────

function CustomTab({
  myTags,
  pending,
  onOpenAdd,
  onOpenEdit,
  onDelete,
}: {
  myTags: PersonalTag[];
  pending: boolean;
  onOpenAdd: () => void;
  onOpenEdit: (tag: PersonalTag) => void;
  onDelete: (tag: PersonalTag) => void;
}) {
  const used = myTags.length;
  const limitCls =
    used >= PERSONAL_TAG_LIMIT
      ? "bg-[#FDECEA] border-[#F5AEAD] text-[#C8001A]"
      : used >= 4
      ? "bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B]"
      : "bg-[#F8F7F4] border-[#EEECE6] text-[#5A5955]";

  return (
    <div className="space-y-3">
      <InfoBanner tone="green">
        <b>自訂標籤說明：</b>您可以自由新增個人自訂標籤，無需審核，立即可用。 每筆客戶資料最多貼{" "}
        <b>{PERSONAL_TAG_LIMIT} 個自訂標籤</b>（官方標籤不限）。
        主管可在觀察視角看到全店自訂標籤的使用情況，但不干預您的使用。
      </InfoBanner>

      <div className={`flex items-center gap-3 px-3 py-2 rounded-md border text-[12px] ${limitCls}`}>
        <div className="flex gap-1">
          {Array.from({ length: PERSONAL_TAG_LIMIT }).map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full ${i < used ? "bg-[#1A3A5C]" : "bg-[#EEECE6]"}`}
            />
          ))}
        </div>
        <span>
          每筆客戶資料可貼自訂標籤：
          <b>
            {used} / {PERSONAL_TAG_LIMIT}
          </b>{" "}
          個
        </span>
        {used >= PERSONAL_TAG_LIMIT && <span className="ml-auto font-semibold">已達上限</span>}
      </div>

      {myTags.length === 0 ? (
        <div className="bg-white border border-[#EEECE6] rounded-lg p-10 text-center text-[13px] text-[#9A9890]">
          尚未建立任何自訂標籤
          <div className="mt-3">
            <button
              onClick={onOpenAdd}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#142E4A]"
            >
              ＋ 新增第一個自訂標籤
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {myTags.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-center gap-3"
            >
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-[1.5px] border-dashed text-[12px] font-medium ${CUSTOM_CHIP[t.color]}`}
              >
                {TAG_COLOR_EMOJI[t.color]} {t.name}
              </span>
              <div className="flex-1">
                <div className="text-[11.5px] text-[#5A5955]">
                  {TAG_COLOR_EMOJI[t.color]} {TAG_COLOR_LABEL[t.color]}
                </div>
                <div className="text-[11px] text-[#9A9890] mt-0.5">{t.note || "無說明"}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10.5px] text-[#9A9890]">使用次數</div>
                <div className="text-[16px] font-bold font-mono text-[#1A3A5C]">{t.use_count}</div>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] bg-[#EEEDFE] text-[#534AB7]">
                個人自訂
              </span>
              <button
                onClick={() => onOpenEdit(t)}
                disabled={pending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
              >
                編輯
              </button>
              <button
                onClick={() => onDelete(t)}
                disabled={pending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
              >
                刪除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: 使用統計
// ──────────────────────────────────────────────────────────────────────────

function StatTab({ officialTags, myTags }: { officialTags: OfficialTag[]; myTags: PersonalTag[] }) {
  const rows = useMemo(() => {
    const combined = [
      ...officialTags.map((t) => ({
        name: t.label,
        emoji: t.emoji ?? TAG_COLOR_EMOJI[t.color],
        color: t.color,
        usage: t.usage,
        kind: "official" as const,
      })),
      ...myTags.map((t) => ({
        name: t.name,
        emoji: TAG_COLOR_EMOJI[t.color],
        color: t.color,
        usage: t.use_count,
        kind: "personal" as const,
      })),
    ];
    return combined.sort((a, b) => b.usage - a.usage).slice(0, 15);
  }, [officialTags, myTags]);

  const maxUsage = Math.max(1, ...rows.map((r) => r.usage));

  const fillBg: Record<TagColor, string> = {
    red: "#C8001A",
    yellow: "#F0C97E",
    green: "#5DCAA5",
    blue: "#185FA5",
  };

  return (
    <div className="space-y-3">
      <InfoBanner tone="blue">
        <b>使用統計：</b>本月 · 我的客戶 · 貼標次數排行（前 15）。
        貼標 assignment 表尚未建置，目前顯示框架；接上後自動依實際資料更新。
      </InfoBanner>
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <div className="w-[30px] h-[30px] rounded-md bg-[#EAF4FB] flex items-center justify-center text-[14px]">
            📊
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">標籤使用統計</div>
            <div className="text-[11px] text-[#9A9890] mt-0.5">本月 · 我的客戶 · 貼標次數排行</div>
          </div>
        </div>
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {["排名", "標籤名稱", "類別", "使用次數", "佔比"].map((h) => (
                <th
                  key={h}
                  className="text-left text-[10.5px] font-semibold uppercase tracking-wider text-[#9A9890] px-3 py-2 border-b-2 border-[#EEECE6]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[12px] text-[#9A9890]">
                  沒有資料
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const pct = Math.round((r.usage / maxUsage) * 100);
              return (
                <tr key={`${r.kind}-${r.name}-${i}`} className="hover:bg-[#FAFAF8]">
                  <td
                    className={`px-3 py-2 border-b border-[#F4F3F0] text-[12.5px] font-mono font-bold ${i < 3 ? "text-[#854F0B]" : "text-[#9A9890]"}`}
                  >
                    {i + 1}
                  </td>
                  <td className="px-3 py-2 border-b border-[#F4F3F0]">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] ${BADGE_BG[r.color]}`}
                    >
                      {r.emoji} {r.name}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] text-[#7A7A78]">
                    {TAG_COLOR_EMOJI[r.color]} {TAG_COLOR_LABEL[r.color]}
                    {r.kind === "personal" && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-px rounded-md text-[10px] bg-[#EEEDFE] text-[#534AB7]">
                        個人
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-[#F4F3F0]">
                    <div className="inline-block w-[100px] h-[7px] bg-[#EEECE6] rounded-full overflow-hidden align-middle mr-1.5">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: fillBg[r.color] }}
                      />
                    </div>
                    <span className="text-[12.5px] font-mono font-bold text-[#1A3A5C]">{r.usage}</span>
                  </td>
                  <td className="px-3 py-2 border-b border-[#F4F3F0] text-[12px] text-[#9A9890]">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: 主管觀察視角
// ──────────────────────────────────────────────────────────────────────────

function ObsTab({ brandAggregated }: { brandAggregated: BrandAggregatedTag[] }) {
  const trendCls = (trend: BrandAggregatedTag["trend"]) =>
    trend === "hot"
      ? "border-l-[3px] border-l-[#C8001A]"
      : trend === "rising"
      ? "border-l-[3px] border-l-[#F0C97E]"
      : "border-l-[3px] border-l-[#EEECE6]";
  const trendLabel = (trend: BrandAggregatedTag["trend"]) =>
    trend === "hot" ? "🔴 高頻使用" : trend === "rising" ? "🟡 上升中" : "⬜ 一般";

  return (
    <div className="space-y-3">
      <InfoBanner tone="blue">
        <b>主管觀察視角：</b>此頁顯示全店 RS 目前使用的自訂標籤及使用頻率，供主管作為向下學習的參考。
        若某個自訂標籤被多位 RS 高頻使用，代表有潛在需求。
        <b>升為官方標籤的操作請至「售後 12 客戶標籤主管設定」執行</b>，此頁僅作觀察用途。
      </InfoBanner>

      {brandAggregated.length === 0 && (
        <div className="bg-white border border-[#EEECE6] rounded-lg p-10 text-center text-[12.5px] text-[#9A9890]">
          目前全店尚無自訂標籤使用記錄
        </div>
      )}

      {brandAggregated.map((t, idx) => (
        <div
          key={`${t.color}-${t.name}-${idx}`}
          className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-center gap-3 ${trendCls(t.trend)}`}
        >
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-[1.5px] border-dashed text-[12px] font-medium ${CUSTOM_CHIP[t.color]} shrink-0`}
          >
            {TAG_COLOR_EMOJI[t.color]} {t.name}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] ${BADGE_BG[t.color]}`}
              >
                {TAG_COLOR_LABEL[t.color]}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] bg-[#F1EFE8] text-[#5A5955]">
                {trendLabel(t.trend)}
              </span>
              <span className="font-mono font-bold text-[#1A3A5C] text-[13px]">{t.total_use} 次</span>
            </div>
            <div className="flex gap-1.5 mt-1.5 flex-wrap">
              {t.rs_users.map((u) => (
                <span
                  key={u.id}
                  className="text-[10.5px] bg-[#F1EFE8] border border-[#D5D3CB] rounded-md px-1.5 py-px text-[#5A5955]"
                >
                  {u.display_name}
                </span>
              ))}
            </div>
          </div>
          <div className="shrink-0 text-right">
            {t.trend !== "normal" ? (
              <div className="text-[11px] text-[#854F0B] bg-[#FDF3E3] border border-[#F0C97E] rounded-md px-2.5 py-1.5 leading-tight">
                💡 高頻使用
                <div className="text-[10px] text-[#9A9890] mt-0.5">升為官方請至售後 12 →</div>
              </div>
            ) : (
              <div className="text-[10.5px] text-[#9A9890]">觀察中</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Shared mini components
// ──────────────────────────────────────────────────────────────────────────

function FilterRow({
  active,
  onClick,
  dot,
  label,
  count,
  countCls,
}: {
  active: boolean;
  onClick: () => void;
  dot: string;
  label: string;
  count: number;
  countCls: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-[12px] mb-0.5 transition-colors " +
        (active ? "bg-[#EAF4FB] text-[#185FA5] font-semibold" : "text-[#4A4A48] hover:bg-[#F4F3F0]")
      }
    >
      <span className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        {label}
      </span>
      <span className={`text-[11px] font-mono font-semibold px-1.5 py-px rounded ${countCls}`}>
        {count}
      </span>
    </button>
  );
}

function InfoBanner({ tone, children }: { tone: "blue" | "green" | "warn"; children: React.ReactNode }) {
  const cls =
    tone === "green"
      ? "bg-[#E1F5EE] border-[#5DCAA5] text-[#085041]"
      : tone === "warn"
      ? "bg-[#FDF3E3] border-[#F0C97E] text-[#6B3A00]"
      : "bg-[#EAF4FB] border-[#85B7EB] text-[#0C3E70]";
  const icon = tone === "green" ? "✏️" : tone === "warn" ? "⚠️" : "💡";
  return (
    <div className={`border rounded-lg px-4 py-2.5 text-[12px] leading-relaxed flex gap-2.5 items-start ${cls}`}>
      <span className="text-[16px] shrink-0">{icon}</span>
      <div>{children}</div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold text-[#4A4A48] mb-1">
        {label}
        {required && <span className="text-[#C8001A] ml-1">*</span>}
      </div>
      {children}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl w-[460px] max-w-[92vw] shadow-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between">
          <div className="text-[14px] font-bold text-[#2C2C2A]">{title}</div>
          <button
            onClick={onClose}
            className="text-[20px] text-[#9A9890] hover:text-[#5A5955] px-1.5 leading-none"
            aria-label="關閉"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
