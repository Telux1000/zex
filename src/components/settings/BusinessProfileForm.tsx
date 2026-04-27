'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  countries as locationCountries,
  getStates,
  logCountryPrefillDebug,
  normalizeCountryCode,
  resolveOnboardingUnsavedCountryPrefill,
  resolveSavedBusinessCountryCode,
  resolveSavedCountryForOnboarding,
} from '@/lib/location';
import type { Business } from '@/lib/database.types';
import { CountrySelect } from '@/components/location/CountrySelect';
import { IndustrySelect } from '@/components/business/IndustrySelect';
import {
  BUSINESS_PROFILE_FIELD_IDS,
  validateBusinessProfileInput,
  type BusinessProfileFieldKey,
} from '@/lib/business/profile';
import {
  INDUSTRY_OTHER_KEY,
  getIndustryLabelFromKey,
  isKnownIndustryKey,
} from '@/lib/business/industry-options';
import { cn } from '@/lib/utils/cn';

const labelClass = 'block text-sm font-medium text-slate-700 dark:text-slate-300';
const inputClass =
  'mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white';

/** Empty DB + common browser autofill for organization fields — show blank, not junk text. */
function normalizeInitialLegalBusinessName(raw: string | null | undefined): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (/^my business$/i.test(t)) return '';
  return t;
}

/** E.164-style entry: optional leading +, then digits only (strips spaces, dashes, etc.). */
function sanitizeBusinessPhoneInput(raw: string): string {
  let out = '';
  for (const ch of raw) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '+' && out.length === 0) out += '+';
  }
  return out;
}

type Props = {
  business: Business;
  /** Called with the row returned from PATCH so parents can refresh local state. */
  onSuccess: (updatedBusiness?: Business) => void;
  onClearSuccess: () => void;
  formId?: string;
  variant?: 'settings' | 'onboarding';
  showBuiltInSubmit?: boolean;
  onSaveError?: (message: string) => void;
  /** Settings: combined IP + Accept-Language hint. Not used for onboarding prefill. */
  suggestedCountryCode?: string | null;
  /**
   * Onboarding: server-detected country from edge IP/geo headers (e.g. `x-vercel-ip-country`).
   * Wins over locale for unsaved setup; VPN/proxy/datacenter IPs are still used as requested.
   */
  geoCountryCode?: string | null;
  /** Onboarding: Accept-Language region on the request (logged for tracing only). */
  requestLocaleCountryCode?: string | null;
  /**
   * When false (onboarding only), skip the layout effect until wizard hydration so `geoCountryCode`
   * from `/api/onboarding/state` is available before syncing. Settings should omit (defaults to true).
   */
  countryDetectionResolved?: boolean;
  /** Called only after client validation passes, immediately before saving state (e.g. parent “Saving…”). */
  onValidatedSubmitStart?: () => void;
  /** Whether current values pass {@link validateBusinessProfileInput} — for disabling external Continue. */
  onCanSubmitChange?: (canSubmit: boolean) => void;
};

