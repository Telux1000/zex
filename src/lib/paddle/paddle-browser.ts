/**
 * Client-only Paddle.js loader + one-time initialization (shared across the app).
 * Safe to import from any client component; no-ops on the server if referenced indirectly.
 */

const PADDLE_SCRIPT_SRC = 'https://cdn.paddle.com/paddle/v2/paddle.js';
const IS_DEV = process.env.NODE_ENV !== 'production';

export type PaddleCheckoutItem = { priceId: string; quantity: number };

export interface PaddleJs {
  Environment: { set: (env: 'sandbox' | 'production') => void };
  Initialize: (options: { token: string }) => void;
  Checkout: { open: (options: { items: PaddleCheckoutItem[] }) => void };
}

declare global {
  interface Window {
    Paddle?: PaddleJs;
  }
}

let paddleReadyPromise: Promise<void> | null = null;

function getClientToken(): string | undefined {
  return process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN?.trim() || undefined;
}

export type PaddleRuntimeEnvironment = 'sandbox' | 'production';

function normalizePaddleEnvironment(raw: string | undefined): PaddleRuntimeEnvironment {
  const value = raw?.trim().toLowerCase();
  if (!value || value === 'sandbox' || value === 'test') return 'sandbox';
  if (value === 'production' || value === 'live') return 'production';
  console.error(
    `[Paddle] Invalid environment "${raw}". Expected "sandbox" or "production/live". Falling back to sandbox.`
  );
  return 'sandbox';
}

export function getPaddleEnvironment(): PaddleRuntimeEnvironment {
  return normalizePaddleEnvironment(
    process.env.PADDLE_BILLING_ENVIRONMENT ?? process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT
  );
}

function loadPaddleScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    if (window.Paddle) {
      resolve();
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PADDLE_SCRIPT_SRC}"]`);
    if (existing) {
      const onLoad = () => {
        if (window.Paddle) resolve();
        else reject(new Error('Paddle.js loaded but window.Paddle is missing.'));
      };
      if (existing.dataset.paddleLoaded === 'true' || window.Paddle) {
        onLoad();
        return;
      }
      existing.addEventListener('load', () => {
        existing.dataset.paddleLoaded = 'true';
        onLoad();
      });
      existing.addEventListener('error', () => {
        console.error('[Paddle] Failed to load Paddle.js (existing script node).');
        reject(new Error('Paddle.js failed to load.'));
      });
      return;
    }

    const script = document.createElement('script');
    script.src = PADDLE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      script.dataset.paddleLoaded = 'true';
      if (window.Paddle) resolve();
      else reject(new Error('Paddle.js loaded but window.Paddle is missing.'));
    };
    script.onerror = () => {
      console.error('[Paddle] Failed to load Paddle.js from CDN:', PADDLE_SCRIPT_SRC);
      reject(new Error('Paddle.js failed to load.'));
    };
    document.head.appendChild(script);
  });
}

/**
 * Loads paddle.js once, sets environment, and initializes Paddle. Safe to call from multiple components.
 * Rejects with a clear reason if the token is missing or the script fails.
 */
export function ensurePaddleReady(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }

  if (!paddleReadyPromise) {
    paddleReadyPromise = (async () => {
      const token = getClientToken();
      if (!token) {
        console.error(
          '[Paddle] NEXT_PUBLIC_PADDLE_CLIENT_TOKEN is missing. Add it to your environment to enable Paddle Checkout.'
        );
        throw new Error('Missing NEXT_PUBLIC_PADDLE_CLIENT_TOKEN');
      }

      try {
        await loadPaddleScript();
      } catch (e) {
        console.error('[Paddle] Paddle.js did not load correctly.', e);
        throw e;
      }

      const Paddle = window.Paddle;
      if (!Paddle) {
        const err = new Error('window.Paddle is undefined after loading paddle.js');
        console.error('[Paddle] Cannot initialize: window.Paddle is missing.', err);
        throw err;
      }

      const env = getPaddleEnvironment();
      if (env === 'sandbox') {
        Paddle.Environment.set('sandbox');
      }
      if (IS_DEV) {
        console.info(`[Paddle] Initializing Paddle.js in ${env} mode.`);
      }

      Paddle.Initialize({ token });
      if (IS_DEV) {
        console.info('[Paddle] Paddle initialized.');
      }
    })();
  }

  return paddleReadyPromise;
}

export function openPaddleCheckout(priceId: string): Promise<void> {
  const trimmedPriceId = priceId.trim();
  if (!trimmedPriceId) {
    console.error('[Paddle] Cannot open checkout: missing priceId.');
    return Promise.reject(new Error('Missing priceId'));
  }

  return ensurePaddleReady().then(() => {
    const Paddle = window.Paddle;
    if (!Paddle) {
      console.error('[Paddle] Checkout.open called but Paddle is not available.');
      return;
    }
    if (IS_DEV) {
      console.info('[Paddle] Opening checkout.', {
        environment: getPaddleEnvironment(),
        priceId: trimmedPriceId,
        initialized: Boolean(window.Paddle),
      });
    }
    Paddle.Checkout.open({
      items: [{ priceId: trimmedPriceId, quantity: 1 }],
    });
  });
}
