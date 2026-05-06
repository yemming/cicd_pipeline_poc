"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import {
  createNavNode,
  deleteNavNode,
  moveNavNode,
  updateNavNode,
  uploadHtmlForNode,
} from "@/lib/nav-actions";

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

export type NavNodeRow = {
  id: string;
  brand_id: string;
  parent_id: string | null;
  level: 1 | 2 | 3;
  sort_order: number;
  name: string;
  icon: string | null;
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
  device: "desktop" | "tablet" | "ipad" | "mobile" | null;
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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTree(initialRows), [initialRows]);
  const selected = selectedId
    ? initialRows.find((r) => r.id === selectedId) ?? null
    : null;

  const toggleExpanded = (id: string) => {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-bold font-display">目錄管理</h1>
        <p className="text-sm text-on-surface-variant mt-1">
          編輯 {brandName} 的左側功能目錄。改動會立刻反映到所有使用者的 ModuleRail / PagesPanel。
        </p>
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
            可在該節點下加子項：模組底下可開頁面或區段、區段底下開頁面。
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
                  onSelect={setSelectedId}
                  onToggleExpanded={toggleExpanded}
                />
              ))}
            </ul>
          )}
        </section>

        {/* Edit Panel */}
        <section className="bg-white rounded-2xl border border-outline-variant/30 p-5">
          {selected ? (
            <NodeForm key={selected.id} node={selected} />
          ) : (
            <div className="py-12 text-center text-sm text-on-surface-variant">
              點左邊任一節點來編輯。
            </div>
          )}
        </section>
      </div>
    </>
  );
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
  onSelect,
  onToggleExpanded,
}: {
  node: TreeNodeData;
  expanded: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onToggleExpanded: (id: string) => void;
}) {
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const hasChildren = node.children.length > 0;
  const indent = (node.level - 1) * 18;

  return (
    <li>
      <div
        className={`flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer ${
          isSelected ? "bg-[color:var(--color-brand-primary)]/10 ring-1 ring-[color:var(--color-brand-primary)]/30" : "hover:bg-surface-container-low"
        }`}
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

        {node.icon && (
          <span
            className="material-symbols-outlined text-[18px]"
            style={{ color: node.accent ?? undefined }}
          >
            {node.icon}
          </span>
        )}
        <span className={`flex-1 text-sm truncate ${node.is_active ? "" : "opacity-40 line-through"}`}>
          {node.name}
        </span>

        {node.level === 3 && node.page_kind && (
          <span className="text-[10px] uppercase tracking-wider text-on-surface-variant px-1.5 py-0.5 rounded bg-surface-container-low">
            {pageKindLabel(node.page_kind)}
          </span>
        )}

        <NodeActions node={node} />
      </div>

      {hasChildren && isExpanded && (
        <ul className="mt-0.5 space-y-0.5">
          {node.children.map((c) => (
            <TreeNode
              key={c.id}
              node={c}
              expanded={expanded}
              selectedId={selectedId}
              onSelect={onSelect}
              onToggleExpanded={onToggleExpanded}
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

function NodeActions({ node }: { node: NavNodeRow }) {
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

  const handleAddChild = guardedAction(async () => {
    let childLevel: 2 | 3;
    if (node.level === 1) {
      const ans = prompt(
        `在模組「${node.name}」下面要建什麼？\n\n  輸入 page = 頁面（最常用）\n  輸入 section = 可分組但不可點的區段`,
        "page",
      );
      if (!ans) throw new Error("已取消");
      const t = ans.trim().toLowerCase();
      if (t === "section" || t === "s" || t === "2") childLevel = 2;
      else if (t === "page" || t === "p" || t === "3") childLevel = 3;
      else throw new Error(`不認識 '${ans}'，請輸入 page 或 section`);
    } else {
      childLevel = 3;
    }

    const promptText = childLevel === 2 ? "新區段名稱（例：客戶與分析）" : "新頁面名稱：";
    const name = prompt(promptText);
    if (!name) throw new Error("已取消");

    const fd = new FormData();
    fd.set("level", String(childLevel));
    fd.set("parent_id", node.id);
    fd.set("name", name);
    fd.set("icon", childLevel === 3 ? "label" : "");
    if (childLevel === 3) fd.set("page_kind", "placeholder");
    await createNavNode(fd);
  });

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

function NodeForm({ node }: { node: NavNodeRow }) {
  const [pending, startTransition] = useTransition();
  const [uploadPending, startUpload] = useTransition();
  const router = useRouter();

  const [pageKind, setPageKind] = useState(node.page_kind ?? "placeholder");
  const [icon, setIcon] = useState(node.icon ?? "");
  const [accent, setAccent] = useState(node.accent ?? "");

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await updateNavNode(node.id, fd);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const handleAddChild = (forceChildLevel?: 2 | 3) => {
    // Module（level 1）下面可以選：建 section（level 2）or 直接建 page（level 3）
    // Section（level 2）下面只能建 page（level 3）
    let childLevel: 2 | 3;
    if (forceChildLevel) {
      childLevel = forceChildLevel;
    } else if (node.level === 1) {
      const ans = prompt(
        "在「" + node.name + "」下面要建什麼？\n  輸入 'section' = 建立可分組但不可點的二階目錄\n  輸入 'page' = 建立可點到頁面的三階項目（最常用）",
        "page",
      );
      if (!ans) return;
      const trimmed = ans.trim().toLowerCase();
      if (trimmed === "section" || trimmed === "s" || trimmed === "2") childLevel = 2;
      else if (trimmed === "page" || trimmed === "p" || trimmed === "3") childLevel = 3;
      else {
        alert("不認識 '" + ans + "'，請輸入 page 或 section");
        return;
      }
    } else {
      childLevel = 3;
    }

    const name = prompt(
      childLevel === 2 ? "新區段名稱（例：客戶與分析）" : "新頁面名稱：",
    );
    if (!name) return;

    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("level", String(childLevel));
        fd.set("parent_id", node.id);
        fd.set("name", name);
        fd.set("icon", childLevel === 3 ? "label" : "");
        if (childLevel === 3) {
          fd.set("page_kind", "placeholder");
        }
        await createNavNode(fd);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : String(err));
      }
    });
  };

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
    <div className={`space-y-5 ${pending || uploadPending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-on-surface-variant">
            Level {node.level} · {levelLabel(node.level)}
          </div>
          <h2 className="text-lg font-bold font-display">{node.name}</h2>
        </div>
        {node.level < 3 && (
          <button
            type="button"
            onClick={() => handleAddChild()}
            className="text-xs px-3 py-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container-low flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-base">add</span>
            新增子項
          </button>
        )}
      </div>

      <form id="nav-node-form" onSubmit={handleSave} className="space-y-4">
        <Field label="名稱" required>
          <input
            name="name"
            defaultValue={node.name}
            required
            className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest"
          />
        </Field>

        <Field label="Icon">
          <IconPicker value={icon} onChange={setIcon} />
          <input type="hidden" name="icon" value={icon} />
        </Field>

        {node.level === 1 && (
          <>
            <Field label="主色">
              <ColorPicker value={accent} onChange={setAccent} />
              <input type="hidden" name="accent" value={accent} />
            </Field>
            <Field label="描述">
              <input
                name="description"
                defaultValue={node.description ?? ""}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest"
              />
            </Field>
            <Field label="Module Key">
              <input
                name="module_key"
                defaultValue={node.module_key ?? ""}
                placeholder="例：sales, service"
                className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono"
              />
            </Field>
            <Field label="模組首頁路徑">
              <input
                name="home"
                defaultValue={node.home ?? ""}
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
                name="page_kind"
                value={pageKind}
                onChange={(e) => setPageKind(e.target.value as typeof pageKind)}
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
                  name="href"
                  defaultValue={node.href ?? ""}
                  placeholder={pageKind === "iframe" ? "https://..." : "/sales/showroom"}
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono"
                />
              </Field>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Field label="Sprint 標籤">
                <input
                  name="sprint"
                  defaultValue={node.sprint ?? ""}
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest font-mono text-sm"
                />
              </Field>
              <Field label="裝置版型">
                <select
                  name="device"
                  defaultValue={node.device ?? ""}
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest"
                >
                  <option value="">Normal（一般網頁）</option>
                  <option value="tablet">Tablet（T） — 自動隱藏 sidebar</option>
                  <option value="mobile">Mobile（M） — 自動隱藏 sidebar</option>
                </select>
                <p className="text-[10px] text-on-surface-variant mt-1 leading-relaxed">
                  Tablet / Mobile 進入時會自動全螢幕（隱藏左側兩欄導航），且在頁面清單會顯示 T / M 角標提醒設計師此頁要做窄版視覺。
                </p>
              </Field>
            </div>

            <div className="flex flex-wrap gap-4">
              <CheckBox name="is_admin_only" defaultChecked={node.is_admin_only}>
                Admin Only
              </CheckBox>
              <CheckBox name="coming_soon" defaultChecked={node.coming_soon}>
                標記「即將推出」
              </CheckBox>
            </div>
          </>
        )}

        <div className="flex flex-wrap gap-4 pt-2">
          <CheckBox name="is_active" defaultChecked={node.is_active}>
            啟用（取消勾選則隱藏不刪除）
          </CheckBox>
        </div>
      </form>

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

      {/* 儲存變更：放整個編輯面板最下方。靠 form="nav-node-form" 跟主表單關聯，HTML 上傳區永遠在它上面 */}
      <div className="pt-4 mt-4 border-t border-outline-variant/30">
        <button
          type="submit"
          form="nav-node-form"
          disabled={pending}
          className="w-full px-5 py-2.5 rounded-lg bg-[color:var(--color-brand-primary)] text-white font-medium hover:bg-[color:var(--color-brand-primary-dark)] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {pending && <Spinner />}
          {pending ? "儲存中…" : "儲存變更"}
        </button>
      </div>
    </div>
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

function CheckBox({
  name,
  defaultChecked,
  children,
}: {
  name: string;
  defaultChecked: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        value="true"
        className="w-4 h-4 rounded border-outline-variant"
      />
      <span>{children}</span>
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
// Icon Picker：文字輸入 + 常用快選 + 搜尋過濾
// 完整 Material Symbols 有上千個，所以只放常用 + 允許自由輸入
// ──────────────────────────────────────────────────────────
function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return COMMON_ICONS;
    const q = search.trim().toLowerCase();
    return COMMON_ICONS.filter((i) => i.includes(q));
  }, [search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest">
          <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: 22 }}>
            {value || "help_outline"}
          </span>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.trim())}
            placeholder="例：dashboard"
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
        </div>
      )}
    </div>
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
