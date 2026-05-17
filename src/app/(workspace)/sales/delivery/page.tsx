import { listDeliveries } from '@/lib/deliveries';
import { DeliveryBoard } from './_components/delivery-board';

export const metadata = {
  title: '交車管理 | DealerOS',
};

const PAGE_SIZE = 30;

export default async function DeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; date_from?: string; date_to?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? '1', 10));
  const filterStatus = sp.status ?? '';
  const filterQ = sp.q ?? '';
  const filterDateFrom = sp.date_from ?? '';
  const filterDateTo = sp.date_to ?? '';

  const { rows, totalCount } = await listDeliveries(
    {
      status: filterStatus || undefined,
      q: filterQ || undefined,
      scheduled_date_from: filterDateFrom || undefined,
      scheduled_date_to: filterDateTo || undefined,
    },
    { page, pageSize: PAGE_SIZE },
  );

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
    />
  );
}
