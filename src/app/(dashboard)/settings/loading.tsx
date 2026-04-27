import { SettingsPageShell } from './SettingsPageShell';
import { SettingsContentSkeleton } from './SettingsContentSkeleton';

export default function SettingsLoading() {
  return (
    <div className="mx-auto mt-4 w-full max-w-7xl px-6 py-6" data-settings-shell>
      <SettingsPageShell />
      <SettingsContentSkeleton />
    </div>
  );
}
