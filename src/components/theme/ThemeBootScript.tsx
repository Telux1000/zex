import type { ThemeMode } from '@/lib/theme/constants';
import { ENVOX_CLIENT_STORAGE_MIGRATION_HEAD_SCRIPT } from '@/lib/migrations/envox-client-storage-migration';

type Props = {
  /** Logged-in user's `profiles.theme` from the server (third precedence after localStorage and cookie). */
  profileTheme: ThemeMode | null;
};

/**
 * Runs before React hydrates: localStorage → cookie → profile → `system`.
 * Migrates legacy keys into `zenzex_theme`, toggles `html.dark`, mirrors to cookie for SSR on the next request.
 */
export function ThemeBootScript({ profileTheme }: Props) {
  const p = JSON.stringify(profileTheme);
  const code = `${ENVOX_CLIENT_STORAGE_MIGRATION_HEAD_SCRIPT}(function(){try{try{var nk='zenzex_theme';if(!localStorage.getItem(nk)){var ov=localStorage.getItem('theme')||localStorage.getItem('zenzex-theme');if(ov==='light'||ov==='dark'||ov==='system')localStorage.setItem(nk,ov);}}catch(e){}var p=${p};var mq=window.matchMedia('(prefers-color-scheme: dark)');var stored=null;try{stored=localStorage.getItem('zenzex_theme')||localStorage.getItem('theme')||localStorage.getItem('zenzex-theme');}catch(e){}var ck=null;try{var cm=document.cookie.match(/(?:^|; )zenzex_theme=([^;]*)/);if(cm&&cm[1])ck=decodeURIComponent(cm[1].replace(/\\+/g,' '));}catch(e){}var mode=(stored==='light'||stored==='dark'||stored==='system')?stored:((ck==='light'||ck==='dark'||ck==='system')?ck:((p==='light'||p==='dark'||p==='system')?p:'system'));var dark=mode==='dark'||(mode==='system'&&mq.matches);document.documentElement.classList.toggle('dark',dark);try{localStorage.setItem('zenzex_theme',mode);}catch(e){}try{document.cookie='zenzex_theme='+encodeURIComponent(mode)+';path=/;max-age=31536000;SameSite=Lax';}catch(e){}}catch(e){}})();`;

  return <script dangerouslySetInnerHTML={{ __html: code }} />;
}
