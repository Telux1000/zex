import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await req.formData();
    const businessId = String(form.get('business_id') ?? '').trim();
    const file = form.get('file');

    if (!businessId) return NextResponse.json({ error: 'Missing business_id' }, { status: 400 });
    if (!file || !(file instanceof File)) return NextResponse.json({ error: 'Missing file' }, { status: 400 });
    if (!ACCEPTED_TYPES.has(file.type)) {
      return NextResponse.json({ error: 'Unsupported file type. Use PNG, JPG, WEBP, or PDF.' }, { status: 400 });
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: 'File is too large. Max size is 10MB.' }, { status: 400 });
    }

    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('id', businessId)
      .eq('owner_id', user.id)
      .single();
    if (!biz) return NextResponse.json({ error: 'Business not found' }, { status: 404 });

    const ext = (file.name.split('.').pop() || (file.type === 'application/pdf' ? 'pdf' : 'bin')).toLowerCase();
    const objectKey = `${businessId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

    const service = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    const { data: bucket } = await service.storage.getBucket('expense-attachments');
    if (!bucket) {
      const { error: createBucketError } = await service.storage.createBucket('expense-attachments', {
        public: false,
        fileSizeLimit: MAX_SIZE_BYTES,
        allowedMimeTypes: Array.from(ACCEPTED_TYPES),
      });
      if (createBucketError) {
        return NextResponse.json({ error: createBucketError.message || 'Failed to initialize upload bucket' }, { status: 500 });
      }
    }

    const { error: uploadError } = await service.storage
      .from('expense-attachments')
      .upload(objectKey, file, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (uploadError) return NextResponse.json({ error: uploadError.message || 'Upload failed' }, { status: 500 });

    return NextResponse.json({
      path: objectKey,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
