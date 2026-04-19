/**
 * One-time migration: copy legacy `envox*` keys to `zenzex*` where the new key is unset.
 * Applies to localStorage, sessionStorage, and the dashboard TZ cookie.
 *
 * Head inline script must stay aligned with `migrateEnvoxClientStorage()` (see `ENVOX_CLIENT_STORAGE_MIGRATION_HEAD_SCRIPT`).
 */

const LEGACY_TZ_COOKIE = 'envox_dashboard_tz';
const NEW_TZ_COOKIE = 'zenzex_dashboard_tz';

function migrateStorage(store: Storage): void {
  for (let i = store.length - 1; i >= 0; i--) {
    const k = store.key(i);
    if (!k || !k.startsWith('envox')) continue;
    const newKey = k.replace(/^envox/, 'zenzex');
    if (store.getItem(newKey) != null) continue;
    const v = store.getItem(k);
    if (v == null) continue;
    store.setItem(newKey, v);
  }
}

function readCookieValue(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const m = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/[.$?*|{}()[\]\\/+^]/g, '\\$&')}=([^;]*)`)
  );
  if (!m?.[1]) return null;
  try {
    return decodeURIComponent(m[1].replace(/\+/g, ' '));
  } catch {
    return m[1];
  }
}

function migrateDashboardTzCookie(): void {
  if (typeof document === 'undefined') return;
  if (readCookieValue(NEW_TZ_COOKIE)) return;
  const legacy = readCookieValue(LEGACY_TZ_COOKIE);
  if (!legacy) return;
  document.cookie = `${NEW_TZ_COOKIE}=${encodeURIComponent(legacy)};path=/;max-age=31536000;SameSite=Lax`;
}

/**
 * Runs in the browser (client). Safe to call multiple times; copies only when the zenzex key is empty.
 */
export function migrateEnvoxClientStorage(): void {
  if (typeof window === 'undefined') return;
  try {
    migrateStorage(window.localStorage);
    migrateStorage(window.sessionStorage);
    migrateDashboardTzCookie();
  } catch {
    /* quota / private mode */
  }
}

/**
 * Minified IIFE for `<script dangerouslySetInnerHTML>` in document head — must run before theme boot.
 * Keep aligned with `migrateEnvoxClientStorage()`.
 */
export const ENVOX_CLIENT_STORAGE_MIGRATION_HEAD_SCRIPT = `(function(){try{var LS=localStorage,SS=sessionStorage;function m(s){for(var i=s.length-1;i>=0;i--){var k=s.key(i);if(!k||k.indexOf("envox")!==0)continue;var nk=k.replace(/^envox/,"zenzex");if(s.getItem(nk)!=null)continue;var v=s.getItem(k);if(v!=null)s.setItem(nk,v);}}m(LS);m(SS);var d=document.cookie;if(!/(?:^|; )zenzex_dashboard_tz=/.test(d)){var cm=d.match(/(?:^|; )envox_dashboard_tz=([^;]*)/);if(cm){var cv;try{cv=decodeURIComponent(cm[1])}catch(e){cv=cm[1]}document.cookie="zenzex_dashboard_tz="+encodeURIComponent(cv)+";path=/;max-age=31536000;SameSite=Lax"}}catch(e){}})();`;
