import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';
import {
  SUPPORT_ATTACHMENTS_BUCKET,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
  extensionForImageMime,
  validateSupportImageFile,
} from '@/lib/support/support-attachment-validation';

export {
  SUPPORT_ATTACHMENTS_BUCKET,
  SUPPORT_ATTACHMENT_MAX_BYTES,
  SUPPORT_ATTACHMENT_MIME_TYPES,
  extensionForImageMime,
  validateSupportImageFile,
} from '@/lib/support/support-attachment-validation';

export async function ensureSupportAttachmentsBucket(service: SupabaseClient): Promise<{ ok: true } | { error: string }> {
  const { data: bucket } = await service.storage.getBucket(SUPPORT_ATTACHMENTS_BUCKET);
  if (bucket) return { ok: true };
  const { error: createErr } = await service.storage.createBucket(SUPPORT_ATTACHMENTS_BUCKET, {
    public: false,
    fileSizeLimit: SUPPORT_ATTACHMENT_MAX_BYTES,
    allowedMimeTypes: [...SUPPORT_ATTACHMENT_MIME_TYPES],
  });
  if (createErr) return { error: createErr.message || 'Failed to create attachments bucket' };
  return { ok: true };
}

export function isAttachmentPathForTicket(path: string, ticketId: string): boolean {
  const p = path.trim();
  return p.startsWith(`${ticketId}/`) && !p.includes('..');
}

export async function uploadSupportTicketImage(
  service: SupabaseClient,
  ticketId: string,
  file: File
): Promise<
  | {
      path: string;
      contentType: string;
      originalName: string;
      sizeBytes: number;
    }
  | { error: string }
> {
  const v = validateSupportImageFile(file);
  if (!v.ok) return { error: v.error };
  const ext = extensionForImageMime(file.type);
  if (!ext) return { error: 'Invalid image type.' };

  const ensured = await ensureSupportAttachmentsBucket(service);
  if ('error' in ensured) return { error: ensured.error };

  const path = `${ticketId}/${randomUUID()}.${ext}`;
  const { error } = await service.storage.from(SUPPORT_ATTACHMENTS_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) return { error: error.message || 'Upload failed' };

  return {
    path,
    contentType: file.type,
    originalName: file.name || `attachment.${ext}`,
    sizeBytes: file.size,
  };
}

export async function deleteSupportTicketObject(service: SupabaseClient, path: string): Promise<void> {
  await service.storage.from(SUPPORT_ATTACHMENTS_BUCKET).remove([path]);
}

export async function createSignedUrlForSupportAttachment(
  service: SupabaseClient,
  path: string,
  ttlSeconds = 3600
): Promise<{ url: string } | { error: string }> {
  const { data, error } = await service.storage
    .from(SUPPORT_ATTACHMENTS_BUCKET)
    .createSignedUrl(path, ttlSeconds);
  if (error || !data?.signedUrl) return { error: error?.message ?? 'Could not create link' };
  return { url: data.signedUrl };
}
