import { PlaceholderPage } from "@/components/placeholder-page";

// 承接 nav_nodes 中 href 以 /placeholder/* 開頭但尚未落地的頁面，
// 避免點下 sidebar 後出現 Next.js 原生 404。
export default function PlaceholderCatchAllPage() {
  return (
    <PlaceholderPage
      title="即將推出"
      description="此功能正在規劃開發中，敬請期待。"
      icon="rocket_launch"
    />
  );
}
