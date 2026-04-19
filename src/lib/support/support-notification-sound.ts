const STORAGE_KEY = 'zenzex_support_message_sound';

export function getSupportSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === null) return true;
    return v === '1' || v === 'true';
  } catch {
    return true;
  }
}

export function setSupportSoundEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

const MIN_MS_BETWEEN_CHIMES = 2500;

function playChimeTone() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    osc.onended = () => ctx.close();
  } catch {
    /* ignore */
  }
}

let lastSubscriberChimeAt = 0;
let lastSubscriberChimeMessageId: string | null = null;

/** Short subtle chime; safe to call frequently — debounced internally. */
export function playSupportNotificationChime(messageId?: string) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastSubscriberChimeAt < MIN_MS_BETWEEN_CHIMES) return;
  if (messageId && messageId === lastSubscriberChimeMessageId) return;
  lastSubscriberChimeAt = now;
  if (messageId) lastSubscriberChimeMessageId = messageId;
  playChimeTone();
}

let lastAdminChimeAt = 0;
let lastAdminChimeMessageId: string | null = null;

/** Admin console chime; separate debounce from subscriber inbox. */
export function playAdminSupportNotificationChime(messageId?: string) {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  if (now - lastAdminChimeAt < MIN_MS_BETWEEN_CHIMES) return;
  if (messageId && messageId === lastAdminChimeMessageId) return;
  lastAdminChimeAt = now;
  if (messageId) lastAdminChimeMessageId = messageId;
  playChimeTone();
}
