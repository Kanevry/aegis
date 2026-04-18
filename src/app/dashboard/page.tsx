import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const statCards = [
  {
    title: 'Attacks fired',
    value: '—',
    description: 'Total requests sent through the testbed',
  },
  {
    title: 'Blocked',
    value: '—',
    description: 'Requests blocked by at least one hardening layer',
  },
  {
    title: 'Avg safety score',
    value: '—',
    description: 'Mean safety score across all evaluated requests',
  },
  {
    title: 'Most-blocked layer',
    value: '—',
    description: 'The defense layer that fires most frequently',
  },
];

export default function DashboardOverviewPage() {
  return (
    <section>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-neutral-100">Overview</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Live data arrives when /api/agent/run receives its first request.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-neutral-100">{card.value}</p>
              <p className="mt-1 text-xs text-neutral-500">{card.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
