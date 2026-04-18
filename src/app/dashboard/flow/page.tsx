import { AttackCompareView } from '@/components/dashboard/attack-compare-view';
import { buildSingleComparison, defaultAttackId } from '@/lib/compare-service';

export const dynamic = 'force-dynamic';

export default async function FlowPage() {
  const attackId = defaultAttackId();
  const initialData = attackId ? await buildSingleComparison({ attackId }) : null;

  return <AttackCompareView mode="flow" initialData={initialData} />;
}
