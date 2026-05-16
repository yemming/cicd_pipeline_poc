import { type ReactNode } from "react";

import { DeliveryProvider } from "@/lib/delivery-store";

export default function DeliveryLayout({ children }: { children: ReactNode }) {
  return <DeliveryProvider>{children}</DeliveryProvider>;
}
