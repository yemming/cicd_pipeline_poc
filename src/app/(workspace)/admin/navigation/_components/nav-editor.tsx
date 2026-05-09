"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import {
  createNavNode,
  deleteNavNode,
  moveNavNode,
  updateNavNode,
  uploadHtmlForNode,
} from "@/lib/nav-actions";

// ── Draft / 批次儲存設計 ────────────────────────────────────────────────
// 讓使用者一次改完整個目錄樹（toggle 啟用、改名稱、調 href、改 icon...）再
// 一次按「儲存全部變更」。所有變更先進 client-side `drafts`，切換 row 不會掉，
// tree row + right panel 都讀 `rows ∪ drafts` 的 merged view。
// 為什麼不做樂觀鎖（OCC）？這頁 admin 級操作 + 多人併發改同一筆機率近零，
// 暫不增加 version_number/etag 機制，等真的踩到再加。
type NavDraft = Partial<NavNodeRow>;

// 常用 Material Symbols 快選池 — 涵蓋經銷商常見業務場景
const COMMON_ICONS = [
  "dashboard", "storefront", "point_of_sale", "shopping_cart",
  "build", "garage", "construction", "inventory_2",
  "calendar_today", "event_available", "calendar_month", "schedule",
  "group", "person", "person_add", "badge",
  "assignment", "fact_check", "task_alt", "verified",
  "payments", "receipt_long", "monetization_on", "account_balance",
  "directions_car", "two_wheeler", "local_florist", "drive_eta",
  "settings", "tune", "admin_panel_settings", "key",
  "shield", "verified_user", "policy", "gpp_good",
  "campaign", "notifications", "chat", "subscriptions",
  "hub", "schema", "account_tree", "folder",
  "bar_chart", "analytics", "insights", "trending_up",
  "search", "filter_alt", "sell", "sentiment_satisfied",
  "smartphone", "stay_primary_portrait", "computer", "tablet",
  "menu_book", "description", "edit_note", "draw",
  "history", "swap_horiz", "sync_alt", "import_export",
  "home", "apps", "widgets", "science",
];

// 常用品牌色 / 模組強調色快選池
const COMMON_ACCENTS = [
  "#CC0000", "#C8102E", "#1A1A2E", "#F43F5E",
  "#E67E22", "#F59E0B", "#C9A84C", "#D97706",
  "#1ABC9C", "#0891B2", "#4A90E2", "#4338CA",
  "#4F46E5", "#9B59B6", "#34495E", "#22C55E",
];

// 常用 emoji 池 — 經銷商 / 庫存 / 業務場景優先（呼應 parts 既有 emoji）
const COMMON_EMOJIS = [
  "🏛️", "🏗️", "🏭", "🏢", "🏪", "🏠", "🚀", "🎯",
  "📦", "📥", "📤", "📋", "📊", "📈", "📉", "📌",
  "🛒", "💼", "💰", "💳", "💵", "🧾", "🗂️", "📁",
  "🚗", "🏍️", "🚛", "🛠️", "🔧", "🔨", "⚙️", "🔩",
  "🔍", "🔎", "📞", "📧", "💬", "📢", "📣", "🔔",
  "⚡", "⭐", "✨", "🎉", "✅", "❌", "⚠️", "🚨",
  "👤", "👥", "🧑‍💼", "🧑‍💻", "🤝", "💡", "🎨", "🎁",
];

// 偵測是 Material Symbol 名稱（純小寫英數底線）還是 emoji（任何包含非 ASCII 的字串）
function isMaterialSymbolName(s: string): boolean {
  return /^[a-z0-9_]+$/.test(s);
}

export type NavNodeRow = {
  id: string;
  brand_id: string;
  parent_id: string | null;
  level: 1 | 2 | 3;
  sort_order: number;
  name: string;
  icon: string | null;
  emoji: string | null;
  accent: string | null;
  description: string | null;
  module_key: string | null;
  permission: string | null;
  home: string | null;
  page_kind: "static_html" | "react_route" | "iframe" | "placeholder" | null;
  href: string | null;
  html_storage_path: string | null;
  stitch_screen_id: string | null;
  sprint: string | null;
  is_admin_only: boolean;
  coming_soon: boolean;
  is_active: boolean;
  updated_at: string;
};

type Props = {
  initialRows: NavNodeRow[];
  brandKey: string;
  brandName: string;
};

