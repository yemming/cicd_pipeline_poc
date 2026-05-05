"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  grantAdmin as grantAdminDb,
  revokeAdmin as revokeAdminDb,
} from "@/lib/admins";

async function requireAdmin(): Promise<string> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) throw new Error("只有管理員可以操作 admin 名單");
  return userId;
}

export async function grantAdminAction(fd: FormData): Promise<void> {
  const grantedBy = await requireAdmin();
  const email = String(fd.get("email") ?? "");
  const notes = String(fd.get("notes") ?? "") || null;
  await grantAdminDb({ email, grantedBy, notes });
  revalidatePath("/admin/admins");
}

export async function revokeAdminAction(email: string): Promise<void> {
  await requireAdmin();
  await revokeAdminDb(email);
  revalidatePath("/admin/admins");
}
