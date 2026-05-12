"use server";

/**
 * Domain Helper — Current User Profile
 *
 * client component 透過 server action 取得當前登入 user 的 id / email / profile.name
 */

import { createClient } from "@/lib/supabase/server";

export type CurrentUserProfile = {
  id: string;
  email: string | null;
  name: string | null;
};

export async function getCurrentUserProfile(): Promise<CurrentUserProfile | null> {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    name: profile?.name ?? null,
  };
}

// ─────────────────────────── /me/profile ───────────────────────────

import type { ProfileRow } from "@/app/(workspace)/me/profile/_components/profile-detail-view";

export async function getMyProfileRow(userId: string): Promise<ProfileRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(
      "id, name, address, avatar_url, avatar_path, preferred_palette_key, preferred_custom_palette, preferred_sidebar_theme_key, default_landing_path, default_brand_id, updated_at",
    )
    .eq("id", userId)
    .maybeSingle();
  return (data ?? null) as ProfileRow | null;
}
