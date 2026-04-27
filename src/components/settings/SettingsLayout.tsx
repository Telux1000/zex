'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import type { Business } from '@/lib/database.types';
import { AccountSettingsForm, type SettingsProfileCardInitial } from './AccountSettingsForm';
import { SecuritySettingsPanel } from './SecuritySettingsPanel';
import { BusinessProfileForm } from './BusinessProfileForm';
import { InvoiceSettingsForm } from './InvoiceSettingsForm';
import { FinanceCurrencySettingsForm } from './FinanceCurrencySettingsForm';
import { PaymentSettingsForm } from './PaymentSettingsForm';
import { ReminderMessagingForm } from './ReminderMessagingForm';
import { TeamPanelLazy, AuditLogGlobalPanelLazy } from './SettingsLazyPanels';
import { NotificationPreferencesForm } from './NotificationPreferencesForm';
import { AppearanceSettingsForm } from './AppearanceSettingsForm';
import type { PermissionFlags } from '@/lib/rbac/permissions';

const SECTION_META = {
  profile: {
    label: 'Profile',
    description: 'Manage your personal information',
  },
  'business-profile': {
    label: 'Business Profile',
    description: 'Update your business identity, contact details, and branding.',
  },
  appearance: {
    label: 'Appearance',
    description: 'Choose light, dark, or system theme.',
  },
  'team-members': {
    label: 'Team Members',
    description: 'Manage team access, invites, and permissions.',
  },
  'finance-currency': {
    label: 'Currency',
    description: 'Base currency for reporting and defaults; optional allowed invoice currencies.',
  },
  'invoice-settings': {
    label: 'Invoice Settings',
    description: 'Control invoice numbering, defaults, and behavior.',
  },
  'payment-methods': {
    label: 'Payment Methods',
    description: 'Configure payment channels and payout options.',
  },
  'reminder-emails': {
    label: 'Reminder emails',
    description: 'Default or custom wording for payment reminder emails.',
  },
  security: {
    label: 'Security',
    description: 'Manage your account security',
  },
  'email-preferences': {
    label: 'Email Preferences',
    description: 'Choose which email notifications you receive.',
  },
  audit: {
    label: 'Audit Log',
    description: 'Review account and team activity history.',
  },
} as const;

const GROUPED_SECTIONS = [
  {
    group: 'General',
    items: [
      { id: 'profile', label: 'Profile' },
      { id: 'business-profile', label: 'Business Profile' },
      { id: 'appearance', label: 'Appearance' },
    ],
  },
  {
    group: 'Team',
    items: [{ id: 'team-members', label: 'Team Members' }],
  },
  {
    group: 'Finance',
    items: [
      { id: 'finance-currency', label: 'Currency' },
      { id: 'invoice-settings', label: 'Invoice Settings' },
      { id: 'payment-methods', label: 'Payment Methods' },
      { id: 'reminder-emails', label: 'Reminder emails' },
    ],
  },
  {
    group: 'Security',
    items: [{ id: 'security', label: 'Password' }],
  },
  {
    group: 'Notifications',
    items: [{ id: 'email-preferences', label: 'Email Preferences' }],
  },
  {
    group: 'Activity',
    items: [{ id: 'audit', label: 'Audit Log' }],
  },
] as const;

const LEGACY_SECTION_ALIAS: Record<string, SettingsSectionId> = {
  account: 'profile',
  currency: 'finance-currency',
  invoice: 'invoice-settings',
  payment: 'payment-methods',
  notifications: 'email-preferences',
  appearance: 'appearance',
  team: 'team-members',
  users: 'team-members',
  tax: 'invoice-settings',
  customer: 'invoice-settings',
  reminders: 'reminder-emails',
};

export type SettingsSectionId = keyof typeof SECTION_META;

type Props = {
  business: Business | null;
  permissionFlags: PermissionFlags;
  hasFinancialRecords: boolean;
  /** Request-derived hint when the business row has no country yet (IP, then Accept-Language). */
  suggestedCountryCode?: string | null;
  /** RSC-hydrated profile row so the Profile section avoids a client waterfall on `/api/profile`. */
  profileCardInitial?: SettingsProfileCardInitial | null;
};
type MobileCategoryId = 'general' | 'team' | 'finance' | 'security' | 'notifications' | 'activity';

