"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import type { Product } from "@/lib/pos/types";
import { CartProvider } from "./cart-context";
import { ProductGrid } from "./product-grid";
import { CartPanel } from "./cart-panel";
import { PaymentWizard } from "./payment-wizard";

export function Cashier({ products }: { products: Product[] }) {
  useSetPageHeader({
    breadcrumb: [{ label: "POS 收銀", href: "/pos" }, { label: "快速收銀" }],
    hideSearch: true,
  });

  return (
    <CartProvider>
      <CashierLayout products={products} />
    </CartProvider>
  );
}

function CashierLayout({ products }: { products: Product[] }) {
  const [wizardOpen, setWizardOpen] = useState(false);

  return (
    <>
      <div className="h-[calc(100vh-96px)] grid grid-cols-[1fr_360px] gap-4 -mt-2">
        <ProductGrid products={products} />
        <CartPanel onCheckout={() => setWizardOpen(true)} />
      </div>
      <PaymentWizard open={wizardOpen} onClose={() => setWizardOpen(false)} />
    </>
  );
}
