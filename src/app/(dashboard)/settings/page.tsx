import { Suspense } from 'react';
import { SettingsPageShell } from './SettingsPageShell';
import { SettingsPageContent } from './SettingsPageContent';
import { SettingsContentSkeleton } from './SettingsContentSkeleton';
import { SettingsPerfClient } from '@/components/settings/SettingsPerfClient';

export default function SettingsPage() {
  return (
    <div className="mx-auto mt-4 w-full max-w-7xl px-6 py-6" data-settings-shell>
      <SettingsPageShell />
      <SettingsPerfClient />
      <Suspense fallback={<SettingsContentSkeleton />}>
        <SettingsPageContent />
      </Suspense>
    </div>
  );
}
