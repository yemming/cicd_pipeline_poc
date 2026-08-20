import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function genPassword() {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%";
  let pw = "";
  for (let i = 0; i < 12; i++) {
    pw += chars[crypto.randomInt(chars.length)];
  }
  return pw;
}

async function main() {
  const userId = "f33798a7-c360-434e-b072-d8d1f6d50400"; // 黃緯 willy30914@gmail.com
  const newPassword = genPassword();
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) throw error;
  console.log("OK", data.user.email, "new password:", newPassword);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
