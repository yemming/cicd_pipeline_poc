/**
 * 站內通知收件匣 — 列出當前使用者的 user_notifications。
 * 與右上鈴鐺同源（listMyNotifications）；提供完整清單檢視。
 * 退料逾期 / TL 未結案等 cron 提醒會出現在此。
 */
import Link from "next/link";
import { listMyNotifications } from "@/domain/user-notifications";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

/** event_code → 穩定 testid（自動化測試可定位特定事件通知） */
function testIdForEvent(eventCode: string | null): string {
  switch (eventCode) {
    case "return_request.overdue":
      return "return-overdue-notification";
    case "tl_ro.closing_soon":
      return "tl_ro_pending-notification";
    default:
      return "notification-item";
  }
}

const DOT: Record<string, string> = {
  red: "bg-[#CC0000]",
  orange: "bg-[#854F0B]",
  grey: "bg-[#6B6A68]",
};

export default async function NotificationsInboxPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) {
    return <main className="px-6 py-5 text-[14px] text-[#CC0000]">請先登入</main>;
  }
  const items = await listMyNotifications();

  return (
    <main className="px-6 py-5 space-y-3" data-testid="notifications-inbox">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">通知中心</h1>
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{items.length}</b> 則通知
        </span>
      </header>

      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="notification-list"
      >
        {items.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12.5px] text-[#9A9890]">
            目前沒有通知
          </div>
        ) : (
          <ul className="divide-y divide-[#EEECE6]">
            {items.map((n) => {
              const body = (
                <div className="flex items-start gap-3 px-4 py-3">
                  <span
                    className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                      DOT[n.priority] ?? DOT.grey
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-[#2C2C2A]">
                        {n.title}
                      </span>
                      {!n.read_at && (
                        <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#FDECEA] text-[#CC0000]">
                          未讀
                        </span>
                      )}
                    </div>
                    {n.body && (
                      <p className="mt-0.5 text-[12px] text-[#5A5955] leading-snug">
                        {n.body}
                      </p>
                    )}
                    <span className="mt-1 block text-[11px] text-[#9A9890]">
                      {new Date(n.created_at).toLocaleString("zh-TW", {
                        timeZone: "Asia/Taipei",
                      })}
                    </span>
                  </div>
                </div>
              );
              return (
                <li key={n.id} data-testid={testIdForEvent(n.event_code)}>
                  {n.href ? (
                    <Link href={n.href} className="block hover:bg-[#F8F7F4]">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