function Icon({ d, className = 'h-4 w-4' }: { d: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return <Icon d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" className={className} />;
}

function ChevronRightIcon() {
  return <Icon d="m9 6 6 6-6 6" className="h-4 w-4" />;
}

const MOBILE_GROUP_ICONS: Record<MobileCategoryId, string> = {
  general: 'M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Zm9-5v5l3 3',
  team: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m21 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  finance: 'M3 3v18h18M7 15l3-3 3 2 4-5',
  security: 'M12 3 4 7v5c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Z',
  notifications: 'M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8M13.73 21a2 2 0 0 1-3.46 0',
  activity: 'M3 12h4l2-6 4 12 2-6h6',
};

const MOBILE_ITEM_ICONS: Partial<Record<SettingsSectionId, string>> = {
  profile: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2m12-14a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  'business-profile': 'M3 21h18M5 21V8l7-4 7 4v13M9 12h6',
  appearance: 'M12 3a9 9 0 1 0 9 9M12 3v9l6 3',
  'team-members': 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m21 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  'finance-currency': 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  'invoice-settings': 'M8 3h8l5 5v13H3V3h5Zm8 0v5h5',
  'payment-methods': 'M3 7h18v10H3zM3 11h18',
  'reminder-emails': 'M4 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4zm0 4h8v2H4',
  security: 'M12 3 4 7v5c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V7l-8-4Z',
  'email-preferences': 'M4 6h16v12H4zM4 7l8 6 8-6',
  audit: 'M3 12h4l2-6 4 12 2-6h6',
};

function sectionVisible(id: SettingsSectionId, flags: PermissionFlags): boolean {
  if (id === 'profile' || id === 'appearance' || id === 'security') return true;
  if (id === 'team-members' || id === 'audit') return flags.viewData;
  return flags.manageSettings;
}

function mobileCategoryForSection(section: SettingsSectionId): MobileCategoryId {
  if (section === 'profile' || section === 'business-profile' || section === 'appearance') return 'general';
  if (section === 'team-members') return 'team';
  if (
    section === 'finance-currency' ||
    section === 'invoice-settings' ||
    section === 'payment-methods' ||
    section === 'reminder-emails'
  )
    return 'finance';
  if (section === 'security') return 'security';
  if (section === 'email-preferences') return 'notifications';
  return 'activity';
}

export function SettingsLayout({
  business,
  permissionFlags,
  hasFinancialRecords,
  suggestedCountryCode = null,
  profileCardInitial = null,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const raw = searchParams.get('section');
  const normalized = raw ? LEGACY_SECTION_ALIAS[raw] ?? (raw as SettingsSectionId) : 'profile';
  const section = normalized || 'profile';
  const focusFullName = searchParams.get('focus') === 'full_name';
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [mobileView, setMobileView] = useState<'home' | 'detail'>(raw ? 'detail' : 'home');
  const [mobileCategory, setMobileCategory] = useState<MobileCategoryId>(
    mobileCategoryForSection(section)
  );

  useEffect(() => setSaveSuccess(null), [section]);

  if (!business) {
    return (
      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          We couldn&apos;t load a workspace for these settings. Continue guided setup to create or join one.
        </p>
        <Link
          href="/onboarding?step=1"
          className="mt-3 inline-flex text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Continue setup
        </Link>
      </div>
    );
  }

  const navGroups = GROUPED_SECTIONS.map((group) => ({
    group: group.group,
    items: group.items.filter((item) => sectionVisible(item.id, permissionFlags)),
  })).filter((group) => group.items.length > 0);
  const mobileCategorySections: Record<MobileCategoryId, SettingsSectionId[]> = {
    general: ['profile', 'business-profile', 'appearance'],
    team: ['team-members'],
    finance: ['finance-currency', 'invoice-settings', 'payment-methods', 'reminder-emails'],
    security: ['security'],
    notifications: ['email-preferences'],
    activity: ['audit'],
  };
  const navSections = navGroups.flatMap((group) => group.items);

  const mobileCategories = useMemo(() => {
    const list: { id: MobileCategoryId; label: string }[] = [
      { id: 'general', label: 'General' },
      { id: 'team', label: 'Team' },
      { id: 'finance', label: 'Finance' },
      { id: 'security', label: 'Security' },
      { id: 'notifications', label: 'Notifications' },
    ];
    if (sectionVisible('audit', permissionFlags)) {
      list.push({ id: 'activity', label: 'Activity' });
    }
    return list;
  }, [permissionFlags]);

  const filteredMobileCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mobileCategories;
    return mobileCategories.filter((category) => {
      if (category.label.toLowerCase().includes(q)) return true;
      const ids = mobileCategorySections[category.id].filter((id) =>
        id === 'audit' ? sectionVisible('audit', permissionFlags) : navSections.some((s) => s.id === id)
      );
      return ids.some((id) => SECTION_META[id].label.toLowerCase().includes(q));
    });
  }, [query, mobileCategories, navSections, permissionFlags]);

  const filteredMobileItems = useMemo(() => {
    const base = mobileCategorySections[mobileCategory].filter((id) =>
      id === 'audit' ? sectionVisible('audit', permissionFlags) : navSections.some((s) => s.id === id)
    );
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((itemId) => SECTION_META[itemId].label.toLowerCase().includes(q));
  }, [query, mobileCategory, navSections, permissionFlags]);
  const sectionAllowed = navSections.some((s) => s.id === section) || section === 'audit';
  const active = sectionAllowed ? section : 'profile';

  function hrefFor(id: SettingsSectionId) {
    return `?section=${id}`;
  }

  function onSelectSection(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('section', next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav
        className="shrink-0"
        aria-label="Settings categories"
      >
        <div className="space-y-4 lg:hidden">
          <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
            <div className="flex items-center justify-between gap-3">
              {mobileView === 'detail' ? (
                <button
                  type="button"
                  onClick={() => setMobileView('home')}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-600 transition duration-150 hover:bg-slate-100 active:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:active:bg-slate-800"
                  aria-label="Back to settings categories"
                >
                  <Icon d="m15 18-6-6 6-6" className="h-5 w-5" />
                </button>
              ) : (
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Settings</h2>
              )}
              <div className="min-w-0 flex-1">
                {mobileView === 'detail' && (
                  <p className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {mobileCategories.find((c) => c.id === mobileCategory)?.label}
                  </p>
                )}
              </div>
              <div className="w-9 shrink-0" aria-hidden />
            </div>
            <div className="relative mt-3">
              <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-slate-400 dark:text-slate-500">
                <SearchIcon className="h-4 w-4" />
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search settings"
                className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-10 text-sm text-slate-900 shadow-sm transition duration-150 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                aria-label="Search settings"
                autoComplete="off"
              />
              {query ? (
                <button
                  type="button"
                  className="absolute right-1.5 top-1/2 z-[1] -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition duration-150 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>
          <div className="space-y-4 transition-all duration-200">
            {mobileView === 'home' ? (
              filteredMobileCategories.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No settings found</p>
                </div>
              ) : (
                filteredMobileCategories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      setMobileCategory(category.id);
                      const firstSection = mobileCategorySections[category.id][0];
                      onSelectSection(firstSection);
                      setMobileView('detail');
                    }}
                    className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition duration-150 active:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:active:bg-slate-800"
                  >
                    <span className="flex items-center gap-3">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                        <Icon d={MOBILE_GROUP_ICONS[category.id]} className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                        {category.label}
                      </span>
                    </span>
                    <span className="text-slate-400 dark:text-slate-500">
                      <ChevronRightIcon />
                    </span>
                  </button>
                ))
              )
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  {filteredMobileItems.length === 0 ? (
                    <p className="py-6 text-center text-sm font-medium text-slate-600 dark:text-slate-400">
                      No settings found
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {filteredMobileItems.map((itemId) => (
                        <button
                          key={itemId}
                          type="button"
                          onClick={() => onSelectSection(itemId)}
                          className={cn(
                            'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition duration-150 active:bg-slate-100 dark:active:bg-slate-800',
                            active === itemId
                              ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300'
                              : 'text-slate-700 dark:text-slate-300'
                          )}
                        >
                          <span className="flex items-center gap-3 text-sm font-medium">
                            <span className="text-slate-400 dark:text-slate-500">
                              <Icon d={MOBILE_ITEM_ICONS[itemId] ?? MOBILE_ITEM_ICONS.profile!} />
                            </span>
                            {SECTION_META[itemId].label}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500">
                            <ChevronRightIcon />
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {saveSuccess && (
                  <div
                    role="alert"
                    className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
                  >
                    {saveSuccess}
                  </div>
                )}
                {sectionAllowed && active === 'profile' && (
                  <AccountSettingsForm
                    profileCardInitial={profileCardInitial}
                    focusFullNameOnMount={focusFullName}
                    onSuccess={() => {
                      router.refresh();
                      setSaveSuccess('Profile saved.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'business-profile' && (
                  <BusinessProfileForm
                    business={business}
                    suggestedCountryCode={suggestedCountryCode}
                    onSuccess={() => {
                      router.refresh();
                      setSaveSuccess('Business profile saved.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'appearance' && (
                  <AppearanceSettingsForm
                    onSuccess={() => {
                      setSaveSuccess('Appearance saved.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'finance-currency' && (
                  <FinanceCurrencySettingsForm
                    business={business}
                    hasFinancialRecords={hasFinancialRecords}
                    onSuccess={() => {
                      router.refresh();
                      setSaveSuccess('Currency settings saved.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'invoice-settings' && (
                  <InvoiceSettingsForm
                    business={business}
                    onSuccess={() => {
                      setSaveSuccess('Invoice settings saved.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'payment-methods' && (
                  <PaymentSettingsForm
                    business={business}
                    onSuccess={() => {
                      setSaveSuccess('Payment settings saved.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'reminder-emails' && (
                  <ReminderMessagingForm
                    business={business}
                    onSuccess={() => {
                      router.refresh();
                      setSaveSuccess('Reminder email copy saved.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'email-preferences' && (
                  <NotificationPreferencesForm
                    onSuccess={() => {
                      setSaveSuccess('Notification preferences saved.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'security' && (
                  <SecuritySettingsPanel
                    onPasswordSuccess={() => {
                      setSaveSuccess('Password updated.');
                      setTimeout(() => setSaveSuccess(null), 4000);
                    }}
                    onClearSuccess={() => setSaveSuccess(null)}
                  />
                )}
                {sectionAllowed && active === 'team-members' && <TeamPanelLazy business={business} />}
                {sectionAllowed && active === 'audit' && <AuditLogGlobalPanelLazy businessId={business.id} />}
              </>
            )}
          </div>
        </div>
        <div className="hidden h-full min-h-[640px] w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:block">
          {navGroups.map((group, idx) => (
            <div key={group.group} className={cn(idx > 0 && 'mt-4 border-t border-slate-200 pt-4 dark:border-slate-800')}>
              <p className="mb-2 mt-1 px-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                {group.group}
              </p>
              <ul className="mt-1 space-y-0.5">
                {group.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={hrefFor(item.id)}
                      className={cn(
                        'block rounded-md px-3 py-2 text-sm font-medium transition duration-150',
                        active === item.id
                          ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      )}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="hidden min-w-0 flex-1 space-y-6 px-0 lg:block lg:px-6 lg:py-1">
        {saveSuccess && (
          <div
            role="alert"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 shadow-sm dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300"
          >
            {saveSuccess}
          </div>
        )}

        {!sectionAllowed && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              You don&apos;t have permission to view this section.
            </p>
            <Link
              href="?section=profile"
              className="mt-3 inline-block text-sm font-medium text-zenzex-600 hover:underline"
            >
              Go to Profile
            </Link>
          </div>
        )}

        {sectionAllowed && active === 'profile' && (
          <AccountSettingsForm
            profileCardInitial={profileCardInitial}
            focusFullNameOnMount={focusFullName}
            onSuccess={() => {
              router.refresh();
              setSaveSuccess('Profile saved.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'business-profile' && (
          <BusinessProfileForm
            business={business}
            suggestedCountryCode={suggestedCountryCode}
            onSuccess={() => {
              router.refresh();
              setSaveSuccess('Business profile saved.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'appearance' && (
          <AppearanceSettingsForm
            onSuccess={() => {
              setSaveSuccess('Appearance saved.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'finance-currency' && (
          <FinanceCurrencySettingsForm
            business={business}
            hasFinancialRecords={hasFinancialRecords}
            onSuccess={() => {
              router.refresh();
              setSaveSuccess('Currency settings saved.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'invoice-settings' && (
          <InvoiceSettingsForm
            business={business}
            onSuccess={() => {
              setSaveSuccess('Invoice settings saved.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'payment-methods' && (
          <PaymentSettingsForm
            business={business}
            onSuccess={() => {
              setSaveSuccess('Payment settings saved.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'reminder-emails' && (
          <ReminderMessagingForm
            business={business}
            onSuccess={() => {
              router.refresh();
              setSaveSuccess('Reminder email copy saved.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'email-preferences' && (
          <NotificationPreferencesForm
            onSuccess={() => {
              setSaveSuccess('Notification preferences saved.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'security' && (
          <SecuritySettingsPanel
            onPasswordSuccess={() => {
              setSaveSuccess('Password updated.');
              setTimeout(() => setSaveSuccess(null), 4000);
            }}
            onClearSuccess={() => setSaveSuccess(null)}
          />
        )}
        {sectionAllowed && active === 'team-members' && <TeamPanelLazy business={business} />}
        {sectionAllowed && active === 'audit' && <AuditLogGlobalPanelLazy businessId={business.id} />}
      </div>
    </div>
  );
}
