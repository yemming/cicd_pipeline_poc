/**
 * 接待手卡列表頁（/sales/reception/handcard）
 *
 * server component — 撈 DB、鑒權、傳 props 給 HandcardBoard。
 * handcard-store（client localStorage buffer）保留不動，供「新增接待」流程使用。
 */
import { redirect } from 'next/navigation';

import { getCurrentUserAndAdmin } from '@/lib/feedback-admin';
import { hasPermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import {
  listHandcards,
  getHandcardKpis,
  getHandcardSourceDistribution,
  type HandcardFilters,
} from '@/domain/sales-handcards';
import { HandcardBoard } from './_components/handcard-board';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '接待手卡 | DealerOS',
};

export default async function HandcardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
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
  const sp = await searchParams;

  const filters: HandcardFilters = {
    status:     sp.status     ?? 'all',
    lead_grade: sp.lead_grade ?? 'all',
    q:          sp.q          ?? '',
    date_from:  sp.date_from,
    date_to:    sp.date_to,
  };

  const page = Math.max(1, Number(sp.page ?? 1));

  const [{ rows, totalCount }, kpis, sourceDist] = await Promise.all([
    listHandcards(filters, { page, pageSize: 50 }),
    getHandcardKpis(),
    getHandcardSourceDistribution({ monthsBack: 3 }),
  ]);

  return (
    <HandcardBoard
      rows={rows}
      totalCount={totalCount}
      canEdit={canEdit}
      filters={filters}
      kpis={kpis}
      sourceDist={sourceDist}
    />
  );
}
