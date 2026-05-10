import { redirect } from "next/navigation";

// /admin/rbac 收編進 /admin/navigation 的 tabs 系統。
// 保留此 route，舊書籤直接 redirect 到「使用者授權」tab。
export default function Page() {
  redirect("/admin/navigation?tab=users");
}
