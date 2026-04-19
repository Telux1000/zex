import type { ThemeMode } from '@/lib/theme/constants';
import { THEME_STORAGE_KEY, THEME_STORAGE_KEY_LEGACY } from '@/lib/theme/constants';
import { ENVOX_CLIENT_STORAGE_MIGRATION_HEAD_SCRIPT } from '@/lib/migrations/envox-client-storage-migration';

type Props = {
  serverTheme: ThemeMode | null;
};

/**
 * Runs before React: prefer server (DB) theme when logged in, else localStorage, else light.
 * Syncs DB theme into localStorage when present.
 */
export function ThemeBootScript({ serverTheme }: Props) {
  const s =
    serverTheme === null ? 'null' : serverTheme === 'light' || serverTheme === 'dark' || serverTheme === 'system'
      ? JSON.stringify(serverTheme)
      : 'null';
  const k = JSON.stringify(THEME_STORAGE_KEY);
  const kl = JSON.stringify(THEME_STORAGE_KEY_LEGACY);
  const code = `${ENVOX_CLIENT_STORAGE_MIGRATION_HEAD_SCRIPT}(function(){try{var s=${s};var k=${k};var kl=${kl};var mq=window.matchMedia('(prefers-color-scheme: dark)');var stored=null;try{stored=localStorage.getItem(k)||localStorage.getItem(kl);}catch(e){}var mode=(s==='light'||s==='dark'||s==='system')?s:((stored==='light'||stored==='dark'||stored==='system')?stored:'light');var dark=mode==='dark'||(mode==='system'&&mq.matches);document.documentElement.classList.toggle('dark',dark);if(s==='light'||s==='dark'||s==='system'){try{localStorage.setItem(k,s);localStorage.setItem(kl,s);}catch(e){}}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
