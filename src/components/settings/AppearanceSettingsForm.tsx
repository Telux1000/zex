'use client';

import { ThemeModeSegmented } from '@/components/theme/ThemeModeSegmented';

type Props = {
  onSuccess: () => void;
  onClearSuccess: () => void;
};

const cardClass =
  'rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';

export function AppearanceSettingsForm({ onSuccess, onClearSuccess }: Props) {
  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Appearance</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
        Color scheme for Zenzex. When you are signed in, your choice syncs to your profile for other devices.
      </p>
      <div>
        <span className={labelClass} id="settings-appearance-theme-label">
          Theme
        </span>
        <ThemeModeSegmented
          density="default"
          className="mt-2"
          labelledBy="settings-appearance-theme-label"
          onApplied={() => {
            onClearSuccess();
            onSuccess();
          }}
        />
      </div>
    </div>
  );
}
