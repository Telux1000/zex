import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'Zenzex | Simple Automated Invoicing';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(140deg, #eef2ff 0%, #ffffff 55%, #e0e7ff 100%)',
          color: '#0f172a',
          padding: '56px',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: '9999px',
            background: '#eef2ff',
            color: '#4338ca',
            fontSize: 28,
            fontWeight: 700,
            padding: '12px 22px',
          }}
        >
          Zenzex
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000 }}>
          <div style={{ fontSize: 72, lineHeight: 1.05, fontWeight: 800 }}>Simple Automated Invoicing</div>
          <div style={{ fontSize: 34, lineHeight: 1.25, color: '#334155' }}>
            Create invoices faster, track payments clearly, and stay on top of revenue.
          </div>
        </div>
        <div style={{ fontSize: 24, color: '#475569' }}>zenzex.com</div>
      </div>
    ),
    size
  );
}
