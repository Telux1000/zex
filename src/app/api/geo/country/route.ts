import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import {
  countryCodeFromAcceptLanguage,
  normalizeToKnownCountryCode,
} from '@/lib/location/suggested-country-from-request';

type Source = 'ip' | 'accept-language' | 'none';

/**
 * Geo hint for the current request: IP headers when the host provides them, else Accept-Language.
 */
export async function GET() {
  const h = headers();
  const fromIpHeader =
    h.get('x-vercel-ip-country') ||
    h.get('cf-ipcountry') ||
    h.get('x-appengine-country') ||
    h.get('cloudfront-viewer-country') ||
    '';
  const ipCode = normalizeToKnownCountryCode(fromIpHeader);
  if (ipCode) {
    return NextResponse.json({ countryCode: ipCode, source: 'ip' as Source });
  }

  const fromAccept = countryCodeFromAcceptLanguage(h.get('accept-language'));
  if (fromAccept) {
    return NextResponse.json({ countryCode: fromAccept, source: 'accept-language' as Source });
  }

  return NextResponse.json({ countryCode: null, source: 'none' as Source });
}
