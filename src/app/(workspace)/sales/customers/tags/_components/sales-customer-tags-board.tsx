"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  createPersonalTag,
  deletePersonalTag,
  updatePersonalTag,
  type BrandAggregatedTag,
  type OfficialTag,
  type PersonalTag,
} from "@/domain/customer-tags";
import {
  PERSONAL_TAG_LIMIT,
  TAG_COLORS,
  TAG_COLOR_EMOJI,
  TAG_COLOR_LABEL,
  type TagColor,
} from "@/domain/customer-tags.constants";

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "lib" | "custom" | "stat" | "obs";

const COLOR_TONE: Record<
  TagColor,
  { bg: string; bd: string; fg: string; section: string; chipDot: string; chipBg: string }
> = {
  red: {
    bg: "#FDECEA",
    bd: "#F5AEAD",
    fg: "#7A1010",
    section: "注意事項",
    chipDot: "#C8001A",
    chipBg: "#FDECEA",
  },
  yellow: {
    bg: "#FDF3E3",
    bd: "#F0C97E",
    fg: "#6B3A00",
    section: "偏好特質",
    chipDot: "#F0C97E",
    chipBg: "#FDF3E3",
  },
  green: {
    bg: "#E5F5EE",
    bd: "#80CCA8",
    fg: "#084D30",
    section: "服務備忘",
    chipDot: "#5DCAA5",
    chipBg: "#E1F5EE",
  },
  blue: {
    bg: "#EAF4FB",
    bd: "#85B7EB",
    fg: "#0C3E70",
    section: "談判協商",
    chipDot: "#185FA5",
    chipBg: "#EAF4FB",
  },
};

type PageData = {
  officialTags: OfficialTag[];
  myTags: PersonalTag[];
  brandAggregated: BrandAggregatedTag[];
  currentUserId: string;
  brandId: string;
};

