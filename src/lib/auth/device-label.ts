/** Human-readable device line from User-Agent (no raw UA in UI). */
export function deviceLabelFromUserAgent(ua: string): string {
  const s = ua || '';
  let browser = 'Browser';
  if (s.includes('Edg/') || s.includes('Edg ')) browser = 'Edge';
  else if (s.includes('Chrome') && !s.includes('Edg')) browser = 'Chrome';
  else if (s.includes('Firefox')) browser = 'Firefox';
  else if (s.includes('Safari') && !s.includes('Chrome')) browser = 'Safari';

  let os = 'Unknown';
  if (s.includes('Mac OS')) os = 'Mac';
  else if (s.includes('Windows')) os = 'Windows';
  else if (s.includes('Android')) os = 'Android';
  else if (s.includes('iPhone') || s.includes('iPad')) os = 'iOS';
  else if (s.includes('Linux')) os = 'Linux';

  return `${browser} on ${os}`;
}

/** Partial IP for display (avoid full address in UI). */
export function maskIpFromForwarded(forwarded: string | null): string | null {
  if (!forwarded?.trim()) return null;
  const first = forwarded.split(',')[0]?.trim();
  if (!first) return null;
  if (first.includes('.')) {
    const parts = first.split('.');
    if (parts.length === 4) return `${parts[0]}.${parts[1]}.•••.•••`;
    return '•••.•••';
  }
  if (first.includes(':')) {
    const seg = first.split(':').filter(Boolean);
    if (seg.length >= 2) return `${seg[0]}:${seg[1]}:•••`;
    return '•••';
  }
  return '—';
}
