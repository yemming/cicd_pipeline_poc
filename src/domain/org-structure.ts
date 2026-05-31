/**
 * Org structure domain helper — server-only。
 *
 * GRP20 組織架構設定（集團管理 · 系統設定層）唯讀總覽的唯一資料來源。
 *
 * ── 設計（round-22 拍板方案 A）──
 * 唯讀統一樹：把現有的 groups / subsidiaries / organizations / departments
 * 四張真表組成一棵五層樹（集團 → 法人 → 門店(region→store) / 部門），brand 當
 * chip 不當樹層（符合 §維度模型：brand 是虛軸、subsidiary 才是實體法人）。
 * 不寫入、無 actions、無新表；CRUD 一律深連結回 /admin/org · /admin/rbac ·
 * /admin/navigation。
 *
 * ── 資料真相（schema-checked 2026-05-31）──
 *   • groups：1 筆（DealerOS Demo Group），子法人靠 subsidiaries.group_id 串。
 *   • subsidiaries：法人，parent_subsidiary_id 自串（控股 → 各品牌法人）。
 *   • brands：brands.default_subsidiary_id 反查 → 掛在法人上當 chip。
 *   • organizations：門店，subsidiary_id 掛法人；自身 parent_id 串 region(L1)→store(L2)。
 *   • departments：部門，subsidiary_id 掛法人（**無 store_id**，parent_id 全 null）。
 *   • user_assignments：人員指派，全部 scope_type='brand'、scope_id=brand →
 *     依法人的 brand chip 反查掛在法人節點。
 *   • nav_nodes：頁面權限（permission / is_admin_only）→ 聚合成模組權限總覽。
 *
 * 走 service client + admin gate（沿用 org-admin.ts pattern）：GRP20 是集團級
 * 全覽，要看到整個集團（含控股 + 雙品牌法人），不能被 RLS user_has_brand 砍半。
 *
 * Throw sentinel: "UNAUTHENTICATED" / "FORBIDDEN_ORG_STRUCTURE"
 */

import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

// ───────────────────────── admin guard ─────────────────────────

async function ensureOrgAdmin() {
  const ctx = await getCurrentUserAndAdmin();
  if (!ctx.userId) throw new Error("UNAUTHENTICATED");
  if (!ctx.isAdmin) throw new Error("FORBIDDEN_ORG_STRUCTURE");
  return ctx;
}

// ───────────────────────── types ─────────────────────────

export type OrgNodeType = "group" | "subsidiary" | "region" | "store" | "department";

export interface KvItem {
  label: string;
  value: string;
  mono?: boolean;
}

export interface AssignmentRow {
  roleId: string;
  roleName: string;
  userName: string | null;
  scopeLabel: string;
  expires: string | null;
}

export interface OrgTreeNode {
  /** 全域唯一 key：`${type}:${id}` */
  key: string;
  type: OrgNodeType;
  id: string;
  name: string;
  code: string | null;
  /** 顯示在節點旁的 brand chip（brand id：indian / ducati） */
  brandIds: string[];
  isActive: boolean;
  /** 詳情面板 KV */
  detail: KvItem[];
  /** 掛在此節點的人員指派（目前僅法人節點有，來自 brand-scoped assignments） */
  assignments: AssignmentRow[];
  children: OrgTreeNode[];
}

export interface PermissionModuleRow {
  /** 模組（nav level=1）名稱 */
  module: string;
  brandId: string;
  /** 此模組底下的頁面（有 href 的葉節點）數 */
  pageCount: number;
  /** 其中 is_admin_only 的頁面數 */
  adminOnlyCount: number;
  /** 其中有設定明確 permission key 的頁面數 */
  withPermissionCount: number;
}

export interface OrgStructureData {
  tree: OrgTreeNode[];
  permissionMatrix: PermissionModuleRow[];
  stats: {
    groups: number;
    subsidiaries: number;
    stores: number;
    departments: number;
    assignments: number;
  };
}

// ───────────────────────── helpers ─────────────────────────