export function NavEditor({ initialRows, brandKey, brandName }: Props) {
  useSetPageHeader({
    breadcrumb: [{ label: "目錄管理" }],
  });

  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [savingAll, startSaveAll] = useTransition();
  const [addChildTarget, setAddChildTarget] = useState<NavNodeRow | null>(null);

  const requestAddChild = useCallback((node: NavNodeRow) => {
    setAddChildTarget(node);
  }, []);

  // 後端最新 row 狀態（隨 server props 重生）+ client-side 暫存變更（drafts）。
  // 注意 useEffect 故意不清 drafts — router.refresh 帶回新 initialRows 時，
  // 使用者尚未儲存的 drafts 還是要保留。drafts 在儲存成功時才清。
  const [rows, setRows] = useState<NavNodeRow[]>(initialRows);
  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const [drafts, setDrafts] = useState<Record<string, NavDraft>>({});

  const setDraft = useCallback((id: string, patch: NavDraft) => {
    setDrafts((prev) => {
      const cur = prev[id] ?? {};
      const merged = { ...cur, ...patch };
      // 若 draft 已被改回原始值，可考慮 GC；不過 saveAll 會 noop 帶過，先不過早優化。
      return { ...prev, [id]: merged };
    });
  }, []);

  const discardAll = () => {
    if (Object.keys(drafts).length === 0) return;
    if (!confirm(`捨棄 ${Object.keys(drafts).length} 筆未儲存變更？此動作無法復原。`)) return;
    setDrafts({});
  };

  // 把 rows + drafts 疊起來給 tree 和右側面板看，一致性靠 merged 來保證
  const merged = useMemo(
    () => rows.map((r) => (drafts[r.id] ? { ...r, ...drafts[r.id] } : r)),
    [rows, drafts],
  );

  const tree = useMemo(() => buildTree(merged), [merged]);
  const selected = selectedId
    ? merged.find((r) => r.id === selectedId) ?? null
    : null;

  const toggleExpanded = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dirtyCount = Object.keys(drafts).length;

  const handleSaveAll = () => {
    if (dirtyCount === 0) return;
    startSaveAll(async () => {
      const ids = Object.keys(drafts);
      const failures: Array<{ id: string; name: string; msg: string }> = [];
      for (const id of ids) {
        const orig = rows.find((r) => r.id === id);
        if (!orig) continue;
        const m = { ...orig, ...drafts[id] };
        const fd = buildUpdateFormData(m);
        try {
          await updateNavNode(id, fd);
        } catch (err) {
          failures.push({
            id,
            name: m.name,
            msg: err instanceof Error ? err.message : String(err),
          });
        }
      }
      // 成功的 row 套到 rows、清掉 draft；失敗的留著讓使用者重試
      const failedIds = new Set(failures.map((f) => f.id));
      setRows((prev) =>
        prev.map((r) => {
          if (failedIds.has(r.id)) return r;
          return drafts[r.id] ? { ...r, ...drafts[r.id] } : r;
        }),
      );
      setDrafts((prev) => {
        const next: Record<string, NavDraft> = {};
        for (const fid of failedIds) {
          if (prev[fid]) next[fid] = prev[fid];
        }
        return next;
      });
      if (failures.length > 0) {
        alert(
          `部分節點儲存失敗（共 ${failures.length} 筆，已留在草稿）：\n` +
            failures.map((f) => `• ${f.name}: ${f.msg}`).join("\n"),
        );
      }
      router.refresh();
    });
  };

  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold font-display">目錄管理</h1>
          <p className="text-sm text-on-surface-variant mt-1">
            編輯 {brandName} 的左側功能目錄。儲存後會立刻反映到所有使用者的 ModuleRail / PagesPanel。
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirtyCount > 0 && (
            <button
              type="button"
              onClick={discardAll}
              disabled={savingAll}
              className="px-3 py-2 rounded-lg text-sm border border-outline-variant/40 hover:bg-surface-container-low disabled:opacity-50"
            >
              捨棄變更
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={dirtyCount === 0 || savingAll}
            className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              dirtyCount > 0
                ? "bg-[color:var(--color-brand-primary)] text-white hover:bg-[color:var(--color-brand-primary-dark)]"
                : "bg-surface-container text-on-surface-variant cursor-not-allowed"
            } ${savingAll ? "opacity-70 pointer-events-none" : ""}`}
          >
            {savingAll && <Spinner />}
            {savingAll ? "儲存中…" : dirtyCount > 0 ? `儲存 ${dirtyCount} 筆變更` : "已是最新"}
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] gap-6">
        {/* Tree */}
        <section className="bg-white rounded-2xl border border-outline-variant/30 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">
              目錄樹
            </h2>
            <NewModuleButton brandKey={brandKey} />
          </div>
          <p className="text-[11px] text-on-surface-variant mb-3 leading-relaxed">
            滑到任一節點，右側會出現
            <span className="inline-flex items-center mx-1 align-middle text-[color:var(--color-brand-primary)]">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
            </span>
            / ↑ / ↓ / 🗑 按鈕。
            <span className="font-semibold">「+」</span>
            可在該節點下加子項；左邊的開關可以暫存啟用 / 停用，最後再一次儲存。
          </p>

          {tree.length === 0 ? (
            <div className="py-12 text-center text-sm text-on-surface-variant">
              還沒有任何模組。<br />
              點上面「+ 新增模組」開始建立 {brandName} 的功能目錄。
            </div>
          ) : (
            <ul className="space-y-1">
              {tree.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  expanded={expanded}
                  selectedId={selectedId}
                  isDirty={!!drafts[node.id]}
                  dirtyMap={drafts}
                  onSelect={setSelectedId}
                  onToggleExpanded={toggleExpanded}
                  onDraft={setDraft}
                  onRequestAddChild={requestAddChild}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Edit Panel */}
        <section className="bg-white rounded-2xl border border-outline-variant/30 p-5">
          {selected ? (
            <NodeForm
              key={selected.id}
              node={selected}
              isDirty={!!drafts[selected.id]}
              onDraft={(patch) => setDraft(selected.id, patch)}
              onRequestAddChild={requestAddChild}
            />
          ) : (
            <div className="py-12 text-center text-sm text-on-surface-variant">
              點左邊任一節點來編輯。
            </div>
          )}
        </section>
      </div>

      {addChildTarget && (
        <AddChildDialog
          parent={addChildTarget}
          onClose={() => setAddChildTarget(null)}
          onCreated={() => {
            setAddChildTarget(null);
            // L2 / L3 都要展開 parent 才看得到剛建的 child
            setExpanded((s) => {
              if (s.has(addChildTarget.id)) return s;
              const next = new Set(s);
              next.add(addChildTarget.id);
              return next;
            });
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// 把 merged row 攤成 server action 接收的 FormData。對應 updateNavNode 的讀法。
function buildUpdateFormData(m: NavNodeRow): FormData {
  const fd = new FormData();
  fd.set("level", String(m.level));
  fd.set("name", m.name);
  fd.set("icon", m.icon ?? "");
  fd.set("emoji", m.emoji ?? "");
  fd.set("accent", m.accent ?? "");
  fd.set("description", m.description ?? "");
  fd.set("is_active", m.is_active ? "true" : "false");
  if (m.level === 1) {
    fd.set("module_key", m.module_key ?? "");
    fd.set("permission", m.permission ?? "");
    fd.set("home", m.home ?? "");
  }
  if (m.level === 3) {
    if (m.page_kind) fd.set("page_kind", m.page_kind);
    fd.set("href", m.href ?? "");
    fd.set("sprint", m.sprint ?? "");
    fd.set("is_admin_only", m.is_admin_only ? "true" : "false");
    fd.set("coming_soon", m.coming_soon ? "true" : "false");
  }
  return fd;
}

// ──────────────────────────────────────────────────────────
// Tree builders + components
// ──────────────────────────────────────────────────────────

type TreeNodeData = NavNodeRow & { children: TreeNodeData[] };

function buildTree(rows: NavNodeRow[]): TreeNodeData[] {
  const byId = new Map<string, TreeNodeData>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });

  const roots: TreeNodeData[] = [];
  for (const r of rows) {
    const node = byId.get(r.id)!;
    if (r.parent_id && byId.has(r.parent_id)) {
      byId.get(r.parent_id)!.children.push(node);
    } else if (!r.parent_id && r.level === 1) {
      roots.push(node);
    }
  }
  // sort children by sort_order
  const sortRecur = (n: TreeNodeData) => {
    n.children.sort((a, b) => a.sort_order - b.sort_order);
    n.children.forEach(sortRecur);
  };
  roots.sort((a, b) => a.sort_order - b.sort_order);
  roots.forEach(sortRecur);
  return roots;
}

function TreeNode({
  node,
  expanded,
  selectedId,
  isDirty,
  dirtyMap,
  onSelect,
  onToggleExpanded,
  onDraft,
  onRequestAddChild,
}: {
  node: TreeNodeData;
  expanded: Set<string>;
  selectedId: string | null;
  isDirty: boolean;
  dirtyMap: Record<string, NavDraft>;
  onSelect: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  onDraft: (id: string, patch: NavDraft) => void;
  onRequestAddChild: (node: NavNodeRow) => void;
}) {
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const indent = (node.level - 1) * 18;

  // dirty 行底淡黃 + 一個小黃點，未儲存的列一眼就看到
  const baseRowCls = isSelected
    ? "bg-[color:var(--color-brand-primary)]/10 ring-1 ring-[color:var(--color-brand-primary)]/30"
    : isDirty
    ? "bg-amber-50/60 hover:bg-amber-50"
    : "hover:bg-surface-container-low";

  return (
    <li>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${baseRowCls}`}
        style={{ paddingLeft: 8 + indent }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded(node.id);
            }}
            className="w-5 h-5 flex items-center justify-center text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-base">
              {isExpanded ? "expand_more" : "chevron_right"}
            </span>
          </button>
        ) : (
          <span className="w-5" />
        )}

        {node.icon ? (
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: node.accent ?? undefined }}
          >
            {node.icon}
          </span>
        ) : node.emoji ? (
          <span className="text-[16px] leading-none w-[18px] text-center">{node.emoji}</span>
        ) : null}
        <span className={`flex-1 text-sm truncate ${node.is_active ? "" : "opacity-40 line-through"}`}>
          {node.name}
        </span>

        {node.level === 3 && node.page_kind && (
          <span className="text-[10px] uppercase tracking-wider text-on-surface-variant px-1.5 py-0.5 rounded bg-surface-container-low">
            {pageKindLabel(node.page_kind)}
          </span>
        )}

        {isDirty && (
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900"
            title="此節點有未儲存變更"
          >
            未儲存
          </span>
        )}

        <ActiveToggle node={node} onDraft={onDraft} />
        <NodeActions node={node} onRequestAddChild={onRequestAddChild} />
      </div>

      {hasChildren && isExpanded && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              expanded={expanded}
              selectedId={selectedId}
              isDirty={!!dirtyMap[c.id]}
              dirtyMap={dirtyMap}
              onSelect={onSelect}
              onToggleExpanded={onToggleExpanded}
              onDraft={onDraft}
              onRequestAddChild={onRequestAddChild}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function pageKindLabel(kind: NavNodeRow["page_kind"]): string {
  switch (kind) {
    case "react_route":
      return "react";
    case "static_html":
      return "html";
    case "iframe":
      return "iframe";
    case "placeholder":
      return "placeholder";
    default:
      return "—";
  }
}

// ──────────────────────────────────────────────────────────
// Node row actions (move / delete / add child)
// ──────────────────────────────────────────────────────────

// 新增子項 dialog — 取代原本的 window.prompt，避免使用者要打 'page' / 'section'
// 才能新增。Module 下可選頁面 / 區段；區段底下固定建頁面（不再問）。
function AddChildDialog({
  parent,
  onClose,
  onCreated,
}: {
  parent: NavNodeRow;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [pending, startTransition] = useTransition();
  // L1 module 下可選 2/3，L2 section 底下強制 3
  const canChooseKind = parent.level === 1;
  const [childLevel, setChildLevel] = useState<2 | 3>(canChooseKind ? 3 : 3);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // dialog 打開時自動 focus 名稱欄位
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("名稱必填");
      inputRef.current?.focus();
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("level", String(childLevel));
        fd.set("parent_id", parent.id);
        fd.set("name", trimmed);
        fd.set("icon", childLevel === 3 ? "label" : "");
        if (childLevel === 3) fd.set("page_kind", "placeholder");
        await createNavNode(fd);
        onCreated();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  // ESC 關閉
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const levelLabelText = parent.level === 1 ? "模組" : "區段";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <h3 className="text-lg font-bold font-display">
              在{levelLabelText}「{parent.name}」下新增…
            </h3>
            <p className="text-xs text-on-surface-variant mt-1">
              {canChooseKind
                ? "選擇要建立的子項類型，再輸入名稱。"
                : "區段底下只能建頁面。輸入名稱建立。"}
            </p>
          </div>

          {canChooseKind && (
            <div className="space-y-2">
              <KindRadio
                checked={childLevel === 3}
                onChange={() => setChildLevel(3)}
                title="頁面（最常用）"
                desc="可點擊跳轉的三階項目。指向 React 路由、靜態 HTML、iframe 或佔位頁。"
              />
              <KindRadio
                checked={childLevel === 2}
                onChange={() => setChildLevel(2)}
                title="區段"
                desc="可分組但本身不可點的二階目錄。底下再放頁面。"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1.5">
              名稱
              <span className="text-error ml-0.5">*</span>
            </label>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (error) setError(null);
              }}
              placeholder={
                childLevel === 2
                  ? "例：客戶與分析"
                  : parent.level === 1
                  ? "例：展廳看板"
                  : "新頁面名稱"
              }
              className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest"
            />
            {error && (
              <p className="mt-1.5 text-xs text-error">{error}</p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 rounded-lg text-sm border border-outline-variant/40 hover:bg-surface-container-low disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={pending}
              className="px-5 py-2 rounded-lg text-sm font-medium bg-[color:var(--color-brand-primary)] text-white hover:bg-[color:var(--color-brand-primary-dark)] disabled:opacity-60 flex items-center gap-2"
            >
              {pending && <Spinner />}
              {pending ? "建立中…" : "建立"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function KindRadio({
  checked,
  onChange,
  title,
  desc,
}: {
  checked: boolean;
  onChange: () => void;
  title: string;
  desc: string;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
        checked
          ? "border-[color:var(--color-brand-primary)] bg-[color:var(--color-brand-primary)]/5"
          : "border-outline-variant/40 hover:bg-surface-container-low"
      }`}
    >
      <input
        type="radio"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 w-4 h-4"
      />
      <div className="flex-1">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[11px] text-on-surface-variant mt-0.5 leading-relaxed">{desc}</div>
      </div>
    </label>
  );
}

// Inline 啟用 / 停用 toggle — 按一下寫進 draft，跟其他變更一起等使用者按
// header 的「儲存全部變更」才 flush 到 DB。
function ActiveToggle({
  node,
  onDraft,
}: {
  node: NavNodeRow;
  onDraft: (id: string, patch: NavDraft) => void;
}) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDraft(node.id, { is_active: !node.is_active });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      title={node.is_active ? "點此暫存停用（要按上方「儲存」才會生效）" : "點此暫存啟用"}
      className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
        node.is_active
          ? "text-emerald-600 hover:bg-emerald-50"
          : "text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface-variant"
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">
        {node.is_active ? "toggle_on" : "toggle_off"}
      </span>
    </button>
  );
}

function NodeActions({
  node,
  onRequestAddChild,
}: {
  node: NavNodeRow;
  onRequestAddChild: (node: NavNodeRow) => void;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const guardedAction = (fn: () => Promise<void>) => (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  // 只有模組(1) / 區段(2) 能加子項；頁面(3) 是 leaf
  const canAddChild = node.level < 3;

  const handleAddChild = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRequestAddChild(node);
  };

  return (
    <div className={`flex items-center gap-0.5 ${pending ? "opacity-50 pointer-events-none" : ""}`}>
      {canAddChild && (
        <IconBtn
          icon="add"
          title={node.level === 1 ? "在此模組下新增頁面 / 區段" : "在此區段下新增頁面"}
          onClick={handleAddChild}
        />
      )}
      <IconBtn
        icon="arrow_upward"
        title="上移"
        onClick={guardedAction(() => moveNavNode(node.id, "up"))}
      />
      <IconBtn
        icon="arrow_downward"
        title="下移"
        onClick={guardedAction(() => moveNavNode(node.id, "down"))}
      />
      <IconBtn
        icon="delete"
        title="刪除（連同子節點）"
        onClick={guardedAction(async () => {
          if (!confirm(`確定刪除「${node.name}」與其所有子項？此動作不可復原。`)) {
            throw new Error("已取消");
          }
          await deleteNavNode(node.id);
        })}
      />
    </div>
  );
}

function IconBtn({
  icon,
  title,
  onClick,
}: {
  icon: string;
  title: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-6 h-6 flex items-center justify-center rounded text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
    >
      <span className="material-symbols-outlined text-[16px]">{icon}</span>
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// Add module / child / page buttons
// ──────────────────────────────────────────────────────────

function NewModuleButton({ brandKey: _brandKey }: { brandKey: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const handleClick = () => {
    const name = prompt("新模組名稱（例：銷售管理）");
    if (!name) return;
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("level", "1");
        fd.set("name", name);
        fd.set("icon", "apps");
        fd.set("module_key", slugify(name));
        await createNavNode(fd);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };
  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="text-xs px-3 py-1.5 rounded-lg bg-[color:var(--color-brand-primary)] text-white hover:bg-[color:var(--color-brand-primary-dark)] disabled:opacity-60 flex items-center gap-1"
    >
      <span className="material-symbols-outlined text-base">add</span>
      {pending ? "建立中…" : "新增模組"}
    </button>
  );
}

function slugify(s: string): string {
  const base = s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  // CJK 名稱會被洗成空，加 6 碼亂數避免和別的模組撞 key
  return base || `mod-${Math.random().toString(36).slice(2, 8)}`;
}

// ──────────────────────────────────────────────────────────
// Edit Form
// ──────────────────────────────────────────────────────────

function NodeForm({
  node,
  isDirty,
  onDraft,
  onRequestAddChild,
}: {
  node: NavNodeRow;
  isDirty: boolean;
  onDraft: (patch: NavDraft) => void;
  onRequestAddChild: (node: NavNodeRow) => void;
}) {
  const [uploadPending, startUpload] = useTransition();
  const router = useRouter();

  // node 已是 merged（rows ∪ drafts），所以表單欄位直接讀 node 的當前值即可。
  // 任一欄位 onChange 就丟一筆 patch 進 draft；切換 row 也不會掉。
  const pageKind = node.page_kind ?? "placeholder";
  const setPageKind = (v: NavNodeRow["page_kind"]) => onDraft({ page_kind: v });

  const handleAddChild = () => onRequestAddChild(node);

  const handleHtmlUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!(fd.get("file") instanceof File)) return;
    startUpload(async () => {
      try {
        await uploadHtmlForNode(node.id, fd);
        setPageKind("static_html");
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className={`space-y-5 ${uploadPending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">
              Level {node.level} · {levelLabel(node.level)}
            </div>
            {isDirty && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                未儲存
              </span>
            )}
          </div>
          <h2 className="text-lg font-bold font-display truncate">{node.name}</h2>
        </div>
        {node.level < 3 && (
          <button
            type="button"
            onClick={() => handleAddChild()}
            className="text-xs px-3 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container-low flex items-center gap-1 shrink-0"
          >
            <span className="material-symbols-outlined text-base">add</span>
            新增子項
          </button>
        )}
      </div>

      <div className="space-y-4">
        <Field label="名稱" required>
          <input
            value={node.name}
            onChange={(e) => onDraft({ name: e.target.value })}
            required
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest"
          />
        </Field>

        <Field label="Icon">
          <IconPicker
            value={node.icon ?? node.emoji ?? ""}
            onChange={(v) => {
              if (!v) {
                onDraft({ icon: null, emoji: null });
              } else if (isMaterialSymbolName(v)) {
                onDraft({ icon: v, emoji: null });
              } else {
                onDraft({ icon: null, emoji: v });
              }
            }}
          />
        </Field>

        {node.level === 1 && (
          <>
            <Field label="主色">
              <ColorPicker value={node.accent ?? ""} onChange={(v) => onDraft({ accent: v || null })} />
            </Field>
            <Field label="描述">
              <input
                value={node.description ?? ""}
                onChange={(e) => onDraft({ description: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest"
              />
            </Field>
            <Field label="Module Key">
              <input
                value={node.module_key ?? ""}
                onChange={(e) => onDraft({ module_key: e.target.value || null })}
                placeholder="例：sales, service"
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono"
              />
            </Field>
            <Field label="模組首頁路徑">
              <input
                value={node.home ?? ""}
                onChange={(e) => onDraft({ home: e.target.value || null })}
                placeholder="/sales/showroom"
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono"
              />
            </Field>
          </>
        )}

        {node.level === 3 && (
          <>
            <Field label="頁面型態">
              <select
                value={pageKind}
                onChange={(e) => setPageKind(e.target.value as NavNodeRow["page_kind"])}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest"
              >
                <option value="react_route">React 路由（指向已存在的頁面）</option>
                <option value="static_html">靜態 HTML（上傳 .html 檔）</option>
                <option value="iframe">iframe（嵌入外部 URL）</option>
                <option value="placeholder">佔位（顯示「規劃中」）</option>
              </select>
            </Field>

            {(pageKind === "react_route" || pageKind === "iframe") && (
              <Field label={pageKind === "iframe" ? "外部 URL" : "路由路徑"}>
                <input
                  value={node.href ?? ""}
                  onChange={(e) => onDraft({ href: e.target.value || null })}
                  placeholder={pageKind === "iframe" ? "https://..." : "/sales/showroom"}
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono"
                />
              </Field>
            )}

            <Field label="Sprint 標籤">
              <input
                value={node.sprint ?? ""}
                onChange={(e) => onDraft({ sprint: e.target.value || null })}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono text-sm"
              />
            </Field>

            <div className="flex flex-wrap gap-4">
              <ControlledCheckBox
                checked={node.is_admin_only}
                onChange={(v) => onDraft({ is_admin_only: v })}
              >
                Admin Only
              </ControlledCheckBox>
              <ControlledCheckBox
                checked={node.coming_soon}
                onChange={(v) => onDraft({ coming_soon: v })}
              >
                標記「即將推出」
              </ControlledCheckBox>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-4 pt-2">
          <ControlledCheckBox
            checked={node.is_active}
            onChange={(v) => onDraft({ is_active: v })}
          >
            啟用（取消勾選則隱藏不刪除）
          </ControlledCheckBox>
        </div>
      </div>

      {node.level === 3 && pageKind === "static_html" && (
        <div className="mt-6 pt-5 border-t border-outline-variant/30">
          <h3 className="text-sm font-bold mb-2">上傳 HTML 檔</h3>
          <p className="text-xs text-on-surface-variant mb-3">
            選擇單頁 HTML 檔（&lt;head&gt; 內 &lt;style&gt; 會保留，&lt;script&gt; 與外連 &lt;link&gt; 會被移除）。
            上傳成功後此頁的內容就會以 {node.html_storage_path ? "覆蓋既有檔案" : "新檔案"} 形式儲存。
          </p>
          {node.html_storage_path && (
            <p className="text-[11px] text-on-surface-variant mb-3 font-mono">
              目前檔案：{node.html_storage_path}
            </p>
          )}
          <form onSubmit={handleHtmlUpload} className="flex items-center gap-3">
            <input
              type="file"
              name="file"
              accept=".html,.htm,text/html"
              required
              className="text-sm flex-1 file:mr-3 file:px-3 file:py-1.5 file:rounded file:border-0 file:bg-surface-container file:text-on-surface file:cursor-pointer"
            />
            <button
              type="submit"
              disabled={uploadPending}
              className="px-4 py-1.5 rounded-lg bg-on-surface text-white text-sm font-medium hover:opacity-80 disabled:opacity-60 flex items-center gap-2"
            >
              {uploadPending && <Spinner />}
              {uploadPending ? "上傳中…" : "上傳"}
            </button>
          </form>
        </div>
      )}

      {/* 沒有「儲存變更」按鈕了 — 全頁變更靠 header 的「儲存全部變更」一次寫回。 */}
    </div>
  );
}

// 配 controlled state 的 checkbox。NodeForm 全 controlled 之後不需要 hidden 把戲了。
function ControlledCheckBox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-outline-variant"
      />
      <span>{children}</span>
    </label>
  );
}

function levelLabel(l: 1 | 2 | 3): string {
  return l === 1 ? "模組（一階）" : l === 2 ? "區段（二階）" : "頁面（三階）";
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
    <label className="block">
      <span className="block text-xs font-semibold text-on-surface-variant mb-1.5">
        {label}
        {required && <span className="text-error ml-0.5">*</span>}
      </span>
      {children}
    </label>
  );
}


function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
      <path
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────
// Icon Picker：圖示 + 表情符號雙模式
//
// 一個輸入框、自動偵測：
//   - 純小寫英數底線（dashboard / point_of_sale）→ Material Symbol → 寫進 row.icon
//   - 其他（emoji 像 🏛️ 🏗️）→ 寫進 row.emoji
// 兩欄是 DB 既有設計，loader 看 icon 沒有就回退 emoji，所以這邊不混存。
// ──────────────────────────────────────────────────────────
function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // 預設 tab：value 是 emoji 就開到 emoji 頁、其他都先給 Material
  const [tab, setTab] = useState<"symbol" | "emoji">(
    value && !isMaterialSymbolName(value) ? "emoji" : "symbol",
  );
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return COMMON_ICONS;
    const q = search.trim().toLowerCase();
    return COMMON_ICONS.filter((i) => i.includes(q));
  }, [search]);

  const valueIsEmoji = !!value && !isMaterialSymbolName(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest">
          {valueIsEmoji ? (
            <span className="text-[22px] leading-none w-[22px] text-center shrink-0">{value}</span>
          ) : (
            <span className="material-symbols-outlined text-on-surface-variant shrink-0" style={{ fontSize: 22 }}>
              {value || "help_outline"}
            </span>
          )}
          <input
            value={value}
            onChange={(e) => {
              // emoji 不要 trim 掉 zero-width joiner / variation selector
              const v = isMaterialSymbolName(e.target.value.trim())
                ? e.target.value.trim()
                : e.target.value;
              onChange(v);
            }}
            placeholder="例：dashboard 或貼 emoji 🏛️"
            className="flex-1 bg-transparent outline-none font-mono text-sm"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-2 rounded-lg border border-outline-variant/40 hover:bg-surface-container-low text-sm flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">grid_view</span>
          {open ? "收起" : "選圖示"}
        </button>
      </div>

      {open && (
        <div className="rounded-lg border border-outline-variant/30 p-3 bg-surface-container-lowest">
          <div className="flex gap-1 mb-3">
            <TabBtn active={tab === "symbol"} onClick={() => setTab("symbol")}>
              Material 圖示
            </TabBtn>
            <TabBtn active={tab === "emoji"} onClick={() => setTab("emoji")}>
              表情符號 Emoji
            </TabBtn>
          </div>

          {tab === "symbol" ? (
            <>
              <input
                type="text"
                placeholder="搜尋圖示..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full mb-3 px-3 py-1.5 rounded border border-outline-variant/40 bg-white text-sm"
              />
              <div className="grid grid-cols-8 gap-1.5 max-h-60 overflow-y-auto">
                {filtered.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      onChange(name);
                      setOpen(false);
                    }}
                    title={name}
                    className={`aspect-square flex items-center justify-center rounded border ${
                      value === name
                        ? "border-[color:var(--color-brand-primary)] bg-[color:var(--color-brand-primary)]/10"
                        : "border-outline-variant/30 hover:bg-surface-container"
                    }`}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                      {name}
                    </span>
                  </button>
                ))}
              </div>
              {filtered.length === 0 && (
                <p className="text-xs text-on-surface-variant py-4 text-center">
                  快選池沒這個。直接在上面輸入框打 Material Symbols 名稱即可。
                </p>
              )}
              <p className="text-[11px] text-on-surface-variant mt-3 leading-relaxed">
                找不到想要的？看完整清單：
                <a
                  href="https://fonts.google.com/icons"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline ml-1"
                >
                  Material Symbols
                </a>
                （複製 icon 名稱貼到上面輸入框）
              </p>
            </>
          ) : (
            <>
              <div className="grid grid-cols-8 gap-1.5 max-h-60 overflow-y-auto">
                {COMMON_EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => {
                      onChange(e);
                      setOpen(false);
                    }}
                    title={e}
                    className={`aspect-square flex items-center justify-center rounded border text-[22px] leading-none ${
                      value === e
                        ? "border-[color:var(--color-brand-primary)] bg-[color:var(--color-brand-primary)]/10"
                        : "border-outline-variant/30 hover:bg-surface-container"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-on-surface-variant mt-3 leading-relaxed">
                想要其他 emoji？直接複製貼到上面輸入框（macOS：⌃⌘Space 開 emoji 鍵盤）。
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-[color:var(--color-brand-primary)] text-white"
          : "bg-white border border-outline-variant/40 hover:bg-surface-container"
      }`}
    >
      {children}
    </button>
  );
}

// ──────────────────────────────────────────────────────────
// Color Picker：native color input + 預設色票 + hex 文字輸入
// ──────────────────────────────────────────────────────────
function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const colorRef = useRef<HTMLInputElement>(null);
  const isValid = /^#[0-9A-Fa-f]{6}$/.test(value);
  const display = isValid ? value : "#CCCCCC";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => colorRef.current?.click()}
          className="w-10 h-10 rounded-lg border border-outline-variant/40 shrink-0 cursor-pointer relative overflow-hidden"
          style={{ backgroundColor: display }}
          title="點擊開啟調色盤"
        >
          <input
            ref={colorRef}
            type="color"
            value={display}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </button>
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            // 自動補 # 開頭
            onChange(v && !v.startsWith("#") ? "#" + v : v);
          }}
          placeholder="#CC0000"
          className="flex-1 px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            title="清除"
            className="px-2 py-2 text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {COMMON_ACCENTS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            title={c}
            className={`w-7 h-7 rounded border-2 ${
              value.toLowerCase() === c.toLowerCase()
                ? "border-on-surface scale-110"
                : "border-white shadow-sm hover:scale-105"
            } transition-transform`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}
