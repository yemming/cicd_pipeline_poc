/**
 * 接待手卡詳情頁（/sales/reception/handcard/[id]）
 *
 * server component — 鑒權、撈單筆資料、傳給 HandcardDetailView。
 */
import { redirect } from 'next/navigation';
import { notFound } from 'next/navigation';

import { getCurrentUserAndAdmin } from '@/lib/feedback-admin';
import { hasPermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { getHandcardById } from '@/domain/sales-handcards';
import { HandcardDetailView } from './_components/handcard-detail-view';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const hc = await getHandcardById(id);
    return { title: `${hc?.customer_name ?? '接待手卡'} | DealerOS` };
  } catch {
    return { title: '接待手卡 | DealerOS' };
  }
}

export default async function HandcardDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect('/login');

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視接待手卡的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.CUSTOMER_EDIT);
  const { id } = await params;
  const handcard = await getHandcardById(id);

  if (!handcard) notFound();

  return <HandcardDetailView handcard={handcard} canEdit={canEdit} initialMode="view" />;
}