function txt(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

// ───────────────────────── main ─────────────────────────

export async function getOrgStructure(): Promise<OrgStructureData> {
  await ensureOrgAdmin();
  const sb = createServiceClient();

  const [
    { data: groups },
    { data: subs },
    { data: brands },
    { data: orgs },
    { data: depts },
    { data: assigns },
    { data: roles },
    { data: profiles },
    { data: navNodes },
  ] = await Promise.all([
    sb.from("groups").select("id, name, short_name, tenant_uuid").order("name"),
    sb
      .from("subsidiaries")
      .select(
        "id, group_id, legal_name, short_name, tax_id, base_currency, parent_subsidiary_id, is_root, responsible_person, address, phone, netsuite_subsidiary_id, is_active",
      )
      .order("is_root", { ascending: false })
      .order("legal_name"),
    sb.from("brands").select("id, name, default_subsidiary_id").order("id"),
    sb
      .from("organizations")
      .select(
        "id, code, name, short_name, type, level, parent_id, subsidiary_id, brand_id, store_type, responsible_person, address, phone, is_active",
      )
      .order("level")
      .order("code"),
    sb
      .from("departments")
      .select(
        "id, code, name, parent_id, subsidiary_id, brand_id, manager_employee_id, netsuite_department_id, is_active",
      )
      .order("code"),
    sb
      .from("user_assignments")
      .select("user_id, role_id, scope_type, scope_id, expires_at"),
    sb.from("roles").select("id, name"),
    sb.from("profiles").select("id, name"),
    sb
      .from("nav_nodes")
      .select("id, name, level, parent_id, brand_id, href, permission, is_admin_only, is_active"),
  ]);

  const groupList = groups ?? [];
  const subList = subs ?? [];
  const brandList = brands ?? [];
  const orgList = orgs ?? [];
  const deptList = depts ?? [];
  const assignList = assigns ?? [];
  const roleList = roles ?? [];
  const profileList = profiles ?? [];
  const navList = navNodes ?? [];

  const roleName = new Map(roleList.map((r) => [r.id, r.name as string]));
  const profileName = new Map(profileList.map((p) => [p.id, p.name as string | null]));

  // brand chips per subsidiary（brands.default_subsidiary_id 反查）
  const brandsForSub = new Map<string, string[]>();
  for (const b of brandList) {
    if (!b.default_subsidiary_id) continue;
    const list = brandsForSub.get(b.default_subsidiary_id) ?? [];
    list.push(b.id);
    brandsForSub.set(b.default_subsidiary_id, list);
  }

  // brand-scoped 指派依 brand id 分組
  const assignsForBrand = new Map<string, AssignmentRow[]>();
  for (const a of assignList) {
    if (a.scope_type !== "brand" || !a.scope_id) continue;
    const list = assignsForBrand.get(a.scope_id) ?? [];
    list.push({
      roleId: a.role_id,
      roleName: roleName.get(a.role_id) ?? a.role_id,
      userName: profileName.get(a.user_id) ?? null,
      scopeLabel: `品牌：${a.scope_id}`,
      expires: a.expires_at ?? null,
    });
    assignsForBrand.set(a.scope_id, list);
  }

  // ── 組織節點：region(level=1, parent_id=null) → store(parent_id=region) ──
  const orgsForSub = new Map<string, typeof orgList>();
  for (const o of orgList) {
    if (!o.subsidiary_id) continue;
    const list = orgsForSub.get(o.subsidiary_id) ?? [];
    list.push(o);
    orgsForSub.set(o.subsidiary_id, list);
  }
  const childOrgs = new Map<string, typeof orgList>();
  for (const o of orgList) {
    if (!o.parent_id) continue;
    const list = childOrgs.get(o.parent_id) ?? [];
    list.push(o);
    childOrgs.set(o.parent_id, list);
  }

  const deptsForSub = new Map<string, typeof deptList>();
  for (const d of deptList) {
    if (!d.subsidiary_id) continue;
    const list = deptsForSub.get(d.subsidiary_id) ?? [];
    list.push(d);
    deptsForSub.set(d.subsidiary_id, list);
  }

  const buildStoreNode = (o: (typeof orgList)[number]): OrgTreeNode => ({
    key: `store:${o.id}`,
    type: "store",
    id: o.id,
    name: o.name,
    code: o.code,
    brandIds: o.brand_id ? [o.brand_id] : [],
    isActive: o.is_active ?? true,
    detail: [
      { label: "代碼", value: txt(o.code), mono: true },
      { label: "門市型態", value: txt(o.store_type) },
      { label: "類型", value: txt(o.type) },
      { label: "負責人", value: txt(o.responsible_person) },
      { label: "電話", value: txt(o.phone) },
      { label: "地址", value: txt(o.address) },
      { label: "狀態", value: o.is_active === false ? "停用" : "啟用" },
    ],
    assignments: [],
    children: [],
  });

  const buildRegionNode = (o: (typeof orgList)[number]): OrgTreeNode => {
    const stores = (childOrgs.get(o.id) ?? []).map(buildStoreNode);
    return {
      key: `region:${o.id}`,
      type: "region",
      id: o.id,
      name: o.name,
      code: o.code,
      brandIds: o.brand_id ? [o.brand_id] : [],
      isActive: o.is_active ?? true,
      detail: [
        { label: "代碼", value: txt(o.code), mono: true },
        { label: "類型", value: txt(o.type) },
        { label: "層級", value: `L${o.level ?? "—"}` },
        { label: "直屬門店", value: String(stores.length) },
      ],
      assignments: [],
      children: stores,
    };
  };

  const buildDeptNode = (d: (typeof deptList)[number]): OrgTreeNode => ({
    key: `department:${d.id}`,
    type: "department",
    id: d.id,
    name: d.name,
    code: d.code,
    brandIds: d.brand_id ? [d.brand_id] : [],
    isActive: d.is_active ?? true,
    detail: [
      { label: "代碼", value: txt(d.code), mono: true },
      { label: "NetSuite 部門", value: txt(d.netsuite_department_id), mono: true },
      { label: "成本中心", value: txt(d.netsuite_department_id), mono: true },
      { label: "狀態", value: d.is_active === false ? "停用" : "啟用" },
    ],
    assignments: [],
    children: [],
  });

  const buildSubNode = (s: (typeof subList)[number]): OrgTreeNode => {
    const brandIds = brandsForSub.get(s.id) ?? [];
    // region 節點 = 此法人底下 parent_id=null 的 organizations
    const regions = (orgsForSub.get(s.id) ?? [])
      .filter((o) => !o.parent_id)
      .map(buildRegionNode);
    const deptNodes = (deptsForSub.get(s.id) ?? []).map(buildDeptNode);
    // 人員指派：把此法人各 brand chip 的 brand-scoped 指派彙整
    const assignments: AssignmentRow[] = [];
    for (const bid of brandIds) assignments.push(...(assignsForBrand.get(bid) ?? []));

    return {
      key: `subsidiary:${s.id}`,
      type: "subsidiary",
      id: s.id,
      name: s.legal_name,
      code: s.tax_id,
      brandIds,
      isActive: s.is_active ?? true,
      detail: [
        { label: "法人全名", value: txt(s.legal_name) },
        { label: "統一編號", value: txt(s.tax_id), mono: true },
        { label: "本位幣", value: txt(s.base_currency) },
        { label: "根法人", value: s.is_root ? "是（控股）" : "否" },
        { label: "NetSuite Subsidiary", value: txt(s.netsuite_subsidiary_id), mono: true },
        { label: "負責人", value: txt(s.responsible_person) },
        { label: "電話", value: txt(s.phone) },
        { label: "地址", value: txt(s.address) },
        { label: "狀態", value: s.is_active === false ? "停用" : "啟用" },
      ],
      assignments,
      children: [...regions, ...deptNodes],
    };
  };

  // ── 樹根：集團 → 法人（依 group_id；parent_subsidiary 排序讓控股在前） ──
  const subsForGroup = new Map<string, typeof subList>();
  for (const s of subList) {
    const gid = s.group_id ?? "__none__";
    const list = subsForGroup.get(gid) ?? [];
    list.push(s);
    subsForGroup.set(gid, list);
  }

  const tree: OrgTreeNode[] = groupList.map((g) => {
    const subNodes = (subsForGroup.get(g.id) ?? []).map(buildSubNode);
    return {
      key: `group:${g.id}`,
      type: "group",
      id: g.id,
      name: g.name,
      code: g.short_name ?? g.id,
      brandIds: [],
      isActive: true,
      detail: [
        { label: "集團代碼", value: txt(g.id), mono: true },
        { label: "簡稱", value: txt(g.short_name) },
        { label: "Tenant UUID", value: txt(g.tenant_uuid), mono: true },
        { label: "直屬法人", value: String(subNodes.length) },
      ],
      assignments: [],
      children: subNodes,
    };
  });

  // ── 頁面權限總覽：nav level=1 模組 × 葉頁統計（唯讀展示既有 nav 設定） ──
  const navById = new Map(navList.map((n) => [n.id, n]));
  const rootName = (n: (typeof navList)[number]): { module: string; brandId: string } => {
    let cur = n;
    const guard = new Set<string>();
    while (cur.parent_id && navById.has(cur.parent_id) && !guard.has(cur.id)) {
      guard.add(cur.id);
      cur = navById.get(cur.parent_id)!;
    }
    return { module: cur.name, brandId: cur.brand_id };
  };
  const moduleAgg = new Map<string, PermissionModuleRow>();
  for (const n of navList) {
    if (!n.href) continue; // 只統計實際頁面（葉節點）
    const { module, brandId } = rootName(n);
    const k = `${brandId}::${module}`;
    const row =
      moduleAgg.get(k) ??
      ({ module, brandId, pageCount: 0, adminOnlyCount: 0, withPermissionCount: 0 } as PermissionModuleRow);
    row.pageCount += 1;
    if (n.is_admin_only) row.adminOnlyCount += 1;
    if (n.permission) row.withPermissionCount += 1;
    moduleAgg.set(k, row);
  }
  const permissionMatrix = Array.from(moduleAgg.values()).sort(
    (a, b) => a.brandId.localeCompare(b.brandId) || b.pageCount - a.pageCount,
  );

  return {
    tree,
    permissionMatrix,
    stats: {
      groups: groupList.length,
      subsidiaries: subList.length,
      stores: orgList.filter((o) => o.type === "store").length,
      departments: deptList.length,
      assignments: assignList.length,
    },
  };
}
