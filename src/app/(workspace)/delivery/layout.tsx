import { type ReactNode } from "react";

/**
 * 交車 wizard layout — 已退役 client mock store（delivery-store）。
 * 每個 step 頁改為 server 載入真實 deliveries row、view 走 server action 寫 DB，
 * 跨步驟以 `?deliveryId=` 串接，不再需要 Provider 共享 client state。
 */
export default function DeliveryLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
