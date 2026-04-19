'use client';

import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 1023px)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

/** Server snapshot: assume large layout (no mobile-only chrome hiding). */
function getServerSnapshot() {
  return false;
}

/** True when viewport is below Tailwind `lg` (1024px). */
export function useIsLgDown(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
