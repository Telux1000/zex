export const SUPPORT_ATTACHMENTS_BUCKET = 'support-ticket-attachments';

export const SUPPORT_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;

export const SUPPORT_ATTACHMENT_MIME_TYPES = ['image/png', 'image/jpeg'] as const;

const ACCEPTED = new Set<string>(SUPPORT_ATTACHMENT_MIME_TYPES);

export function extensionForImageMime(mime: string): string | null {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return null;
}

export function validateSupportImageFile(file: File): { ok: true } | { ok: false; error: string } {
  if (!ACCEPTED.has(file.type)) {
    return { ok: false, error: 'Only PNG and JPEG images are allowed.' };
  }
  if (file.size > SUPPORT_ATTACHMENT_MAX_BYTES) {
    return { ok: false, error: 'Image must be 5MB or smaller.' };
  }
  return { ok: true };
}