export function BusinessProfileForm({
  business,
  onSuccess,
  onClearSuccess,
  formId,
  variant = 'settings',
  showBuiltInSubmit = true,
  onSaveError,
  suggestedCountryCode = null,
  geoCountryCode,
  requestLocaleCountryCode,
  countryDetectionResolved = true,
  onValidatedSubmitStart,
  onCanSubmitChange,
}: Props) {
  const onboarding = variant === 'onboarding';
  const countryDirtyRef = useRef(false);
  /** True when the field should start blank (no real saved name yet). */
  const initialLegalNameBlankRef = useRef(normalizeInitialLegalBusinessName(business.name) === '');
  const [legalNameReadOnlyBoot, setLegalNameReadOnlyBoot] = useState(
    () => initialLegalNameBlankRef.current
  );

  const [name, setName] = useState(() => normalizeInitialLegalBusinessName(business.name));
  const [logoUrl, setLogoUrl] = useState(business.logo_url ?? '');
  const [logoPreview, setLogoPreview] = useState(business.logo_url ?? '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrlInput, setLogoUrlInput] = useState('');
  const [logoRemoved, setLogoRemoved] = useState(false);
  const initialLogoUrlRef = useRef<string | null>(business.logo_url ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [email, setEmail] = useState(business.email ?? '');
  const [phone, setPhone] = useState(() => sanitizeBusinessPhoneInput(String(business.phone ?? '')));
  const [industryKey, setIndustryKey] = useState(() =>
    isKnownIndustryKey(business.industry_key ?? null) ? String(business.industry_key) : ''
  );
  const [industryOtherText, setIndustryOtherText] = useState(
    String(business.industry_other_text ?? '').trim()
  );
  const [website, setWebsite] = useState(business.website ?? '');
  const [addressLine1, setAddressLine1] = useState(business.address_line1 ?? '');
  const [addressLine2, setAddressLine2] = useState(business.address_line2 ?? '');
  const [city, setCity] = useState(business.city ?? '');
  const [state, setState] = useState(business.state ?? '');
  const [postalCode, setPostalCode] = useState(business.postal_code ?? '');
  const [country, setCountry] = useState(() => {
    const saved = onboarding
      ? resolveSavedCountryForOnboarding(business)
      : resolveSavedBusinessCountryCode(business.country);
    return saved || '';
  });

  function setCountryFromUser(next: string) {
    countryDirtyRef.current = true;
    setCountry(next);
  }

  useEffect(() => {
    if (!onCanSubmitChange) return;
    const v = validateBusinessProfileInput({
      name,
      email,
      phone,
      industry_key: industryKey || null,
      industry_other_text: industryOtherText,
      ...(onboarding
        ? {}
        : {
            address_line1: addressLine1,
            city,
            state,
            country,
          }),
    });
    onCanSubmitChange(v.valid);
  }, [
    name,
    email,
    phone,
    industryKey,
    industryOtherText,
    addressLine1,
    city,
    state,
    country,
    onboarding,
    onCanSubmitChange,
  ]);

  useLayoutEffect(() => {
    if (!onboarding) return;
    if (!countryDetectionResolved) return;

    const saved = resolveSavedCountryForOnboarding(business);
    const requestLoc = normalizeCountryCode(requestLocaleCountryCode ?? '');
    const resolution = resolveOnboardingUnsavedCountryPrefill(geoCountryCode, 'US');

    if (saved) {
      logCountryPrefillDebug({
        variant: 'onboarding',
        savedCountry: saved,
        detectedCountry: resolution.detectedFromRequest || null,
        requestAcceptLanguageRegion: requestLoc || null,
        localeFallback: resolution.localeFallback || null,
        usedStaticFallback: false,
        finalSelected: saved,
        note: 'saved business profile country (detection ignored)',
      });
      return;
    }
    if (countryDirtyRef.current) return;

    logCountryPrefillDebug({
      variant: 'onboarding',
      savedCountry: '(none)',
      detectedCountry: resolution.detectedFromRequest || null,
      requestAcceptLanguageRegion: requestLoc || null,
      localeFallback: resolution.localeFallback || null,
      usedStaticFallback: resolution.usedStaticFallback,
      finalSelected: '(empty — user selects)',
      note: resolution.detectedFromRequest
        ? 'geo detected but country left blank until user chooses'
        : resolution.localeFallback
          ? 'no server detection; country left blank until user chooses'
          : 'no detection; country left blank until user chooses',
    });
  }, [
    onboarding,
    countryDetectionResolved,
    business.id,
    business.country,
    business.email,
    business.phone,
    business.address_line1,
    geoCountryCode,
    requestLocaleCountryCode,
  ]);
  const [taxId, setTaxId] = useState(business.tax_id ?? '');
  const [registrationNumber, setRegistrationNumber] = useState(
    (business as Business & { registration_number?: string }).registration_number ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [profileFieldErrors, setProfileFieldErrors] = useState<
    Partial<Record<BusinessProfileFieldKey, string>>
  >({});
  const [profileSummary, setProfileSummary] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const supabase = createClient();

  function clearProfileField(key: BusinessProfileFieldKey) {
    setProfileFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function inputClassFor(field: BusinessProfileFieldKey) {
    return cn(
      inputClass,
      profileFieldErrors[field] &&
        'border-red-500 focus:border-red-500 focus:ring-red-500 dark:border-red-500'
    );
  }

  const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

  function normalize(str: string | null | undefined) {
    return (str ?? '').trim();
  }

  function handleAutoFillAddress() {
    const source = [addressLine1, addressLine2].filter(Boolean).join(' ').trim();
    if (!source) return;

    let working = source;

    // Detect country by name or code near the end
    let detectedCountry: string | null = null;
    const lower = working.toLowerCase();
    const sortedCountries = locationCountries.slice().sort((a, b) => b.name.length - a.name.length);
    for (const c of sortedCountries) {
      if (lower.endsWith(c.name.toLowerCase()) || lower.endsWith(c.code.toLowerCase())) {
        detectedCountry = c.code;
        const idx = lower.lastIndexOf(c.name.toLowerCase());
        if (idx !== -1) {
          working = working.slice(0, idx).trim().replace(/[,]+$/, '').trim();
        }
        break;
      }
    }

    // Fallback: if country already selected, keep it; otherwise apply detected country
    if (!country && detectedCountry) {
      setCountryFromUser(detectedCountry);
      setState(''); // force fresh selection for new country
    }

    const currentCountry = detectedCountry ?? country;

    // Try to detect postal code as last token of working string
    const parts = working.split(/[\s,]+/).filter(Boolean);
    if (parts.length > 1) {
      const lastToken = parts[parts.length - 1];
      if (!postalCode && /^[A-Za-z0-9\-]{3,10}$/.test(lastToken)) {
        setPostalCode(lastToken);
        parts.pop();
        working = parts.join(' ').trim();
      }
    }

    // Detect state/province from known list if we have a country with data
    if (currentCountry) {
      const states = getStates(currentCountry);
      if (states.length > 0 && !state) {
        const lowerWorking = working.toLowerCase();
        const matched = states.find(
          (s) =>
            lowerWorking.includes(` ${s.code.toLowerCase()} `) ||
            lowerWorking.endsWith(` ${s.code.toLowerCase()}`) ||
            lowerWorking.includes(s.name.toLowerCase())
        );
        if (matched) {
          setState(matched.code);
          // Best-effort removal of state from working string
          working = working
            .replace(new RegExp(`\\b${matched.code}\\b`, 'i'), '')
            .replace(new RegExp(matched.name, 'i'), '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/[,]+$/, '')
            .trim();
        }
      }
    }

    // Remaining chunk is a good candidate for city if empty
    if (!city && working) {
      setCity(working);
    }
  }

  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoError(null);
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLogoError('Unsupported format. Use PNG, JPG, or SVG.');
      return;
    }
    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoError('Logo is too large. Max size is 5MB.');
      return;
    }
    // Show local preview immediately
    if (logoPreview && logoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreview);
    }
    const objectUrl = URL.createObjectURL(file);
    setLogoPreview(objectUrl);
    setLogoFile(file);
    setLogoUrlInput('');
    setLogoRemoved(false);
  }

  async function handleImportLogoFromUrl(e: React.FormEvent) {
    e.preventDefault();
    setLogoError(null);
    const url = logoUrlInput.trim() || logoUrl.trim();
    if (!url) {
      setLogoError('Paste a logo image URL first.');
      return;
    }
    // Simple client-side URL validation; upload happens on Save
    if (!/^https?:\/\//i.test(url)) {
      setLogoError('Enter a valid http(s) image URL.');
      return;
    }
    if (logoPreview && logoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(logoPreview);
    }
    setLogoPreview(url);
    setLogoUrlInput(url);
    setLogoFile(null);
    setLogoRemoved(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLogoError(null);
    const v = validateBusinessProfileInput({
      name,
      email,
      phone,
      industry_key: industryKey || null,
      industry_other_text: industryOtherText,
      ...(onboarding
        ? {}
        : {
            address_line1: addressLine1,
            city,
            state,
            country,
          }),
    });
    if (!v.valid) {
      setProfileFieldErrors(v.fieldErrors);
      const n = Object.keys(v.fieldErrors).length;
      setProfileSummary(n > 1 ? `Please complete ${n} required fields.` : null);
      const first = v.firstInvalidField;
      if (first) {
        requestAnimationFrame(() => {
          const id = BUSINESS_PROFILE_FIELD_IDS[first];
          const el = document.getElementById(id);
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const focusable =
            (el?.querySelector?.(
              'input:not([type=hidden]), select, textarea, button[role="combobox"]'
            ) as HTMLElement | null) ?? el;
          focusable?.focus?.();
        });
      }
      return;
    }
    setProfileFieldErrors({});
    setProfileSummary(null);
    onValidatedSubmitStart?.();
    setSaving(true);
    onClearSuccess();
    try {
      const initialLogoUrl = initialLogoUrlRef.current;
      let nextLogoUrl: string | null = initialLogoUrl;

      // Logo is settings-only; onboarding never mutates logo (keeps existing row value).
      if (!onboarding) {
        if (logoFile) {
          const ext = (logoFile.name.split('.').pop() || 'png').toLowerCase();
          const timestamp = Date.now();
          const objectKey = `${business.id}/logo-${timestamp}.${ext}`;

          const { error } = await supabase.storage
            .from('business-logos')
            .upload(objectKey, logoFile, {
              contentType: logoFile.type || 'application/octet-stream',
              // New key every save (logo-{timestamp}); upsert is unnecessary and needs extra storage SELECT/UPDATE.
              upsert: false,
            });
          if (error) {
            setLogoError(
              error.message ||
                'Logo upload failed. Check that the "business-logos" storage bucket exists and you have permission to upload.'
            );
            throw error;
          }
          const { data } = supabase.storage.from('business-logos').getPublicUrl(objectKey);
          nextLogoUrl = data.publicUrl;
        } else if (logoUrlInput) {
          const res = await fetch(`/api/businesses/${business.id}/import-logo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: logoUrlInput }),
          });
          const data = await res.json();
          if (!res.ok) {
            setLogoError(data.error ?? 'Failed to import logo');
            throw new Error(data.error ?? 'Failed to import logo');
          }
          nextLogoUrl = data.logo_url ?? null;
        } else if (logoRemoved) {
          nextLogoUrl = null;
        }
      }

      const res = await fetch(`/api/businesses/${business.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || null,
          logo_url: nextLogoUrl,
          email: email || null,
          phone: phone || null,
          industry_key: industryKey || null,
          industry_label: getIndustryLabelFromKey(industryKey) ?? null,
          industry_other_text:
            industryKey === INDUSTRY_OTHER_KEY ? (industryOtherText.trim() || null) : null,
          website: website || null,
          ...(onboarding
            ? {}
            : {
                address_line1: addressLine1 || null,
                address_line2: addressLine2 || null,
                city: city || null,
                state: state || null,
                postal_code: postalCode || null,
                country: country || null,
              }),
          tax_id: taxId || null,
          registration_number: registrationNumber || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to save');
      const saved = (await res.json()) as Business;
      onSuccess(saved);
    } catch (err) {
      onSaveError?.(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const suppressOrgAutofill = initialLegalNameBlankRef.current;

  return (
    <form
      id={formId}
      noValidate
      autoComplete={suppressOrgAutofill ? 'off' : undefined}
      onSubmit={handleSubmit}
      className="w-full max-w-full overflow-x-hidden rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
    >
      {!onboarding ? (
        <>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Business Profile</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Your business identity on invoices, PDFs, and customer-facing email (separate from your
            personal profile under Profile).
          </p>
        </>
      ) : null}
      {profileSummary ? (
        <div
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100"
          role="alert"
        >
          {profileSummary}
        </div>
      ) : null}
      <div className="mt-6 space-y-4">
        <div id={BUSINESS_PROFILE_FIELD_IDS.name}>
          <label className={labelClass} htmlFor="business-profile-field-name-input">
            Legal or business name <span className="text-red-500">*</span>
          </label>
          <input
            id="business-profile-field-name-input"
            type="text"
            name="legal-business-name"
            value={name}
            placeholder="e.g. Acme Inc."
            autoComplete={suppressOrgAutofill ? 'off' : 'organization'}
            data-1p-ignore={suppressOrgAutofill ? true : undefined}
            data-lpignore={suppressOrgAutofill ? 'true' : undefined}
            readOnly={legalNameReadOnlyBoot}
            aria-invalid={Boolean(profileFieldErrors.name)}
            aria-describedby={profileFieldErrors.name ? 'business-profile-field-name-err' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              clearProfileField('name');
              setProfileSummary(null);
            }}
            onFocus={() => {
              if (legalNameReadOnlyBoot) setLegalNameReadOnlyBoot(false);
            }}
            className={inputClassFor('name')}
          />
          {profileFieldErrors.name ? (
            <p id="business-profile-field-name-err" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {profileFieldErrors.name}
            </p>
          ) : null}
        </div>
        {!onboarding ? (
        <div>
          <label className={labelClass}>Business logo</label>
          <div className="mt-1 space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/svg+xml"
                onChange={handleLogoFileChange}
                className="text-xs text-slate-600 dark:text-slate-300"
                ref={fileInputRef}
              />
              {logoPreview && (
                <button
                  type="button"
                  onClick={() => {
                    if (logoPreview && logoPreview.startsWith('blob:')) {
                      URL.revokeObjectURL(logoPreview);
                    }
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                    const initial = initialLogoUrlRef.current;
                    const hasPendingNew =
                      logoFile !== null ||
                      !!logoUrlInput ||
                      (logoUrl && logoUrl !== initial);

                    if (hasPendingNew) {
                      // Revert to initial saved logo (or none) – discard unsaved change
                      setLogoFile(null);
                      setLogoUrlInput('');
                      setLogoRemoved(false);
                      setLogoUrl(initial ?? '');
                      setLogoPreview(initial ?? '');
                    } else {
                      // No pending change; mark saved logo for removal
                      setLogoFile(null);
                      setLogoUrlInput('');
                      setLogoRemoved(true);
                      setLogoUrl('');
                      setLogoPreview('');
                    }
                  }}
                  className="app-btn-destructive !px-2 !py-1 !text-xs"
                >
                  Remove logo
                </button>
              )}
            </div>
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">
                Or import from URL
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="url"
                  value={logoUrlInput}
                  onChange={(e) => setLogoUrlInput(e.target.value)}
                  placeholder="https://your-logo.com/logo.png"
                  className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={handleImportLogoFromUrl}
                  className="app-btn-secondary !px-3 !py-2 !text-xs"
                >
                  Import
                </button>
              </div>
            </div>
            {logoError && (
              <p className="text-xs text-red-600 dark:text-red-400">{logoError}</p>
            )}
            {logoPreview && (
              <div className="mt-2 flex items-center gap-3">
                <div className="relative h-12 w-32 overflow-hidden rounded border border-slate-200 dark:border-slate-700">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoPreview}
                    alt={business.name}
                    className="h-full w-full object-contain object-left"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Logo appears on invoice previews, downloads, and emails.
                </p>
              </div>
            )}
          </div>
        </div>
        ) : null}
        <div className="grid gap-4 md:grid-cols-2">
          <div id={BUSINESS_PROFILE_FIELD_IDS.email}>
            <label className={labelClass} htmlFor="business-profile-field-email-input">
              Business email <span className="text-red-500">*</span>
            </label>
            <input
              id="business-profile-field-email-input"
              type="email"
              value={email}
              aria-invalid={Boolean(profileFieldErrors.email)}
              aria-describedby={profileFieldErrors.email ? 'business-profile-field-email-err' : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                clearProfileField('email');
                setProfileSummary(null);
              }}
              className={inputClassFor('email')}
              autoComplete="email"
            />
            {profileFieldErrors.email ? (
              <p id="business-profile-field-email-err" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {profileFieldErrors.email}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Shown on invoices and used as Reply-To when customers reply to invoice and quote emails.
                This is not your personal login email.
              </p>
            )}
          </div>
          <div id={BUSINESS_PROFILE_FIELD_IDS.phone}>
            <label className={labelClass} htmlFor="business-profile-field-phone-input">
              Business phone <span className="text-red-500">*</span>
            </label>
            <input
              id="business-profile-field-phone-input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="+15551234567"
              value={phone}
              aria-invalid={Boolean(profileFieldErrors.phone)}
              aria-describedby={profileFieldErrors.phone ? 'business-profile-field-phone-err' : undefined}
              onChange={(e) => {
                setPhone(sanitizeBusinessPhoneInput(e.target.value));
                clearProfileField('phone');
                setProfileSummary(null);
              }}
              className={inputClassFor('phone')}
            />
            {profileFieldErrors.phone ? (
              <p id="business-profile-field-phone-err" className="mt-1 text-xs text-red-600 dark:text-red-400">
                {profileFieldErrors.phone}
              </p>
            ) : null}
          </div>
        </div>
        <div id={BUSINESS_PROFILE_FIELD_IDS.industry_key}>
          <label className={labelClass} htmlFor="business-profile-industry">
            Industry
          </label>
          <IndustrySelect
            id="business-profile-industry"
            ariaLabel="Business industry"
            value={industryKey}
            onChange={(key) => {
              setIndustryKey(key);
              if (key !== INDUSTRY_OTHER_KEY) {
                setIndustryOtherText('');
                clearProfileField('industry_other_text');
              }
              clearProfileField('industry_key');
              setProfileSummary(null);
            }}
            placeholder="Select your industry"
            className={cn(inputClass, profileFieldErrors.industry_key && 'border-red-500 dark:border-red-500')}
          />
          {profileFieldErrors.industry_key ? (
            <p id="business-profile-field-industry-err" className="mt-1 text-xs text-red-600 dark:text-red-400">
              {profileFieldErrors.industry_key}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Help us tailor your setup and recommendations.
            </p>
          )}
        </div>
        {industryKey === INDUSTRY_OTHER_KEY ? (
          <div id={BUSINESS_PROFILE_FIELD_IDS.industry_other_text}>
            <label className={labelClass} htmlFor="business-profile-industry-other-input">
              Tell us your industry
            </label>
            <input
              id="business-profile-industry-other-input"
              type="text"
              value={industryOtherText}
              onChange={(e) => {
                setIndustryOtherText(e.target.value);
                clearProfileField('industry_other_text');
                setProfileSummary(null);
              }}
              aria-invalid={Boolean(profileFieldErrors.industry_other_text)}
              aria-describedby={
                profileFieldErrors.industry_other_text ? 'business-profile-field-industry-other-err' : undefined
              }
              className={inputClassFor('industry_other_text')}
              placeholder="e.g. Construction"
            />
            {profileFieldErrors.industry_other_text ? (
              <p
                id="business-profile-field-industry-other-err"
                className="mt-1 text-xs text-red-600 dark:text-red-400"
              >
                {profileFieldErrors.industry_other_text}
              </p>
            ) : null}
          </div>
        ) : null}
        {!onboarding ? (
        <div>
          <label className={labelClass}>Website</label>
          <input
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </div>
        ) : null}
        {!onboarding ? (
          <>
            <div id={BUSINESS_PROFILE_FIELD_IDS.address_line1}>
              <label className={labelClass} htmlFor="business-profile-field-address-line1-input">
                Business address{' '}
                <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
              </label>
              <input
                id="business-profile-field-address-line1-input"
                type="text"
                value={addressLine1}
                aria-invalid={Boolean(profileFieldErrors.address_line1)}
                aria-describedby={
                  profileFieldErrors.address_line1 ? 'business-profile-field-address-line1-err' : undefined
                }
                onChange={(e) => {
                  setAddressLine1(e.target.value);
                  clearProfileField('address_line1');
                  setProfileSummary(null);
                }}
                className={inputClassFor('address_line1')}
              />
              {profileFieldErrors.address_line1 ? (
                <p
                  id="business-profile-field-address-line1-err"
                  className="mt-1 text-xs text-red-600 dark:text-red-400"
                >
                  {profileFieldErrors.address_line1}
                </p>
              ) : null}
              <button
                type="button"
                onClick={handleAutoFillAddress}
                className="app-btn-secondary mt-2 !px-3 !py-1.5 !text-xs"
              >
                Auto-fill address details
              </button>
            </div>
            <div>
              <label className={labelClass}>Address line 2</label>
              <input
                type="text"
                value={addressLine2}
                onChange={(e) => setAddressLine2(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="space-y-4">
              <div id={BUSINESS_PROFILE_FIELD_IDS.city} className="min-w-0">
                <label className={labelClass} htmlFor="business-profile-field-city-input">
                  City <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
                </label>
                <input
                  id="business-profile-field-city-input"
                  type="text"
                  value={city}
                  aria-invalid={Boolean(profileFieldErrors.city)}
                  aria-describedby={profileFieldErrors.city ? 'business-profile-field-city-err' : undefined}
                  onChange={(e) => {
                    setCity(e.target.value);
                    clearProfileField('city');
                    setProfileSummary(null);
                  }}
                  className={inputClassFor('city')}
                />
                {profileFieldErrors.city ? (
                  <p id="business-profile-field-city-err" className="mt-1 text-xs text-red-600 dark:text-red-400">
                    {profileFieldErrors.city}
                  </p>
                ) : null}
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,13fr)_minmax(0,7fr)] md:items-start">
                <div id={BUSINESS_PROFILE_FIELD_IDS.state} className="min-w-0">
                  <label className={labelClass} htmlFor="business-profile-field-state-input">
                    State / Region
                    <span className="font-normal text-slate-500 dark:text-slate-400"> (optional)</span>
                  </label>
                  {getStates(country).length > 0 ? (
                    <select
                      id="business-profile-field-state-input"
                      value={state}
                      aria-invalid={Boolean(profileFieldErrors.state)}
                      aria-describedby={profileFieldErrors.state ? 'business-profile-field-state-err' : undefined}
                      autoComplete="address-level1"
                      onChange={(e) => {
                        setState(e.target.value);
                        clearProfileField('state');
                        setProfileSummary(null);
                      }}
                      className={inputClassFor('state')}
                    >
                      <option value="">Select…</option>
                      {getStates(country).map((s) => (
                        <option key={s.code} value={s.code}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id="business-profile-field-state-input"
                      type="text"
                      value={state}
                      onChange={(e) => {
                        setState(e.target.value);
                        clearProfileField('state');
                        setProfileSummary(null);
                      }}
                      className={inputClassFor('state')}
                      placeholder="State or region"
                      autoComplete="address-level1"
                    />
                  )}
                  {profileFieldErrors.state ? (
                    <p id="business-profile-field-state-err" className="mt-1 text-xs text-red-600 dark:text-red-400">
                      {profileFieldErrors.state}
                    </p>
                  ) : null}
                </div>
                <div className="min-w-0">
                  <label className={labelClass} htmlFor="business-profile-field-postal-input">
                    Postal Code{' '}
                    <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
                  </label>
                  <input
                    id="business-profile-field-postal-input"
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className={inputClass}
                    placeholder=""
                    autoComplete="postal-code"
                  />
                </div>
              </div>
            </div>
            <div id={BUSINESS_PROFILE_FIELD_IDS.country}>
              <label className={labelClass} htmlFor="business-profile-country">
                Country <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
              </label>
              <CountrySelect
                id="business-profile-country"
                ariaLabel="Business country"
                value={country}
                onChange={(code) => {
                  setCountryFromUser(code);
                  if (getStates(code).length > 0) {
                    setState('');
                  }
                  clearProfileField('country');
                  clearProfileField('state');
                  setProfileSummary(null);
                }}
                className={cn(inputClass, profileFieldErrors.country && 'border-red-500 dark:border-red-500')}
              />
              {profileFieldErrors.country ? (
                <p id="business-profile-field-country-err" className="mt-1 text-xs text-red-600 dark:text-red-400">
                  {profileFieldErrors.country}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
        {onboarding ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2.5 text-xs leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-400">
            Optional later: add your logo in Settings → Business Profile to personalize invoices and PDFs.
          </p>
        ) : null}
        {!onboarding ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={labelClass}>Tax ID / VAT number</label>
            <input type="text" value={taxId} onChange={(e) => setTaxId(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Business registration number</label>
            <input
              type="text"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
        ) : null}
      </div>
      {showBuiltInSubmit ? (
        <div className="mt-6">
          <button type="submit" disabled={saving} className="app-btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      ) : null}
    </form>
  );
}
