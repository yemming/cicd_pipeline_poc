"use client";

import { usePathname } from "next/navigation";
import type { ModuleDef } from "./modules";
import { useNav } from "@/components/nav-provider";

export function useActiveModule(): ModuleDef | null {
  const pathname = usePathname();
  const { resolveModuleFromPathname } = useNav();
  return resolveModuleFromPathname(pathname);
}
