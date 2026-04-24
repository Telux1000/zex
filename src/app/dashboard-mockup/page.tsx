import type { Metadata } from 'next';
import { SaasDashboardMockup } from '@/components/mock/SaasDashboardMockup';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function DashboardMockupPage() {
  return <SaasDashboardMockup />;
}
