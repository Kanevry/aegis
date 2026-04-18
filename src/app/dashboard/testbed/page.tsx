import TestbedPageClient from '@/components/dashboard/testbed-page-client';

export default function TestbedPage() {
  const feedbackEnabled =
    process.env.NEXT_PUBLIC_AEGIS_SENTRY_FEEDBACK_WIDGET !== 'false';

  return <TestbedPageClient feedbackEnabled={feedbackEnabled} />;
}
