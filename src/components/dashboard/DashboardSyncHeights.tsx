'use client';

import { useEffect } from 'react';

type Props = {
  sourceSelector: string;
  targetSelector: string;
  minWidth?: number;
};

export function DashboardSyncHeights({
  sourceSelector,
  targetSelector,
  minWidth = 1024,
}: Props) {
  useEffect(() => {
    const source = document.querySelector<HTMLElement>(sourceSelector);
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!source || !target) return;

    const mq = window.matchMedia(`(min-width: ${minWidth}px)`);

    const sync = () => {
      if (!mq.matches) {
        target.style.height = '';
        return;
      }
      const h = source.getBoundingClientRect().height;
      if (h > 0) target.style.height = `${Math.round(h)}px`;
    };

    const ro = new ResizeObserver(sync);
    ro.observe(source);
    window.addEventListener('resize', sync);
    mq.addEventListener('change', sync);
    sync();

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      mq.removeEventListener('change', sync);
      target.style.height = '';
    };
  }, [sourceSelector, targetSelector, minWidth]);

  return null;
}
