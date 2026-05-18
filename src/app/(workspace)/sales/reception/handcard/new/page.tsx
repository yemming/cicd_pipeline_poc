/**
 * 新增接待手卡（/sales/reception/handcard/new）
 *
 * 直接進入 wizard 的 create mode。儲存後 router.push 到 /[id]。
 */
import { redirect } from 'next/navigation';

import { getCurrentUserAndAdmin } from '@/lib/feedback-admin';
import { hasPermission } from '@/lib/rbac/policies';
import { PERMISSIONS } from '@/lib/rbac/permissions';
import {
  listRevisitCandidates,
  listOwnerCandidates,
} from '@/domain/sales-handcards';
import { getVehicleModelOptions } from '@/domain/new-car-inventory';
import { HandcardDetailView } from '../[id]/_components/handcard-detail-view';

export const dynamic = 'force-dynamic';
export const metadata = { title: '新增接待手卡 | DealerOS' };

export default async function HandcardNewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect('/login');

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有建立接待手卡的權限</p>
      </main>
    );
  }

  const [vehicleModels, revisitCandidates, ownerCandidates] = await Promise.all([
    getVehicleModelOptions(),
    listRevisitCandidates({ limit: 100 }),
    listOwnerCandidates({ limit: 100 }),
  ]);

  return (
    <HandcardDetailView
      handcard={null}
      canEdit
      vehicleModels={vehicleModels.map((m) => ({ id: m.id, display_name: m.display_name }))}
      revisitCandidates={revisitCandidates}
      ownerCandidates={ownerCandidates}
      initialMode="create"
    />
  );
}
