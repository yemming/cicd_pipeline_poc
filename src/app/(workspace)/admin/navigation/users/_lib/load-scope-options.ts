import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

/**
 * 給 user-assignments detail / new 頁共用：撈三層 scope 選項 + roles。
 */
export async function loadScopeOptions() {
  const sb = createServiceClient();
  const [{ data: groups }, { data: brands }, { data: stores }, { data: roles }] =
    await Promise.all([
      sb.from("groups").select("id, name").order("id"),
      sb.from("brands").select("id, name").order("id"),
      sb
        .from("organizations")
        .select("id, name, brand_id, group_id")
        .eq("is_active", true)
        .order("brand_id")
        .order("name"),
      sb.from("roles").select("id, name, description").order("id"),
    ]);
  return {
    groups: groups ?? [],
    brands: brands ?? [],
    stores: stores ?? [],
    roles: roles ?? [],
  };
}
