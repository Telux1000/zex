import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { assertBusinessPermission } from '@/lib/rbac/server';

const MAX_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml'];

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const gate = await assertBusinessPermission(supabase, id, user.id, 'manage_settings');
  if (!gate.ok) return gate.response;
  const { data: business } = await supabase.from('businesses').select('id').eq('id', id).single();
  if (!business) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const url = typeof body.url === 'string' ? body.url.trim() : '';
  if (!url || !/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: 'Enter a valid http(s) image URL.' }, { status: 400 });
  }

  let response: globalThis.Response;
  try {
    response = await fetch(url);
  } catch {
    return NextResponse.json({ error: 'Could not fetch logo URL.' }, { status: 400 });
  }
  if (!response.ok) {
    return NextResponse.json({ error: 'Logo URL returned an error status.' }, { status: 400 });
  }

  const contentType = response.headers.get('content-type') ?? '';
  const type = ALLOWED_TYPES.find((t) => contentType.startsWith(t));
  if (!type) {
    return NextResponse.json({ error: 'Unsupported logo format. Use PNG, JPG, or SVG.' }, { status: 400 });
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BYTES) {
    return NextResponse.json({ error: 'Logo is too large. Max size is 5MB.' }, { status: 400 });
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: 'Logo is too large. Max size is 5MB.' }, { status: 400 });
  }

  const ext =
    type === 'image/png' ? 'png' : type === 'image/svg+xml' ? 'svg' : 'jpg';
  const timestamp = Date.now();
  // object key inside the business-logos bucket: {business_id}/logo-{timestamp}.{ext}
  const objectKey = `${id}/logo-${timestamp}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('business-logos')
    .upload(objectKey, Buffer.from(arrayBuffer), { contentType: type, upsert: false });
  if (uploadError) {
    return NextResponse.json({ error: 'Failed to store logo.' }, { status: 500 });
  }

  const { data } = supabase.storage.from('business-logos').getPublicUrl(objectKey);
  const logoUrl = data.publicUrl;

  // Return stored copy; caller decides when to persist on profile
  return NextResponse.json({ logo_url: logoUrl });
}

