'use client';

import { useTheme } from '@/components/providers/theme-provider';
import type { ThemeMode } from '@/lib/theme/constants';

type Props = {
  onSuccess: () => void;
  onClearSuccess: () => void;
};

const cardClass =
  'rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

export function AppearanceSettingsForm({ onSuccess, onClearSuccess }: Props) {
  const { theme, setTheme } = useTheme();

  function handleThemeChange(next: ThemeMode) {
    onClearSuccess();
    setTheme(next);
    onSuccess();
  }

  return (
    <div className={cardClass}>
      <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Appearance</h2>
      <p className="mb-4 mt-1 text-sm text-slate-500 dark:text-slate-400">
        Color scheme for Zenzex on this device. Saved to your account when signed in.
      </p>
      <div>
        <label className={labelClass} htmlFor="settings-appearance-theme">
          Theme
        </label>
        <select
          id="settings-appearance-theme"
          value={theme}
          onChange={(e) => handleThemeChange(e.target.value as ThemeMode)}
          className={inputClass}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="system">System</option>
        </select>
      </div>
    </div>
  );
}
