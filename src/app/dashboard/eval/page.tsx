import { EvalMatrix } from '@/components/dashboard/eval-matrix';
import { ATTACK_LIBRARY } from '@/lib/attacks';
import { buildBatchComparison } from '@/lib/compare-service';

export default function EvalPage() {
  const payload = buildBatchComparison(ATTACK_LIBRARY.map((attack) => attack.id));

  return <EvalMatrix initialRows={payload?.rows ?? []} />;
}
