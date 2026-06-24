/**
 * 接待手卡詳情頁（/sales/reception/handcard/[id]）
 *
 * server component — 鑒權、撈單筆資料 + 字典 + picker 候選清單，傳給 wizard。
 */
import { notFound, redirect } from 'next/navigation';

import { getCurrentUserAndAdmin } from '@/lib/feedback-admin';
import { hasPermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import {
  getHandcardById,
  listRevisitCandidates,
  listOwnerCandidates,
  listLeadSourceOptions,
} from '@/domain/sales-handcards';
import { getVehicleModelOptions } from '@/domain/new-car-inventory';
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mode?: string }>;
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
  const sp = (await searchParams) ?? {};

  const [handcard, vehicleModels, revisitCandidates, ownerCandidates, leadSources] =
    await Promise.all([
      getHandcardById(id),
      getVehicleModelOptions(),
      listRevisitCandidates({ excludeId: id, limit: 100 }),
      listOwnerCandidates({ limit: 100 }),
      listLeadSourceOptions(),
    ]);

  if (!handcard) notFound();

  const initialMode = sp.mode === 'edit' && canEdit ? 'edit' : 'view';

  return (
    <HandcardDetailView
      handcard={handcard}
      canEdit={canEdit}
      vehicleModels={vehicleModels.map((m) => ({ id: m.id, display_name: m.display_name }))}
      revisitCandidates={revisitCandidates}
      ownerCandidates={ownerCandidates}
      leadSources={leadSources}
      initialMode={initialMode}
    />
  );
}
