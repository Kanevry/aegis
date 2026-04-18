import { AttackCompareView } from '@/components/dashboard/attack-compare-view';
import { buildSingleComparison, defaultAttackId } from '@/lib/compare-service';

export const dynamic = 'force-dynamic';

export default async function ComparePage() {
  const attackId = defaultAttackId();
  const initialData = attackId ? await buildSingleComparison({ attackId }) : null;

  return <AttackCompareView mode="compare" initialData={initialData} />;
}
