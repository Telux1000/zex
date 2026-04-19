'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { UploadCloud, FileText, ImageIcon, Eye, RefreshCw, Trash2 } from 'lucide-react';
import ExpenseAttachmentPreviewModal from './ExpenseAttachmentPreviewModal';

export type ExpenseAttachmentValue = {
  url: string | null;
  name: string | null;
  type: string | null;
  size: number | null;
};

type Props = {
  businessId: string;
  value: ExpenseAttachmentValue;
  onChange: (value: ExpenseAttachmentValue) => void;
  disabled?: boolean;
};

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

function fileSizeLabel(size: number | null) {
  if (!size || size <= 0) return '';
  const mb = size / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function isImageType(type: string | null, url: string | null) {
  if (type?.startsWith('image/')) return true;
  return Boolean(url && /\.(png|jpg|jpeg|webp)$/i.test(url));
}

function isPdfType(type: string | null, url: string | null) {
  if (type === 'application/pdf') return true;
  return Boolean(url && /\.pdf$/i.test(url));
}

function isHttpUrl(s: string) {
  return /^https?:\/\//i.test(s);
}

function isStoragePath(s: string) {
  return !isHttpUrl(s) && !s.startsWith('blob:');
}

export default function ExpenseAttachmentUpload({ businessId, value, onChange, disabled = false }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Local file blob URL (unsaved pick / just uploaded in-session) */
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  /** Signed or public URL for saved storage paths (valid for <img> and View) */
  const [resolvedRemoteUrl, setResolvedRemoteUrl] = useState<string | null>(null);
  const [resolvingRemote, setResolvingRemote] = useState(false);
  const [openingView, setOpeningView] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const resolveSignedUrl = useCallback(
    async (pathOrUrl: string) => {
      if (isHttpUrl(pathOrUrl)) return pathOrUrl;
      const res = await fetch('/api/expenses/attachment-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business_id: businessId, path: pathOrUrl, ttl_seconds: 3600 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? 'Unable to open attachment');
      return String(data.url);
    },
    [businessId]
  );

  useEffect(() => {
    const raw = value.url?.trim() ?? '';
    if (!raw) {
      setResolvedRemoteUrl(null);
      setResolvingRemote(false);
      return;
    }
    if (isHttpUrl(raw)) {
      setResolvedRemoteUrl(raw);
      setResolvingRemote(false);
      return;
    }
    if (!isStoragePath(raw)) {
      setResolvedRemoteUrl(null);
      setResolvingRemote(false);
      return;
    }

    let cancelled = false;
    setResolvingRemote(true);
    setResolvedRemoteUrl(null);
    resolveSignedUrl(raw)
      .then((url) => {
        if (!cancelled) setResolvedRemoteUrl(url);
      })
      .catch(() => {
        if (!cancelled) setResolvedRemoteUrl(null);
      })
      .finally(() => {
        if (!cancelled) setResolvingRemote(false);
      });

    return () => {
      cancelled = true;
    };
  }, [value.url, resolveSignedUrl]);

  const imageThumbnailSrc = useMemo(() => {
    if (localPreviewUrl && isImageType(value.type, localPreviewUrl)) return localPreviewUrl;
    if (resolvedRemoteUrl && isImageType(value.type, value.url)) return resolvedRemoteUrl;
    return null;
  }, [localPreviewUrl, resolvedRemoteUrl, value.type, value.url]);

  useEffect(() => {
    return () => {
      if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    };
  }, [localPreviewUrl]);

  useEffect(() => {
    if (!value.url && !value.name && !value.type && !value.size) {
      setLocalPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    }
  }, [value.url, value.name, value.type, value.size]);

  const openPicker = () => {
    if (disabled || uploading) return;
    inputRef.current?.click();
  };

  const clearAttachment = () => {
    if (disabled || uploading) return;
    if (localPreviewUrl) {
      URL.revokeObjectURL(localPreviewUrl);
      setLocalPreviewUrl(null);
    }
    setError(null);
    setResolvedRemoteUrl(null);
    onChange({ url: null, name: null, type: null, size: null });
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Unsupported file type. Use PNG, JPG, WEBP, or PDF.');
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      setError('File is too large. Max size is 10MB.');
      return;
    }

    if (localPreviewUrl) URL.revokeObjectURL(localPreviewUrl);
    setLocalPreviewUrl(URL.createObjectURL(file));

    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('business_id', businessId);
      const res = await fetch('/api/expenses/attachment', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');

      onChange({
        url: data.path ?? data.url ?? null,
        name: data.name ?? file.name,
        type: data.type ?? file.type,
        size: Number.isFinite(Number(data.size)) ? Number(data.size) : file.size,
      });
    } catch (err) {
      setError('Something went wrong. Please retry');
    } finally {
      setUploading(false);
    }
  };

  const hasAttachment = Boolean(value.url);

  const viewOpenTarget = useMemo(() => {
    if (localPreviewUrl) return localPreviewUrl;
    const raw = value.url?.trim() ?? '';
    if (!raw) return null;
    if (isHttpUrl(raw)) return raw;
    return resolvedRemoteUrl;
  }, [localPreviewUrl, value.url, resolvedRemoteUrl]);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        Attachment <span className="font-normal text-slate-500 dark:text-slate-400">(optional)</span>
      </label>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleFileChange}
        disabled={disabled || uploading}
        aria-label="Upload attachment"
      />

      {!hasAttachment ? (
        <button
          type="button"
          onClick={openPicker}
          disabled={disabled || uploading}
          className="group w-full rounded-xl border border-dashed border-slate-300 bg-slate-50/60 p-4 text-left transition-colors hover:border-indigo-300 hover:bg-indigo-500/[0.04] disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-400/5"
        >
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-white p-2 text-slate-500 shadow-sm group-hover:text-indigo-600 dark:bg-slate-700 dark:text-slate-300 dark:group-hover:text-indigo-300">
              <UploadCloud className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {uploading ? 'Uploading attachment…' : 'Upload receipt, invoice, or supporting file'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">PNG, JPG, WEBP, or PDF (max 10MB)</p>
              <span className="mt-2 inline-flex rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm dark:bg-indigo-500">
                Upload Attachment
              </span>
            </div>
          </div>
        </button>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800/70">
          <div className="flex items-start gap-3">
            <div className="shrink-0 rounded-lg bg-slate-100 p-2 text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              {isImageType(value.type, value.url) ? <ImageIcon className="h-4 w-4" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{value.name || 'Attachment'}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {isPdfType(value.type, value.url) ? 'PDF Document' : 'Image File'}
                {value.size ? ` · ${fileSizeLabel(value.size)}` : ''}
              </p>
            </div>
          </div>
          {isImageType(value.type, value.url) ? (
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
              {resolvingRemote && !imageThumbnailSrc ? (
                <div className="flex h-36 w-full items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Preparing preview…
                </div>
              ) : imageThumbnailSrc ? (
                <img
                  src={imageThumbnailSrc}
                  alt={value.name || 'Attachment preview'}
                  className="h-36 w-full object-cover"
                  loading="lazy"
                  decoding="async"
                  onError={() => setError('Could not load image preview.')}
                />
              ) : (
                <div className="flex h-36 w-full items-center justify-center bg-slate-100 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  Preview unavailable
                </div>
              )}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={
                disabled ||
                uploading ||
                openingView ||
                (!viewOpenTarget && Boolean(value.url?.trim()) && isStoragePath(value.url!.trim()) && !resolvedRemoteUrl)
              }
              onClick={async () => {
                const raw = value.url?.trim() ?? '';
                if (!raw && !localPreviewUrl) return;
                setOpeningView(true);
                setError(null);
                setPreviewOpen(true);
                setPreviewSrc(null);
                setPreviewLoading(true);
                try {
                  let openUrl: string | null = null;
                  if (localPreviewUrl) openUrl = localPreviewUrl;
                  else if (isHttpUrl(raw)) openUrl = raw;
                  else if (resolvedRemoteUrl) openUrl = resolvedRemoteUrl;
                  else openUrl = await resolveSignedUrl(raw);
                  setPreviewSrc(openUrl);
                } catch (err) {
                  setPreviewOpen(false);
                  setError('Something went wrong. Please retry');
                } finally {
                  setPreviewLoading(false);
                  setOpeningView(false);
                }
              }}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-500/[0.04] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-400/5"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden />
              {openingView ? 'Opening…' : 'View'}
            </button>
            <button
              type="button"
              onClick={openPicker}
              disabled={disabled || uploading}
              className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-indigo-300 hover:bg-indigo-500/[0.04] disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/40 dark:hover:bg-indigo-400/5"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden />
              Replace
            </button>
            <button
              type="button"
              onClick={clearAttachment}
              disabled={disabled || uploading}
              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-70 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/50"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <ExpenseAttachmentPreviewModal
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewSrc(null);
          setPreviewLoading(false);
        }}
        title={value.name?.trim() || 'Attachment'}
        src={previewSrc}
        variant={isPdfType(value.type, value.url) ? 'pdf' : 'image'}
        loading={previewLoading}
      />
    </div>
  );
}
