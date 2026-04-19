import { Suspense } from 'react';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';

function OnboardingFallback() {
  return (
    <div className="app-card-surface mx-auto max-w-2xl p-8 text-center text-sm text-[var(--muted)]">
      Loading…
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingFallback />}>
      <OnboardingWizard />
    </Suspense>
  );
}
