"use client";

import { createContext, useContext } from "react";

const AdminContext = createContext(false);

export function AdminProvider({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  return <AdminContext value={isAdmin}>{children}</AdminContext>;
}

export function useIsAdmin() {
  return useContext(AdminContext);
}
