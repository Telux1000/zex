import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils/cn';

export const ZENZEX_MARK_SRC = '/zenzex-mark.png';

const sizeConfig = {
  sm: { mark: 'h-7 w-7', text: 'text-sm font-semibold', gap: 'gap-2.5' },
  md: { mark: 'h-8 w-8', text: 'text-base font-semibold', gap: 'gap-3' },
  lg: { mark: 'h-10 w-10', text: 'text-2xl font-semibold', gap: 'gap-3.5' },
} as const;

/** Purple Z mark only — use in sidebars, mobile chrome, and compact UI. */
export function ZenzexLogoMark({
  className,
  priority,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} aria-hidden>
      <Image
        src={ZENZEX_MARK_SRC}
        alt=""
        width={256}
        height={256}
        priority={priority}
        className="h-full w-full object-contain"
      />
    </span>
  );
}

/** Logo mark + “Zenzex” wordmark — Stripe-style horizontal lockup. */
export function AppLogoInline({
  className,
  size = 'md',
  href,
  wordmark = true,
  priority,
}: {
  className?: string;
  size?: keyof typeof sizeConfig;
  href?: string;
  wordmark?: boolean;
  /** Pass true for above-the-fold marketing / auth headers. */
  priority?: boolean;
}) {
  const cfg = sizeConfig[size];
  const inner = (
    <>
      <ZenzexLogoMark className={cfg.mark} priority={priority} />
      {wordmark ? (
        <span className={cn('app-logo-text tracking-tight', cfg.text)}>Zenzex</span>
      ) : null}
    </>
  );
  const wrapCls = cn('inline-flex items-center', cfg.gap, className);

  if (href) {
    return (
      <Link href={href} className={wrapCls} aria-label="Zenzex home">
        {inner}
      </Link>
    );
  }
  return <div className={wrapCls}>{inner}</div>;
}
