"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { KpiCard } from "@/components/visualization";
import { SparkLine } from "@/components/charts/SparkLine";
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
  TAG_KINDS,
  TAG_KIND_LABEL,
  TAG_KIND_DESCRIPTION,
  type TagColor,
  type TagKind,
  type TagPageKpi,
} from "@/domain/customer-tags.constants";

type Banner = { ok: boolean; msg: string } | null;

const COLOR_TONE: Record<TagColor, { bg: string; bd: string; fg: string; sectionTitle: string }> = {
  red: { bg: "#FDECEA", bd: "#F5AEAD", fg: "#7A1010", sectionTitle: `${TAG_COLOR_EMOJI.red} 注意事項（高風險）` },
  yellow: { bg: "#FDF3E3", bd: "#F0C97E", fg: "#6B3A00", sectionTitle: `${TAG_COLOR_EMOJI.yellow} 偏好特質` },
  green: { bg: "#E5F5EE", bd: "#80CCA8", fg: "#084D30", sectionTitle: `${TAG_COLOR_EMOJI.green} 服務備忘` },
  blue: { bg: "#EAF4FB", bd: "#85B7EB", fg: "#0C3E70", sectionTitle: `${TAG_COLOR_EMOJI.blue} 談判協商` },
};

/** 把 TagColor 對應到 KpiCard / SparkLine 的 ChartTone（注意只認 7 個 tone：blue/teal/amber/red/purple/green/gray） */
const COLOR_TO_TONE: Record<TagColor, "red" | "amber" | "green" | "blue"> = {
  red: "red",
  yellow: "amber",
  green: "green",
  blue: "blue",
};

