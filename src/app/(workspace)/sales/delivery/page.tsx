import { listDeliveries } from '@/lib/deliveries';
import { getDeliveryKpis, getDeliveryKanbanData } from '@/domain/sales-delivery';
import { hasPermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import { DeliveryBoard } from './_components/delivery-board';

export const metadata = {
  title: '交車管理 | DealerOS',
};

const PAGE_SIZE = 30;

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    date_from?: string;
    date_to?: string;
    page?: string;
    view?: string;
  }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const filterStatus = sp.status ?? '';
  const filterQ = sp.q ?? '';
  const filterDateFrom = sp.date_from ?? '';
  const filterDateTo = sp.date_to ?? '';
  const viewMode = sp.view === 'kanban' ? 'kanban' : 'list';

  // 權限檢查：沒看權直接擋
  if (!(await hasPermission(PERMISSIONS.SALES_ORDER_VIEW))) {
    return (
      <main className="px-6 py-10">
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12.5px] rounded-md px-4 py-3 max-w-lg">
          您沒有交車管理頁面的瀏覽權限（需要 sales.order.view）。
        </div>
      </main>
    );
  }

  const [{ rows, totalCount }, kpis, kanbanCards, canEdit] = await Promise.all([
    listDeliveries(
      {
        status: filterStatus || undefined,
        q: filterQ || undefined,
        scheduled_date_from: filterDateFrom || undefined,
        scheduled_date_to: filterDateTo || undefined,
      },
      { page, pageSize: PAGE_SIZE },
    ),
    getDeliveryKpis(),
    getDeliveryKanbanData(),
    hasPermission(PERMISSIONS.SALES_ORDER_EDIT),
  ]);

  return (
    <DeliveryBoard
      rows={rows}
      totalCount={totalCount}
      page={page}
      pageSize={PAGE_SIZE}
      filterStatus={filterStatus}
      filterQ={filterQ}
      filterDateFrom={filterDateFrom}
      filterDateTo={filterDateTo}
      viewMode={viewMode}
      kpis={kpis}
      kanbanCards={kanbanCards}
      canEdit={canEdit}
    />
  );
}
