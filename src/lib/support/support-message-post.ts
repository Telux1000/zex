import { validateSupportImageFile } from '@/lib/support/support-attachment-validation';

export type ParsedSupportMessagePost = {
  body: string;
  file: File | null;
};

export async function parseSupportMessagePostRequest(
  req: Request
): Promise<ParsedSupportMessagePost | { error: string }> {
  const ct = req.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const form = await req.formData();
    const body = String(form.get('body') ?? '').trim();
    const raw = form.get('file');
    const file = raw instanceof File && raw.size > 0 ? raw : null;
    if (!body && !file) {
      return { error: 'Message text or an image is required.' };
    }
    if (file) {
      const v = validateSupportImageFile(file);
      if (!v.ok) return { error: v.error };
    }
    return { body, file };
  }

  let json: { body?: string };
  try {
    json = (await req.json()) as { body?: string };
  } catch {
    return { error: 'Invalid JSON' };
  }
  const body = String(json.body ?? '').trim();
  if (!body) return { error: 'body is required' };
  return { body, file: null };
}
