'use client';

import { useEffect, useRef } from 'react';
import { IndustrySelect } from '@/components/business/IndustrySelect';
import { INDUSTRY_OTHER_KEY } from '@/lib/business/industry-options';
import { cn } from '@/lib/utils/cn';

/** Matches Business Profile label; placeholder extended for waitlist examples. */
const INDUSTRY_OTHER_LABEL = 'Tell us your industry';
const INDUSTRY_OTHER_PLACEHOLDER = 'e.g. Logistics, Events, Consulting';

type Props = {
  idPrefix: string;
  industryKey: string;
  onIndustryKeyChange: (key: string) => void;
  industryCustom: string;
  onIndustryCustomChange: (value: string) => void;
  selectClassName: string;
  inputClassName: string;
  otherFieldError?: string | null;
};

export function WaitlistIndustryFields({
  idPrefix,
  industryKey,
  onIndustryKeyChange,
  industryCustom,
  onIndustryCustomChange,
  selectClassName,
  inputClassName,
  otherFieldError,
}: Props) {
  const otherRef = useRef<HTMLInputElement>(null);
  const isOther = industryKey === INDUSTRY_OTHER_KEY;

  useEffect(() => {
    if (!isOther) return;
    const id = window.requestAnimationFrame(() => {
      otherRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [isOther]);

  return (
    <div className="min-w-0">
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
        Industry <span className="font-normal text-slate-400">(optional)</span>
      </label>
      <IndustrySelect
        id={`${idPrefix}-industry`}
        ariaLabel="Industry"
        value={industryKey}
        onChange={onIndustryKeyChange}
        placeholder="Select your industry"
        className={selectClassName}
      />
      {isOther ? (
        <div
          className="mt-2 origin-top transition-opacity duration-150 ease-out"
          id={`${idPrefix}-industry-other-block`}
        >
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor={`${idPrefix}-industry-custom`}>
            {INDUSTRY_OTHER_LABEL}
          </label>
          <input
            ref={otherRef}
            id={`${idPrefix}-industry-custom`}
            name="industry_custom"
            type="text"
            autoComplete="organization-title"
            value={industryCustom}
            onChange={(e) => onIndustryCustomChange(e.target.value)}
            placeholder={INDUSTRY_OTHER_PLACEHOLDER}
            aria-invalid={Boolean(otherFieldError)}
            aria-describedby={otherFieldError ? `${idPrefix}-industry-custom-err` : undefined}
            className={cn(
              inputClassName,
              otherFieldError && 'border-red-500 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500'
            )}
          />
          {otherFieldError ? (
            <p id={`${idPrefix}-industry-custom-err`} className="mt-1 text-xs text-red-600 dark:text-red-400" role="alert">
              {otherFieldError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
