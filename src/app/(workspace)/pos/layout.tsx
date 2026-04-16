import type { ReactNode } from "react";
import { CartProvider } from "@/components/pos/cart-context";

export default function PosLayout({ children }: { children: ReactNode }) {
  return <CartProvider>{children}</CartProvider>;
}
