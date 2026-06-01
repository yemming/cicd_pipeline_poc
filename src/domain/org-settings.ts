import "server-only";

/**
 * Domain Helper — Org Settings（系統全域設定 · org_mode）
 *
 * G3-A（集團 Phase 2，2026-06-01）新增。GRP20 組織架構設定的「組織模式」：
 *   org_mode=3 → 三層（集團→法人→門店，海德生 Indian）
 *   org_mode=4 → 四層（集團→法人→區域→門店，碩文 DUCATI）
 * org_mode 影響全系統組織樹渲染與報表篩選器，是上線前必設項。
 *
 * 資料落點：system_settings（每 group 一筆）。讀走 anon client（RLS ss_read=true），
 * 寫走 server action（is_app_admin gate）。天條：UI 不直連 supabase。
 */

import { createClient } from "@/lib/supabase/server";

export type OrgSettings = {
  groupId: string;
  groupName: string;
  orgMode: 3 | 4;
};

/** 撈目前（唯一/第一個）集團的 org_mode 設定。找不到回 null。 */
export async function getOrgSettings(): Promise<OrgSettings | null> {
  const client = await createClient();
  const { data } = await client
    .from("system_settings")
    .select("group_id, org_mode, groups(name)")
    .order("group_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as {
    group_id: string;
    org_mode: number;
    groups: { name: string | null } | { name: string | null }[] | null;
  };
  const grp = Array.isArray(row.groups) ? row.groups[0] : row.groups;
  return {
    groupId: row.group_id,
    groupName: grp?.name ?? row.group_id,
    orgMode: (row.org_mode === 4 ? 4 : 3) as 3 | 4,
  };
}
