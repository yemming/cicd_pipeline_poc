"use client";

import type { ModuleDef } from "./modules";
import { useNav } from "@/components/nav-provider";

export function useActiveModule(): ModuleDef | null {
  // 直接讀 NavProvider 算好的 sticky activeModule（含別名頁歸屬處理），
  // 不再自己用 pathname 解析，避免別名頁 sidebar 跳到別的 module。
  return useNav().activeModule;
}
