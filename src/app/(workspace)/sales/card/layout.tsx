import type { ReactNode } from "react";

import { HandcardProvider } from "@/lib/handcard-store";

/**
 * Handcard layout — 包覆三 route（counter / consultant / closing）共用 client state。
 *
 * 因 Next 16 App Router 中 layout 在 segment 切換時不會 unmount，因此
 * <HandcardProvider> 維持的 React state 可跨頁同步；同時搭配 localStorage
 * 持久化，refresh / 跳 tab 也能還原。
 */
export default function CardLayout({ children }: { children: ReactNode }) {
  return <HandcardProvider>{children}</HandcardProvider>;
}
