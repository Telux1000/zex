let warned = false;

function isLocalhostUrl(raw: string): boolean {
  const value = String(raw ?? '').trim().toLowerCase();
  return (
    value.includes('localhost') ||
    value.includes('127.0.0.1') ||
    value.includes('0.0.0.0')
  );
}

export function warnIfProductionAppUrlMisconfigured(): void {
  if (warned || process.env.NODE_ENV !== 'production') return;
  warned = true;

  const appUrl = String(process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  if (!appUrl || isLocalhostUrl(appUrl)) {
    console.warn(
      '[startup-config] NEXT_PUBLIC_APP_URL is missing or points to localhost in production. Auth/payment email links may include localhost. Set NEXT_PUBLIC_APP_URL=https://www.zenzex.com in deployed environment variables.'
    );
  }
}
