/**
 * Best-effort haptics via the Vibration API (common on Android Chrome).
 * No-op on iOS Safari and other environments without support.
 */
function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return;
  const v = navigator.vibrate;
  if (typeof v !== 'function') return;
  try {
    const seq = typeof pattern === 'number' ? [pattern] : pattern;
    v.call(navigator, seq);
  } catch {
    /* ignore */
  }
}

/** Action taps, dismissals */
export function hapticLight(): void {
  vibrate(10);
}

/** Long-press sheet presented */
export function hapticMedium(): void {
  vibrate(18);
}