export function SalesCustomerTagsBoard({ data }: { data: PageData }) {
  useSetPageHeader({
    title: "客戶標籤管理",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "客戶管理", href: "/sales/customers" },
      { label: "客戶標籤" },
    ],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // ── tab / filter state ──
  const [tab, setTab] = useState<TabKey>("lib");
  const [colorFilter, setColorFilter] = useState<TagColor | "all">("all");
  const [sourceFilter, setSourceFilter] = useState<"all" | "official" | "mine">("all");
  const [search, setSearch] = useState("");

  // ── modal state ──
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState<TagColor>("red");
  const [addNote, setAddNote] = useState("");

  const [editTarget, setEditTarget] = useState<PersonalTag | null>(null);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState<TagColor>("red");
  const [editNote, setEditNote] = useState("");

  // ── inline add state（每色一個 input） ──
  const [inlineInput, setInlineInput] = useState<Record<TagColor, string>>({
    red: "",
    yellow: "",
    green: "",
    blue: "",
  });

  // ── 衍生資料 ──
  const officialByColor = useMemo(() => {
    const map: Record<TagColor, OfficialTag[]> = { red: [], yellow: [], green: [], blue: [] };
    for (const t of data.officialTags) {
      if (TAG_COLORS.includes(t.color)) map[t.color].push(t);
    }
    return map;
  }, [data.officialTags]);

  const myByColor = useMemo(() => {
    const map: Record<TagColor, PersonalTag[]> = { red: [], yellow: [], green: [], blue: [] };
    for (const t of data.myTags) {
      if (TAG_COLORS.includes(t.color)) map[t.color].push(t);
    }
    return map;
  }, [data.myTags]);

  const totalOfficial = data.officialTags.length;
  const totalMine = data.myTags.length;
  const totalAll = totalOfficial + totalMine;

  // ── helpers ──
  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function openAddModal(color: TagColor = "red") {
    setAddColor(color);
    setAddName("");
    setAddNote("");
    setAddOpen(true);
  }
  function closeAddModal() {
    setAddOpen(false);
    setAddName("");
    setAddNote("");
  }

  function openEditModal(t: PersonalTag) {
    setEditTarget(t);
    setEditName(t.name);
    setEditColor(t.color);
    setEditNote(t.note ?? "");
  }
  function closeEditModal() {
    setEditTarget(null);
    setEditName("");
    setEditNote("");
  }

  function handleCreate(opts?: { name?: string; color?: TagColor; note?: string }) {
    const name = (opts?.name ?? addName).trim();
    const color = opts?.color ?? addColor;
    const note = (opts?.note ?? addNote).trim() || null;
    if (!name) {
      showBanner({ ok: false, msg: "請輸入標籤名稱" });
      return;
    }
    if (totalMine >= PERSONAL_TAG_LIMIT) {
      showBanner({ ok: false, msg: `已達自訂標籤上限 ${PERSONAL_TAG_LIMIT} 個，請先刪除不用的標籤` });
      return;
    }
    startTransition(async () => {
      const res = await createPersonalTag({ name, color, note });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增「${name}」` });
        closeAddModal();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleInlineAdd(color: TagColor) {
    const name = inlineInput[color].trim();
    if (!name) return;
    if (totalMine >= PERSONAL_TAG_LIMIT) {
      showBanner({ ok: false, msg: `已達自訂標籤上限 ${PERSONAL_TAG_LIMIT} 個，請先刪除不用的標籤` });
      return;
    }
    startTransition(async () => {
      const res = await createPersonalTag({ name, color, note: null });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增「${name}」` });
        setInlineInput((s) => ({ ...s, [color]: "" }));
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleSaveEdit() {
    if (!editTarget) return;
    const name = editName.trim();
    if (!name) {
      showBanner({ ok: false, msg: "請輸入標籤名稱" });
      return;
    }
    const note = editNote.trim() || null;
    if (
      name === editTarget.name &&
      editColor === editTarget.color &&
      note === (editTarget.note ?? null)
    ) {
      closeEditModal();
      return;
    }
    const id = editTarget.id;
    startTransition(async () => {
      const res = await updatePersonalTag(id, { name, color: editColor, note });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已更新「${name}」` });
        closeEditModal();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleDelete(t: PersonalTag) {
    const ok = window.confirm(
      `確定刪除「${t.name}」？\n已貼在客戶身上的標籤不受影響。`,
    );
    if (!ok) return;
    startTransition(async () => {
      const res = await deletePersonalTag(t.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `已刪除「${t.name}」` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ── 過濾邏輯（標籤庫總覽 tab） ──
  const q = search.trim().toLowerCase();
  function filterOfficial(color: TagColor): OfficialTag[] {
    if (sourceFilter === "mine") return [];
    return officialByColor[color].filter((t) =>
      !q ? true : t.label.toLowerCase().includes(q),
    );
  }
  function filterMine(color: TagColor): PersonalTag[] {
    if (sourceFilter === "official") return [];
    return myByColor[color].filter((t) => (!q ? true : t.name.toLowerCase().includes(q)));
  }

  const visibleColors: TagColor[] =
    colorFilter === "all" ? [...TAG_COLORS] : [colorFilter];

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
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">客戶標籤管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_SET2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          官方 {totalOfficial} 個 · 我的自訂 {totalMine} 個 · 合計 {totalAll} 個
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openAddModal("red")}
            disabled={isPending}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增自訂標籤
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="flex border-b border-[#EEECE6] overflow-x-auto">
          {(
            [
              { key: "lib", label: "🏷️ 標籤庫總覽" },
              { key: "custom", label: "✏️ 我的自訂標籤" },
              { key: "stat", label: "📊 使用統計" },
              { key: "obs", label: "👁️ 主管觀察視角" },
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

        {/* Tab body */}
        <div className="p-4 space-y-3">
          {tab === "lib" && (
            <LibTab
              visibleColors={visibleColors}
              colorFilter={colorFilter}
              setColorFilter={setColorFilter}
              sourceFilter={sourceFilter}
              setSourceFilter={setSourceFilter}
              search={search}
              setSearch={setSearch}
              filterOfficial={filterOfficial}
              filterMine={filterMine}
              myTags={data.myTags}
              officialByColor={officialByColor}
              myByColor={myByColor}
              totalOfficial={totalOfficial}
              totalMine={totalMine}
              inlineInput={inlineInput}
              setInlineInput={setInlineInput}
              onInlineAdd={handleInlineAdd}
              onOpenAdd={openAddModal}
              onOpenEdit={openEditModal}
              onDelete={handleDelete}
              isPending={isPending}
            />
          )}
          {tab === "custom" && (
            <CustomTab
              myTags={data.myTags}
              onOpenAdd={() => openAddModal("red")}
              onOpenEdit={openEditModal}
              onDelete={handleDelete}
              isPending={isPending}
            />
          )}
          {tab === "stat" && (
            <StatTab officialTags={data.officialTags} myTags={data.myTags} />
          )}
          {tab === "obs" && (
            <ObsTab
              brandAggregated={data.brandAggregated}
              currentUserId={data.currentUserId}
            />
          )}
        </div>
      </div>

      {/* ── 新增 Modal ── */}
      {addOpen && (
        <Modal
          title="✏️ 新增自訂標籤"
          onClose={closeAddModal}
          footer={
            <>
              <button
                type="button"
                onClick={closeAddModal}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => handleCreate()}
                disabled={isPending || !addName.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "✅ 立即建立"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="標籤名稱" required>
              <input
                type="text"
                maxLength={20}
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                disabled={isPending}
                placeholder="例：首次騎重機"
                className="w-full h-[34px] border border-[#D5D3CB] rounded px-3 text-[12.5px] focus:border-[#185FA5] outline-none disabled:opacity-60"
              />
              <p className="text-[11px] text-[#9A9890] mt-1">
                最多 20 字 · 每位 RS 最多 {PERSONAL_TAG_LIMIT} 個自訂標籤
              </p>
            </Field>
            <Field label="標籤顏色分類" required>
              <select
                value={addColor}
                onChange={(e) => setAddColor(e.target.value as TagColor)}
                disabled={isPending}
                className="w-full h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white disabled:opacity-60"
              >
                {TAG_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {TAG_COLOR_EMOJI[c]} {TAG_COLOR_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="說明備註">
              <textarea
                value={addNote}
                onChange={(e) => setAddNote(e.target.value)}
                disabled={isPending}
                placeholder="說明這個標籤的使用情境，方便日後識別..."
                rows={3}
                className="w-full border border-[#D5D3CB] rounded px-3 py-2 text-[12.5px] focus:border-[#185FA5] outline-none resize-y disabled:opacity-60"
              />
            </Field>
            <div className="bg-[#E1F5EE] border border-[#5DCAA5] rounded-md px-3 py-2 text-[11.5px] text-[#084D30] leading-relaxed">
              ✅ 建立後立即可用，無需審核。主管可在觀察視角看到使用情況。
            </div>
          </div>
        </Modal>
      )}

      {/* ── 編輯 Modal ── */}
      {editTarget && (
        <Modal
          title="✏️ 編輯自訂標籤"
          onClose={closeEditModal}
          footer={
            <>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isPending || !editName.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "💾 儲存修改"}
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="標籤名稱">
              <input
                type="text"
                maxLength={20}
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                disabled={isPending}
                className="w-full h-[34px] border border-[#D5D3CB] rounded px-3 text-[12.5px] focus:border-[#185FA5] outline-none disabled:opacity-60"
              />
            </Field>
            <Field label="標籤顏色分類">
              <select
                value={editColor}
                onChange={(e) => setEditColor(e.target.value as TagColor)}
                disabled={isPending}
                className="w-full h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white disabled:opacity-60"
              >
                {TAG_COLORS.map((c) => (
                  <option key={c} value={c}>
                    {TAG_COLOR_EMOJI[c]} {TAG_COLOR_LABEL[c]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="說明備註">
              <textarea
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                disabled={isPending}
                rows={3}
                className="w-full border border-[#D5D3CB] rounded px-3 py-2 text-[12.5px] focus:border-[#185FA5] outline-none resize-y disabled:opacity-60"
              />
            </Field>
          </div>
        </Modal>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Lib Tab — 標籤庫總覽
// ──────────────────────────────────────────────────────────────────────────
function LibTab(props: {
  visibleColors: TagColor[];
  colorFilter: TagColor | "all";
  setColorFilter: (c: TagColor | "all") => void;
  sourceFilter: "all" | "official" | "mine";
  setSourceFilter: (s: "all" | "official" | "mine") => void;
  search: string;
  setSearch: (v: string) => void;
  filterOfficial: (c: TagColor) => OfficialTag[];
  filterMine: (c: TagColor) => PersonalTag[];
  myTags: PersonalTag[];
  officialByColor: Record<TagColor, OfficialTag[]>;
  myByColor: Record<TagColor, PersonalTag[]>;
  totalOfficial: number;
  totalMine: number;
  inlineInput: Record<TagColor, string>;
  setInlineInput: (
    f: (s: Record<TagColor, string>) => Record<TagColor, string>,
  ) => void;
  onInlineAdd: (color: TagColor) => void;
  onOpenAdd: (color: TagColor) => void;
  onOpenEdit: (t: PersonalTag) => void;
  onDelete: (t: PersonalTag) => void;
  isPending: boolean;
}) {
  const {
    visibleColors,
    colorFilter,
    setColorFilter,
    sourceFilter,
    setSourceFilter,
    search,
    setSearch,
    filterOfficial,
    filterMine,
    officialByColor,
    myByColor,
    totalOfficial,
    totalMine,
    inlineInput,
    setInlineInput,
    onInlineAdd,
    onOpenAdd,
    onOpenEdit,
    onDelete,
    isPending,
  } = props;

  return (
    <>
      {/* 說明 banner */}
      <div className="bg-[#EAF4FB] border border-[#B7DAF1] text-[#0C3E70] rounded-md px-3.5 py-2.5 text-[12px] leading-[1.7]">
        <b>標籤庫說明：</b>官方標籤由主管統一設定，RS 只能使用、不能修改或刪除（🔒）。
        自訂標籤由 RS 個人自由新增，每位 RS 最多 <b>{PERSONAL_TAG_LIMIT} 個自訂標籤</b>。
        主管可在「主管觀察視角」Tab 瀏覽全店自訂標籤的使用趨勢。
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex flex-wrap gap-2 items-end">
          <FilterChipGroup
            label="顏色"
            value={colorFilter}
            options={[
              { value: "all", label: `全部（${totalOfficial + totalMine}）` },
              ...TAG_COLORS.map((c) => ({
                value: c,
                label: `${TAG_COLOR_EMOJI[c]} ${TAG_COLOR_LABEL[c]}（${officialByColor[c].length + myByColor[c].length}）`,
              })),
            ]}
            onChange={(v) => setColorFilter(v as TagColor | "all")}
          />
          <div className="w-px h-[28px] bg-[#EEECE6] mx-1" />
          <FilterChipGroup
            label="來源"
            value={sourceFilter}
            options={[
              { value: "all", label: `全部` },
              { value: "official", label: `🔒 官方（${totalOfficial}）` },
              { value: "mine", label: `✏️ 我的（${totalMine}）` },
            ]}
            onChange={(v) => setSourceFilter(v as "all" | "official" | "mine")}
          />
          <div className="ml-auto flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋標籤名稱..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none min-w-[200px]"
            />
          </div>
        </div>
      </section>

      {/* 四色分區卡片 */}
      <div className={`space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        {visibleColors.map((color) => {
          const tone = COLOR_TONE[color];
          const offList = filterOfficial(color);
          const myList = filterMine(color);
          if (offList.length === 0 && myList.length === 0 && search.trim()) {
            return null;
          }
          return (
            <section
              key={color}
              className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            >
              <header className="px-4 py-2.5 border-b border-[#EEECE6] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-block w-3 h-3 rounded-full"
                    style={{ background: tone.chipDot }}
                  />
                  <div>
                    <div className="text-[13px] font-semibold text-[#2C2C2A]">
                      {TAG_COLOR_EMOJI[color]} {tone.section}
                    </div>
                    <div className="text-[11px] text-[#9A9890]">
                      官方 {offList.length} 個{myList.length > 0 ? ` · 自訂 ${myList.length} 個` : ""}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-[#9A9890]">
                    {offList.length + myList.length} 個標籤
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenAdd(color)}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  >
                    ＋ 新增自訂
                  </button>
                </div>
              </header>
              <div className="px-4 py-3 space-y-3">
                {offList.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold tracking-wider uppercase text-[#9A9890] mb-2">
                      官方標籤
                      <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] bg-[#E8EDF2] text-[#3A5A6C] border border-[#8FAABB]">
                        🔒 主管管理
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {offList.map((t) => (
                        <span
                          key={t.id}
                          title={t.description ?? ""}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[12px] font-medium"
                          style={{
                            background: tone.bg,
                            borderColor: tone.bd,
                            color: tone.fg,
                          }}
                        >
                          <span>
                            {TAG_COLOR_EMOJI[color]} {t.label}
                          </span>
                          <span className="text-[10px] opacity-55">🔒</span>
                          <span className="text-[10px] bg-black/10 px-1.5 py-0.5 rounded-full">
                            {t.usage}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {myList.length > 0 && (
                  <div>
                    <div className="text-[10px] font-bold tracking-wider uppercase text-[#534AB7] mb-2">
                      我的自訂標籤
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {myList.map((t) => (
                        <span
                          key={t.id}
                          title={t.note ?? ""}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border-[1.5px] border-dashed text-[12px] font-medium"
                          style={{
                            background: tone.bg,
                            borderColor: tone.bd,
                            color: tone.fg,
                          }}
                        >
                          <span>
                            {TAG_COLOR_EMOJI[color]} {t.name}
                          </span>
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
                            onClick={() => onDelete(t)}
                            disabled={isPending}
                            title="刪除"
                            className="text-[13px] font-bold opacity-40 hover:opacity-100 hover:text-[#CC0000] leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* 快速新增輸入列 */}
                {sourceFilter !== "official" && (
                  <div className="flex items-center gap-2 pt-2.5 border-t border-dashed border-[#EEECE6]">
                    <input
                      type="text"
                      maxLength={20}
                      value={inlineInput[color]}
                      onChange={(e) =>
                        setInlineInput((s) => ({ ...s, [color]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") onInlineAdd(color);
                      }}
                      placeholder="輸入新標籤名稱後按 Enter..."
                      disabled={isPending || totalMine >= PERSONAL_TAG_LIMIT}
                      className="flex-1 h-[30px] border-[1.5px] border-dashed border-[#D5D3CB] rounded-full px-3 text-[12px] bg-[#FAFAF8] focus:border-[#85B7EB] focus:bg-white outline-none disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => onInlineAdd(color)}
                      disabled={
                        isPending || !inlineInput[color].trim() || totalMine >= PERSONAL_TAG_LIMIT
                      }
                      className="h-[30px] px-3.5 rounded-full text-[12px] font-semibold border-[1.5px] disabled:opacity-50"
                      style={{
                        background: tone.bg,
                        borderColor: tone.bd,
                        color: tone.fg,
                      }}
                    >
                      ＋ 新增
                    </button>
                  </div>
                )}
              </div>
            </section>
          );
        })}

        {visibleColors.length === 0 && (
          <div className="py-10 text-center text-[12.5px] text-[#9A9890]">
            沒有符合篩選條件的標籤
          </div>
        )}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Custom Tab — 我的自訂標籤
// ──────────────────────────────────────────────────────────────────────────
function CustomTab(props: {
  myTags: PersonalTag[];
  onOpenAdd: () => void;
  onOpenEdit: (t: PersonalTag) => void;
  onDelete: (t: PersonalTag) => void;
  isPending: boolean;
}) {
  const { myTags, onOpenAdd, onOpenEdit, onDelete, isPending } = props;
  const used = myTags.length;
  const limitCls =
    used >= PERSONAL_TAG_LIMIT
      ? "bg-[#FDECEA] border-[#F5AEAD] text-[#C8001A]"
      : used >= PERSONAL_TAG_LIMIT - 1
        ? "bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B]"
        : "bg-[#F8F7F4] border-[#EEECE6] text-[#5A5955]";

  return (
    <>
      <div className="bg-[#E1F5EE] border border-[#5DCAA5] text-[#085041] rounded-md px-3.5 py-2.5 text-[12px] leading-[1.7]">
        <b>自訂標籤說明：</b>您可以自由新增個人自訂標籤，無需審核，立即可用。
        每位 RS 最多 <b>{PERSONAL_TAG_LIMIT} 個自訂標籤</b>（官方標籤不限）。
        主管可在觀察視角看到全店自訂標籤的使用情況，但不干預您的使用。
      </div>

      <div className={`flex items-center gap-2 border rounded-md px-3 py-2 text-[12px] ${limitCls}`}>
        <div className="flex gap-1">
          {Array.from({ length: PERSONAL_TAG_LIMIT }).map((_, i) => (
            <span
              key={i}
              className="w-2.5 h-2.5 rounded-full"
              style={{ background: i < used ? "#1A3A5C" : "#EEECE6" }}
            />
          ))}
        </div>
        <span>
          已使用：<b>{used} / {PERSONAL_TAG_LIMIT}</b> 個
        </span>
        {used >= PERSONAL_TAG_LIMIT && (
          <span className="ml-auto font-semibold">已達上限</span>
        )}
      </div>

      {myTags.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-[13px] text-[#9A9890] mb-3">尚未建立任何自訂標籤</p>
          <button
            type="button"
            onClick={onOpenAdd}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增第一個自訂標籤
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {myTags.map((t) => {
            const tone = COLOR_TONE[t.color];
            return (
              <div
                key={t.id}
                className="bg-white border border-[#EEECE6] rounded-md px-3 py-2.5 flex items-center gap-3"
              >
                <span
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full border-[1.5px] border-dashed text-[12px] font-medium"
                  style={{ background: tone.bg, borderColor: tone.bd, color: tone.fg }}
                >
                  {TAG_COLOR_EMOJI[t.color]} {t.name}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-[11.5px] text-[#5A5955]">
                    {TAG_COLOR_EMOJI[t.color]} {TAG_COLOR_LABEL[t.color]}
                  </div>
                  <div className="text-[11px] text-[#9A9890] truncate">
                    {t.note || "無說明"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10.5px] text-[#9A9890]">使用次數</div>
                  <div className="text-[16px] font-bold font-mono text-[#1A3A5C]">
                    {t.use_count}
                  </div>
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10.5px] bg-[#EEEDFE] text-[#534AB7] font-semibold">
                  個人自訂
                </span>
                <button
                  type="button"
                  onClick={() => onOpenEdit(t)}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
                >
                  編輯
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(t)}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
                >
                  刪除
                </button>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Stat Tab — 使用統計（個人）
// ──────────────────────────────────────────────────────────────────────────
function StatTab(props: { officialTags: OfficialTag[]; myTags: PersonalTag[] }) {
  const { officialTags, myTags } = props;
  const rows = [
    ...officialTags.map((t) => ({
      kind: "official" as const,
      name: t.label,
      color: t.color,
      usage: t.usage,
    })),
    ...myTags.map((t) => ({
      kind: "personal" as const,
      name: t.name,
      color: t.color,
      usage: t.use_count,
    })),
  ]
    .sort((a, b) => b.usage - a.usage)
    .slice(0, 15);

  const max = rows[0]?.usage || 1;

  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-[#EAF4FB] flex items-center justify-center text-[14px]">
          📊
        </div>
        <div>
          <div className="text-[13px] font-semibold text-[#2C2C2A]">標籤使用統計</div>
          <div className="text-[11px] text-[#9A9890]">本月 · 我的客戶 · 貼標次數排行（Top 15）</div>
        </div>
      </header>
      {rows.length === 0 ? (
        <div className="py-10 text-center text-[12.5px] text-[#9A9890]">
          目前尚未有使用紀錄
        </div>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-[#EEECE6]">
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-[#9A9890] font-semibold">
                排名
              </th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-[#9A9890] font-semibold">
                標籤
              </th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-[#9A9890] font-semibold">
                類別
              </th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-[#9A9890] font-semibold">
                來源
              </th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-[#9A9890] font-semibold">
                使用次數
              </th>
              <th className="text-left px-3 py-2 text-[11px] uppercase tracking-wider text-[#9A9890] font-semibold">
                佔比
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const tone = COLOR_TONE[r.color];
              const pct = Math.round((r.usage / max) * 100);
              return (
                <tr key={`${r.kind}-${i}-${r.name}`} className="border-b border-[#F4F3F0]">
                  <td className="px-3 py-2.5 font-mono font-bold text-[12.5px]"
                      style={{ color: i < 3 ? "#854F0B" : "#9A9890" }}>
                    {i + 1}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium"
                      style={{ background: tone.chipBg, color: tone.fg }}
                    >
                      {TAG_COLOR_EMOJI[r.color]} {r.name}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#7A7A78]">
                    {TAG_COLOR_LABEL[r.color]}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] ${
                        r.kind === "official"
                          ? "bg-[#E8EDF2] text-[#3A5A6C] border border-[#8FAABB]"
                          : "bg-[#EEEDFE] text-[#534AB7]"
                      }`}
                    >
                      {r.kind === "official" ? "🔒 官方" : "✏️ 個人"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-[100px] h-[7px] rounded-full bg-[#EEECE6] overflow-hidden">
                        <span
                          className="block h-full rounded-full"
                          style={{ width: `${pct}%`, background: tone.chipDot }}
                        />
                      </span>
                      <span className="font-mono font-bold text-[12.5px] text-[#1A3A5C]">
                        {r.usage}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[#9A9890]">{pct}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Obs Tab — 主管觀察視角（全 brand 聚合）
// ──────────────────────────────────────────────────────────────────────────
function ObsTab(props: {
  brandAggregated: BrandAggregatedTag[];
  currentUserId: string;
}) {
  const { brandAggregated } = props;

  return (
    <>
      <div className="bg-[#EAF4FB] border border-[#B7DAF1] text-[#0C3E70] rounded-md px-3.5 py-2.5 text-[12px] leading-[1.7]">
        <b>主管觀察視角：</b>此頁顯示全店 RS 目前使用的自訂標籤及使用頻率，供主管作為向下學習的參考。
        若某個自訂標籤被多位 RS 高頻使用，代表有潛在需求。
        <b>升為官方標籤的操作請至「售後 → 主管工作檯 → 客戶標籤」執行</b>，此頁僅作觀察用途。
      </div>

      {brandAggregated.length === 0 ? (
        <div className="py-12 text-center text-[12.5px] text-[#9A9890]">
          目前全店尚無自訂標籤使用記錄
        </div>
      ) : (
        <div className="space-y-2">
          {brandAggregated.map((t) => {
            const tone = COLOR_TONE[t.color];
            const trendLabel =
              t.trend === "hot" ? "🔴 高頻使用" : t.trend === "rising" ? "🟡 上升中" : "⬜ 一般";
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
                      💡 高頻使用
                      <div className="text-[10px] text-[#9A9890] mt-0.5">
                        升為官方請至售後主管工作檯 →
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
// Helpers — Modal / Field / FilterChipGroup
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

function FilterChipGroup<T extends string>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{props.label}</label>
      <div className="flex border border-[#D5D3CB] rounded overflow-hidden">
        {props.options.map((o) => {
          const active = o.value === props.value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => props.onChange(o.value)}
              className={`h-[28px] px-2.5 text-[11.5px] border-r border-[#D5D3CB] last:border-r-0 whitespace-nowrap ${
                active
                  ? "bg-[#1A3A5C] text-white font-medium"
                  : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
