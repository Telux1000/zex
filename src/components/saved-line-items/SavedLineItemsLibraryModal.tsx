'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatRateWithUnit, INVOICE_UNIT_SELECT_OPTIONS } from '@/lib/invoices/invoice-line-units';
import { cn } from '@/lib/utils/cn';

type Row = {
  id: string;
  name: string;
  description: string | null;
  unit_label: string;
  unit_price: number;
  tax_percent: number;
  currency: string;
  line_type: string;
  last_used_at: string | null;
  archived_at: string | null;
};

export function SavedLineItemsLibraryModal({
  open,
  onClose,
  businessId,
  defaultCurrency,
  onAfterChange,
}: {
  open: boolean;
  onClose: () => void;
  businessId: string | null;
  defaultCurrency: string;
  onAfterChange?: () => void;
}) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    name: string;
    description: string;
    unit_label: string;
    unit_price: string;
    tax_percent: string;
    line_type: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const u = new URL(`/api/businesses/${encodeURIComponent(businessId)}/saved-line-items`, window.location.origin);
      u.searchParams.set('limit', '200');
      if (search.trim()) u.searchParams.set('search', search.trim());
      const r = await fetch(u);
      const data = (await r.json()) as { items?: Row[]; _migrationPending?: boolean };
      setRows(Array.isArray(data.items) ? data.items : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [businessId, search]);

  useEffect(() => {
    if (!open || !businessId) return;
    const t = window.setTimeout(() => {
      void load();
    }, 200);
    return () => window.clearTimeout(t);
  }, [open, businessId, search, load]);

  useEffect(() => {
    if (open) setSearch('');
  }, [open, businessId]);

  const startEdit = (r: Row) => {
    setEditing(r.id);
    setDraft({
      name: r.name,
      description: r.description ?? '',
      unit_label: r.unit_label,
      unit_price: String(r.unit_price),
      tax_percent: String(r.tax_percent),
      line_type: r.line_type,
    });
  };

  const saveEdit = async (id: string) => {
    if (!businessId || !draft) return;
    setSaving(id);
    try {
      const res = await fetch(`/api/businesses/${encodeURIComponent(businessId)}/saved-line-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          unit_label: draft.unit_label,
          unit_price: parseFloat(draft.unit_price) || 0,
          tax_percent: parseFloat(draft.tax_percent) || 0,
          line_type: draft.line_type,
          currency: defaultCurrency.toUpperCase().slice(0, 3),
        }),
      });
      if (res.ok) {
        setEditing(null);
        setDraft(null);
        onAfterChange?.();
        await load();
      }
    } finally {
      setSaving(null);
    }
  };

  const archive = async (id: string) => {
    if (!businessId || !confirm('Archive this saved item? It will no longer appear in suggestions.')) return;
    setSaving(id);
    try {
      await fetch(`/api/businesses/${encodeURIComponent(businessId)}/saved-line-items/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      onAfterChange?.();
      await load();
    } finally {
      setSaving(null);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[480] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 bg-slate-900/50" aria-label="Close" onClick={onClose} />
      <div className="relative flex max-h-[min(32rem,92vh)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900 sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Saved line items</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search saved items"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {loading && !rows.length ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Saved items will appear here after you create invoices.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const cur = (r.currency || defaultCurrency).toUpperCase();
                if (editing === r.id && draft) {
                  return (
                    <li key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                      <div className="space-y-2 text-sm">
                        <label className="block">
                          <span className="text-xs text-slate-500">Name</span>
                          <input
                            value={draft.name}
                            onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                            className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-slate-500">Description</span>
                          <input
                            value={draft.description}
                            onChange={(e) => setDraft((d) => (d ? { ...d, description: e.target.value } : d))}
                            className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-xs text-slate-500">Unit</span>
                            <select
                              value={draft.unit_label}
                              onChange={(e) => setDraft((d) => (d ? { ...d, unit_label: e.target.value } : d))}
                              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                            >
                              {INVOICE_UNIT_SELECT_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="block">
                            <span className="text-xs text-slate-500">Type</span>
                            <select
                              value={draft.line_type}
                              onChange={(e) => setDraft((d) => (d ? { ...d, line_type: e.target.value } : d))}
                              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                            >
                              <option value="service">Service</option>
                              <option value="product">Product</option>
                              <option value="custom">Custom</option>
                            </select>
                          </label>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-xs text-slate-500">Rate</span>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={draft.unit_price}
                              onChange={(e) => setDraft((d) => (d ? { ...d, unit_price: e.target.value } : d))}
                              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                            />
                          </label>
                          <label className="block">
                            <span className="text-xs text-slate-500">Tax %</span>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step={0.1}
                              value={draft.tax_percent}
                              onChange={(e) => setDraft((d) => (d ? { ...d, tax_percent: e.target.value } : d))}
                              className="mt-0.5 w-full rounded-lg border border-slate-200 px-2 py-1.5 dark:border-slate-600 dark:bg-slate-800"
                            />
                          </label>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(null);
                              setDraft(null);
                            }}
                            className="rounded-lg px-3 py-1.5 text-sm text-slate-600 dark:text-slate-400"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={saving === r.id}
                            onClick={() => void saveEdit(r.id)}
                            className={cn(
                              'rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white',
                              saving === r.id && 'opacity-60'
                            )}
                          >
                            {saving === r.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </li>
                  );
                }
                return (
                  <li
                    key={r.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white">{r.name}</p>
                      {r.description?.trim() ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{r.description}</p>
                      ) : null}
                      <p className="mt-1 text-sm tabular-nums text-slate-600 dark:text-slate-300">
                        {formatRateWithUnit(r.unit_price, cur, r.unit_label)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void archive(r.id)}
                        disabled={saving === r.id}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        Archive
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
