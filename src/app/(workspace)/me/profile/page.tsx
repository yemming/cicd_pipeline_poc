import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createClient } from "@/lib/supabase/server";
import { BRAND_PALETTES } from "@/lib/brands/brand-palettes";
import { SIDEBAR_THEMES } from "@/lib/brands/sidebar-themes";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { getAccessibleScopes } from "@/lib/scope/active-scope";

import { ProfileDetailView, type ProfileRow } from "./_components/profile-detail-view";

export const dynamic = "force-dynamic";

export default async function MeProfilePage() {
  const { userId, email } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  const supabase = await createClient();
  const [{ data: profileRow }, accessible] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "id, name, address, avatar_url, avatar_path, preferred_palette_key, preferred_custom_palette, preferred_sidebar_theme_key, default_landing_path, default_brand_id, updated_at",
      )
      .eq("id", userId)
      .maybeSingle(),
    getAccessibleScopes(),
  ]);

  // 沒 row 的話補一個空殼，client view 不用處理 null
  const profile: ProfileRow = profileRow ?? {
    id: userId,
    name: null,
    address: null,
    avatar_url: null,
    avatar_path: null,
    preferred_palette_key: null,
    preferred_custom_palette: null,
    preferred_sidebar_theme_key: null,
    default_landing_path: null,
    default_brand_id: null,
    updated_at: null,
  };

  const accessibleBrands = accessible.brands.map((key) => ({
    key,
    name: brandConfigs[key]?.displayName ?? key,
  }));

  return (
    <ProfileDetailView
      profile={profile}
      email={email}
      palettes={BRAND_PALETTES}
      sidebarThemes={SIDEBAR_THEMES}
      accessibleBrands={accessibleBrands}
    />
  );
}