export function CustomerTagsBoard({
  tags,
  kpi,
  canEdit,
}: {
  tags: OfficialTag[];
  kpi: TagPageKpi;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [activeKind, setActiveKind] = useState<TagKind>("official");

  // 新增 form state
  const [newColor, setNewColor] = useState<TagColor>("red");
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newKind, setNewKind] = useState<TagKind>("official");
  const [newRule, setNewRule] = useState("");

  // 編輯 state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editColor, setEditColor] = useState<TagColor>("red");

  const filteredByKind = useMemo(
    () => tags.filter((t) => t.tag_kind === activeKind),
    [tags, activeKind],
  );

  const grouped = useMemo(() => {
    const map: Record<TagColor, OfficialTag[]> = { red: [], yellow: [], green: [], blue: [] };
    for (const t of filteredByKind) {
      if (TAG_COLORS.includes(t.color)) map[t.color].push(t);
    }
    return map;
  }, [filteredByKind]);

  // 看板 KPI 衍生
  const topUsedTag = useMemo(() => {
    return tags.reduce<OfficialTag | null>(
      (acc, t) => (t.is_active && (!acc || t.usage_count > acc.usage_count) ? t : acc),
      null,
    );
  }, [tags]);

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
      const res = await createOfficialTag({
        label,
        color: newColor,
        description: newDescription || null,
        tag_kind: newKind,
        rule: newKind === "system_auto" ? newRule || null : null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增「${label}」` });
        setNewLabel("");
        setNewDescription("");
        setNewRule("");
        setActiveKind(newKind);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleDelete(tag: OfficialTag) {
    if (!canEdit) return;
    const msg = tag.tag_kind === "system_auto"
      ? `確認刪除系統自動標籤「${tag.label}」？\n\n刪除後該規則停止自動貼標。已貼上此標籤的客戶不受影響。`
      : `確認刪除官方標籤「${tag.label}」？\n\n已使用此標籤的客戶不受影響，但未來 SA 無法再選用。`;
    const ok = window.confirm(msg);
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
          M03-11 · 主管工作檯
        </span>
        <span className="text-[12px] text-[#9A9890]">
          管理 SA 在預檢／接待時可選用的標籤字典 — 共 {kpi.active} 個啟用 / {kpi.total} 個
        </span>
      </header>

      {/* KPI 列 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
        <KpiCard
          label="標籤總數"
          value={kpi.total}
          tone="blue"
          layout="with-chart"
          icon={<span className="text-[16px]">🏷️</span>}
          sparkline={<SparkLine data={kpi.spark7d} tone="blue" height={28} />}
        />
        <KpiCard
          label="啟用中"
          value={kpi.active}
          tone="teal"
          layout="horizontal"
          icon={<span className="text-[16px]">✓</span>}
        />
        <KpiCard
          label="官方標籤"
          value={kpi.officialActive}
          tone="purple"
          layout="horizontal"
          icon={<span className="text-[16px]">🔒</span>}
        />
        <KpiCard
          label="系統自動"
          value={kpi.systemAutoActive}
          tone="amber"
          layout="horizontal"
          icon={<span className="text-[16px]">⚙️</span>}
        />
        <KpiCard
          label="累計套用客戶"
          value={kpi.totalUsage}
          tone="green"
          layout="horizontal"
          icon={<span className="text-[16px]">👥</span>}
        />
      </div>

      {/* 4 色分區 mini KPI 列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {TAG_COLORS.map((color) => (
          <KpiCard
            key={color}
            label={`${TAG_COLOR_EMOJI[color]} ${TAG_COLOR_LABEL[color]}`}
            value={kpi.byColor[color] ?? 0}
            tone={COLOR_TO_TONE[color]}
            layout="mini"
          />
        ))}
      </div>

      {/* 說明 alert */}
      <div className="bg-[#EAF4FB] border border-[#B7DAF1] text-[#0D3166] rounded-lg px-4 py-2.5 text-[12.5px] leading-[1.7]">
        <strong>🔒 此頁面僅限「售後主管」操作。</strong>
        在此設定的官方標籤，SA 在預檢／接待時只能選用，不可修改或刪除。
        🔴 類標籤會在每次預檢顯示風險提醒，請謹慎設定。
        系統自動標籤由規則 derive，主管設定規則但不可手動貼。
      </div>

      {/* Tabs：official / system_auto */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {TAG_KINDS.map((kind) => {
            const isActive = activeKind === kind;
            const count = tags.filter((t) => t.tag_kind === kind && t.is_active).length;
            return (
              <button
                key={kind}
                type="button"
                onClick={() => setActiveKind(kind)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-r-[#EEECE6] ${
                  isActive
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                {TAG_KIND_LABEL[kind]}
                <span className={`ml-1.5 text-[11px] ${isActive ? "text-[#185FA5]" : "text-[#9A9890]"}`}>
                  ({count})
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4">
        <div className="text-[11.5px] text-[#9A9890] mb-3">{TAG_KIND_DESCRIPTION[activeKind]}</div>

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
                      <div className="text-[12px] text-[#9A9890] py-2">
                        此分類尚未設定任何{TAG_KIND_LABEL[activeKind]}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {list.map((tag) =>
                          editingId === tag.id ? (
                            <div
                              key={tag.id}
                              className="flex items-center gap-1.5 px-2.5 py-2 rounded-md border"
                              style={{ backgroundColor: tone.bg, borderColor: tone.bd }}
                            >
                              <select
                                value={editColor}
                                onChange={(e) => setEditColor(e.target.value as TagColor)}
                                className="h-[26px] text-[11px] border border-[#D5D3CB] rounded px-1 bg-white"
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
                                className="h-[26px] text-[11.5px] border border-[#D5D3CB] rounded px-2 flex-1 bg-white"
                                disabled={isPending}
                              />
                              <button
                                type="button"
                                onClick={() => commitEdit(tag)}
                                disabled={isPending}
                                className="h-[26px] px-2 rounded text-[11px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
                              >
                                {isPending ? "⋯" : "✓"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={isPending}
                                className="h-[26px] px-2 rounded text-[11px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <TagCardItem
                              key={tag.id}
                              tag={tag}
                              tone={tone}
                              canEdit={canEdit}
                              isPending={isPending}
                              onEdit={() => startEdit(tag)}
                              onToggle={() => handleToggleActive(tag)}
                              onDelete={() => handleDelete(tag)}
                            />
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* 右：新增 form + 排行榜 + 使用規則說明 */}
          <div className="space-y-3">
            <section
              className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
                isPending ? "pointer-events-none opacity-60" : ""
              }`}
            >
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <h2 className="text-[13px] font-semibold text-[#2C2C2A]">＋ 新增{TAG_KIND_LABEL[newKind]}</h2>
              </header>
              <div className="px-4 py-3 space-y-2.5">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">標籤類型</label>
                  <select
                    value={newKind}
                    onChange={(e) => setNewKind(e.target.value as TagKind)}
                    disabled={!canEdit || isPending}
                    className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
                  >
                    {TAG_KINDS.map((k) => (
                      <option key={k} value={k}>
                        {TAG_KIND_LABEL[k]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">色彩分類</label>
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
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">描述（選填）</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    disabled={!canEdit || isPending}
                    placeholder="顯示在客戶詳情頁、SA 滑鼠 hover 顯示"
                    className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60"
                  />
                </div>
                {newKind === "system_auto" && (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-[#9A9890] font-medium">
                      系統規則（自動貼標條件）
                    </label>
                    <input
                      type="text"
                      maxLength={200}
                      value={newRule}
                      onChange={(e) => setNewRule(e.target.value)}
                      disabled={!canEdit || isPending}
                      placeholder="例：visit_count >= 3 OR vehicle_count >= 2"
                      className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:opacity-60 font-mono"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={!canEdit || isPending || !newLabel.trim()}
                  className="h-[30px] w-full px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                >
                  {isPending ? "新增中⋯" : `＋ 新增${TAG_KIND_LABEL[newKind]}`}
                </button>
                <div className="text-[11px] text-[#9A9890] pt-2 border-t border-[#EEECE6]">
                  {newKind === "official"
                    ? "新增後，SA 在預檢單／接待單的「客戶標籤」可從此清單選用。"
                    : "新增後，系統會依規則自動貼標。規則語法目前為自由文字，落地引擎時改 DSL。"}
                </div>
              </div>
            </section>

            {/* 熱門標籤排行 top 5 */}
            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <h2 className="text-[13px] font-semibold text-[#2C2C2A]">🔥 熱門標籤 Top 5</h2>
              </header>
              <div className="px-4 py-3 space-y-1.5">
                {tags
                  .filter((t) => t.is_active && t.usage_count > 0)
                  .sort((a, b) => b.usage_count - a.usage_count)
                  .slice(0, 5)
                  .map((tag, idx) => {
                    const tone = COLOR_TONE[tag.color];
                    return (
                      <div
                        key={tag.id}
                        className="flex items-center gap-2 text-[12px] py-1 border-b border-dashed border-[#EEECE6] last:border-b-0"
                      >
                        <span className="text-[11px] text-[#9A9890] w-4">{idx + 1}</span>
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px]"
                          style={{ backgroundColor: tone.bg, color: tone.fg }}
                        >
                          {TAG_COLOR_EMOJI[tag.color]} {tag.label}
                        </span>
                        <span className="ml-auto text-[11.5px] text-[#5A5955] font-semibold">
                          {tag.usage_count}
                        </span>
                      </div>
                    );
                  })}
                {tags.filter((t) => t.is_active && t.usage_count > 0).length === 0 && (
                  <div className="text-[12px] text-[#9A9890] py-2">尚無使用紀錄</div>
                )}
                {topUsedTag && (
                  <div className="pt-2 border-t border-[#EEECE6] text-[11px] text-[#9A9890] leading-[1.5]">
                    👑 本期之冠：<b className="text-[#2C2C2A]">{topUsedTag.label}</b>
                  </div>
                )}
              </div>
            </section>

            <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <h2 className="text-[13px] font-semibold text-[#2C2C2A]">📋 使用規則說明</h2>
              </header>
              <div className="px-4 py-3 space-y-2 text-[12.5px] leading-[1.8] text-[#5A5955]">
                <div>🔒 <b>官方標籤</b>（主管設定）：SA 可選用，<b>不可移除</b></div>
                <div>⚙️ <b>系統自動標籤</b>：規則 derive，自動貼標</div>
                <div>✏️ <b>SA 自訂標籤</b>（不在本頁）：本人可移除，他人不可移除</div>
                <div>🌐 <b>標籤來源</b>：銷售接待、售後回廠均可添加，跨模組共用</div>
                <div>⚠️ <b>安全事項</b>：🔴 類標籤請謹慎設定，會在每次預檢顯示提醒</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// 子元件：單張標籤卡（含 sparkline + 套用客戶數 + CRUD action）
// ──────────────────────────────────────────────────────────────────────────

function TagCardItem({
  tag,
  tone,
  canEdit,
  isPending,
  onEdit,
  onToggle,
  onDelete,
}: {
  tag: OfficialTag;
  tone: { bg: string; bd: string; fg: string };
  canEdit: boolean;
  isPending: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const sparkTone = COLOR_TO_TONE[tag.color];
  const isSystem = tag.tag_kind === "system_auto";
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2 rounded-md border ${
        tag.is_active ? "" : "opacity-50"
      }`}
      style={{ backgroundColor: tone.bg, borderColor: tone.bd }}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={`text-[12.5px] font-medium ${tag.is_active ? "" : "line-through"}`}
            style={{ color: tone.fg }}
          >
            {TAG_COLOR_EMOJI[tag.color]} {tag.label}
          </span>
          {isSystem && (
            <span className="text-[10px] px-1 py-0.5 rounded bg-white/70 text-[#854F0B] border border-[#F0C97E]">
              ⚙️ 自動
            </span>
          )}
          {!tag.is_active && (
            <span className="text-[10px] bg-white/70 px-1 rounded text-[#5A5955]">已停用</span>
          )}
        </div>
        {tag.description && (
          <span className="text-[11px] text-[#5A5955] leading-[1.4] line-clamp-1" title={tag.description}>
            {tag.description}
          </span>
        )}
        {isSystem && tag.rule && (
          <span
            className="text-[10.5px] font-mono text-[#854F0B] leading-[1.4] line-clamp-1"
            title={tag.rule}
          >
            🧮 {tag.rule}
          </span>
        )}
      </div>

      {/* sparkline + usage_count */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-[56px]">
          <SparkLine data={tag.sparkline_7d} tone={sparkTone} height={22} strokeWidth={1.5} />
        </div>
        <div className="flex flex-col items-end leading-tight">
          <span className="text-[13px] font-semibold" style={{ color: tone.fg }}>
            {tag.usage_count}
          </span>
          <span className="text-[9.5px] text-[#9A9890]">套用客戶</span>
        </div>
      </div>

      {canEdit && (
        <div
          className="flex items-center gap-0.5 shrink-0 pl-2 ml-1 border-l border-[#D5D3CB]/40"
        >
          <button
            type="button"
            title="編輯"
            onClick={onEdit}
            disabled={isPending || isSystem}
            className="h-[24px] w-[24px] rounded text-[11px] bg-white/60 hover:bg-white border border-transparent hover:border-[#D5D3CB] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✎
          </button>
          <button
            type="button"
            title={tag.is_active ? "停用" : "啟用"}
            onClick={onToggle}
            disabled={isPending}
            className="h-[24px] w-[24px] rounded text-[11px] bg-white/60 hover:bg-white border border-transparent hover:border-[#D5D3CB] disabled:opacity-40"
          >
            {tag.is_active ? "⏸" : "▶"}
          </button>
          <button
            type="button"
            title="刪除"
            onClick={onDelete}
            disabled={isPending}
            className="h-[24px] w-[24px] rounded text-[12px] bg-white/60 hover:bg-[#FDECEA] border border-transparent hover:border-[#F5AEAD] hover:text-[#CC0000] disabled:opacity-40"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
