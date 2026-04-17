export default function FullscreenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 沒有 ModuleRail / PagesPanel / Topbar — 整個視窗留給畫布。
  // Auth 由 src/proxy.ts 統一處理（非 publicPaths 皆會重導 /login）。
  return <>{children}</>;
}
