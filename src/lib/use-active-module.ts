"use client";

import { usePathname } from "next/navigation";
import { resolveModuleFromPathname, type ModuleDef } from "./modules";

export function useActiveModule(): ModuleDef | null {
  const pathname = usePathname();
  return resolveModuleFromPathname(pathname);
}
