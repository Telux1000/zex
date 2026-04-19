'use client';

import { useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '@/lib/currency/supported';
import { formatCurrencyAmount } from '@/lib/utils/currency';
import { cn } from '@/lib/utils/cn';
import { QuoteDocumentPreview } from '@/components/quotes/QuoteDocumentPreview';
import type { QuoteIssuerInfo } from '@/lib/quotes/issuer';
import type { CustomerSnapshotInput } from '@/lib/quotes/address-format';
import { formatAddressBlockLines } from '@/lib/quotes/address-format';
import { ItemNameInput } from '@/components/items/ItemNameInput';
import { persistSavedLineItemsFromSave } from '@/lib/items/saved-line-items-store';
import { SearchableCustomerSelect } from '@/components/customers/SearchableCustomerSelect';
import { CustomerRequiredModal } from '@/components/customers/CustomerRequiredModal';
import { CustomerNeededSoftPrompt } from '@/components/customers/CustomerNeededSoftPrompt';
import { useToasts } from '@/components/feedback/toast/ToastProvider';

const quoteItemRemoveButtonClass =
  'inline-flex h-10 min-h-10 shrink-0 items-center justify-center rounded-lg p-2 px-3 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500/40 sm:text-sm dark:text-red-400 dark:hover:bg-red-900/20 dark:focus-visible:outline-red-400/35';

type CustomerRow = {
  id: string;
  label: string;
  company: string | null;
  email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
};

type QuoteItem = {
  name: string;
  description: string;
  quantity: string;
  unit_price: string;
  tax_percent: string;
};

type InitialQuote = {
  id: string;
  quote_number: string;
  customer_id: string | null;
  customer_snapshot: CustomerSnapshotInput;
  issue_date: string;
  expiry_date: string | null;
  notes: string | null;
  currency: string;
  quote_items: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    tax_percent?: number;
  }>;
};

function safeNum(v: string): number {
  const t = String(v ?? '').trim().replace(/,/g, '');
  if (t === '') return 0;
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

function formatNumberForInput(n: number, emptyWhenZero: boolean): string {
  if (!Number.isFinite(n)) return emptyWhenZero ? '' : '';
  if (n === 0 && emptyWhenZero) return '';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function formatQuantityForInput(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '1';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function normalizeQuantityOnBlur(raw: string): string {
  const t = raw.trim();
  if (t === '') return '1';
  const n = parseFloat(t.replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return '1';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function normalizeUnitPriceOnBlur(raw: string): string {
  const t = raw.trim();
  if (t === '') return '';
  const n = parseFloat(t.replace(/,/g, ''));
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function normalizeTaxOnBlur(raw: string): string {
  const t = raw.trim();
  if (t === '') return '';
  const n = parseFloat(t.replace(/,/g, ''));
  if (!Number.isFinite(n)) return '';
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

/** Strips non-numeric input; allows at most one decimal point (no letters). */
function sanitizeDecimalInput(raw: string): string {
  let s = raw.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot === -1) return s;
  return s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
}

function mapInitialItem(
  item: InitialQuote['quote_items'][number]
): QuoteItem {
  return {
    name: item.name,
    description: item.description ?? '',
    quantity: formatQuantityForInput(Number(item.quantity)),
    unit_price: formatNumberForInput(Number(item.unit_price), true),
    tax_percent: formatNumberForInput(Number(item.tax_percent ?? 0), true),
  };
}

function snapshotFromCustomerRow(c: CustomerRow): CustomerSnapshotInput & { name: string } {
  const lines = formatAddressBlockLines({
    line1: c.address_line1,
    line2: c.address_line2,
    city: c.city,
    state: c.state,
    postal_code: c.postal_code,
    country: c.country,
  });
  return {
    name: c.label,
    company: c.company?.trim() || null,
    email: c.email,
    address_line1: c.address_line1,
    address_line2: c.address_line2,
    city: c.city,
    state: c.state,
    postal_code: c.postal_code,
    country: c.country,
    address: lines.length ? lines.join(', ') : null,
    use_delivery_address: false,
    delivery_address_line1: null,
    delivery_address_line2: null,
    delivery_city: null,
    delivery_state: null,
    delivery_postal_code: null,
    delivery_country: null,
  };
}

export function QuoteForm({
  businessId,
  customers,
  issuer,
  mode,
  initialQuote,
}: {
  businessId: string;
  customers: CustomerRow[];
  issuer: QuoteIssuerInfo;
  mode: 'create' | 'edit';
  initialQuote?: InitialQuote;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const quoteReturnTo =
    pathname + (searchParams.toString() ? `?${searchParams.toString()}` : '');
  const { showSuccessToast, showErrorToast } = useToasts();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [customerError, setCustomerError] = useState(false);
  const [issueDateError, setIssueDateError] = useState(false);
  const [currencyError, setCurrencyError] = useState(false);
  const [itemFieldErrors, setItemFieldErrors] = useState<
    Record<number, { name?: boolean; quantity?: boolean; unit_price?: boolean }>
  >({});
  const [itemCardFlash, setItemCardFlash] = useState(false);
  const itemCardFlashTimeoutRef = useRef<number | null>(null);
  const [customerRequiredModalOpen, setCustomerRequiredModalOpen] = useState(false);
  const [customerId, setCustomerId] = useState<string>(initialQuote?.customer_id ?? '');
  const [issueDate, setIssueDate] = useState<string>(
    initialQuote?.issue_date ?? new Date().toISOString().slice(0, 10)
  );
  const [expiryDate, setExpiryDate] = useState<string>(initialQuote?.expiry_date ?? '');
  const [currency, setCurrency] = useState<string>(initialQuote?.currency ?? 'USD');
  const [notes, setNotes] = useState<string>(initialQuote?.notes ?? '');
  const [useDeliveryAddress, setUseDeliveryAddress] = useState<boolean>(
    !!initialQuote?.customer_snapshot?.use_delivery_address
  );
  const [deliveryAddressLine1, setDeliveryAddressLine1] = useState<string>(
    initialQuote?.customer_snapshot?.delivery_address_line1 ?? ''
  );
  const [deliveryAddressLine2, setDeliveryAddressLine2] = useState<string>(
    initialQuote?.customer_snapshot?.delivery_address_line2 ?? ''
  );
  const [deliveryCity, setDeliveryCity] = useState<string>(initialQuote?.customer_snapshot?.delivery_city ?? '');
  const [deliveryState, setDeliveryState] = useState<string>(
    initialQuote?.customer_snapshot?.delivery_state ?? ''
  );
  const [deliveryPostalCode, setDeliveryPostalCode] = useState<string>(
    initialQuote?.customer_snapshot?.delivery_postal_code ?? ''
  );
  const [deliveryCountry, setDeliveryCountry] = useState<string>(
    initialQuote?.customer_snapshot?.delivery_country ?? ''
  );
  const [items, setItems] = useState<QuoteItem[]>(
    initialQuote?.quote_items?.length
      ? initialQuote.quote_items.map(mapInitialItem)
      : [
          {
            name: '',
            description: '',
            quantity: '',
            unit_price: '',
            tax_percent: '',
          },
        ]
  );

  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const customerSnapshot = useMemo((): CustomerSnapshotInput & { name: string } => {
    if (selectedCustomer) {
      const base = snapshotFromCustomerRow(selectedCustomer);
      return {
        ...base,
        use_delivery_address: useDeliveryAddress,
        delivery_address_line1: useDeliveryAddress ? (deliveryAddressLine1.trim() || null) : null,
        delivery_address_line2: useDeliveryAddress ? (deliveryAddressLine2.trim() || null) : null,
        delivery_city: useDeliveryAddress ? (deliveryCity.trim() || null) : null,
        delivery_state: useDeliveryAddress ? (deliveryState.trim() || null) : null,
        delivery_postal_code: useDeliveryAddress ? (deliveryPostalCode.trim() || null) : null,
        delivery_country: useDeliveryAddress ? (deliveryCountry.trim() || null) : null,
      };
    }
    const snap = initialQuote?.customer_snapshot;
    if (snap && customerId && customerId === initialQuote?.customer_id && snap.name?.trim()) {
      return {
        ...snap,
        name: String(snap.name).trim(),
        use_delivery_address: useDeliveryAddress,
        delivery_address_line1: useDeliveryAddress ? (deliveryAddressLine1.trim() || null) : null,
        delivery_address_line2: useDeliveryAddress ? (deliveryAddressLine2.trim() || null) : null,
        delivery_city: useDeliveryAddress ? (deliveryCity.trim() || null) : null,
        delivery_state: useDeliveryAddress ? (deliveryState.trim() || null) : null,
        delivery_postal_code: useDeliveryAddress ? (deliveryPostalCode.trim() || null) : null,
        delivery_country: useDeliveryAddress ? (deliveryCountry.trim() || null) : null,
      };
    }
    return {
      name: '',
      email: null,
      address: null,
      company: null,
      address_line1: null,
      address_line2: null,
      city: null,
      state: null,
      postal_code: null,
      country: null,
      use_delivery_address: useDeliveryAddress,
      delivery_address_line1: useDeliveryAddress ? (deliveryAddressLine1.trim() || null) : null,
      delivery_address_line2: useDeliveryAddress ? (deliveryAddressLine2.trim() || null) : null,
      delivery_city: useDeliveryAddress ? (deliveryCity.trim() || null) : null,
      delivery_state: useDeliveryAddress ? (deliveryState.trim() || null) : null,
      delivery_postal_code: useDeliveryAddress ? (deliveryPostalCode.trim() || null) : null,
      delivery_country: useDeliveryAddress ? (deliveryCountry.trim() || null) : null,
    };
  }, [
    selectedCustomer,
    customerId,
    initialQuote,
    useDeliveryAddress,
    deliveryAddressLine1,
    deliveryAddressLine2,
    deliveryCity,
    deliveryState,
    deliveryPostalCode,
    deliveryCountry,
  ]);

  const totals = useMemo(() => {
    const subtotal = items.reduce((sum, i) => sum + safeNum(i.quantity) * safeNum(i.unit_price), 0);
    const tax = items.reduce(
      (sum, i) =>
        sum + safeNum(i.quantity) * safeNum(i.unit_price) * (safeNum(i.tax_percent) / 100),
      0
    );
    return { subtotal, tax, total: subtotal + tax };
  }, [items]);

  const previewItems = useMemo(
    () =>
      items
        .filter((i) => i.name.trim())
        .map((i) => ({
          name: i.name,
          description: i.description.trim() || null,
          quantity: safeNum(i.quantity),
          unit_price: safeNum(i.unit_price),
          tax_percent: safeNum(i.tax_percent),
          amount: safeNum(i.quantity) * safeNum(i.unit_price),
        })),
    [items]
  );

  function updateItem(index: number, patch: Partial<QuoteItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        name: '',
        description: '',
        quantity: '',
        unit_price: '',
        tax_percent: '',
      },
    ]);
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'create' && customers.length === 0) {
      setCustomerRequiredModalOpen(true);
      return;
    }

    setSubmitAttempted(true);

    setCustomerError(false);
    setIssueDateError(false);
    setCurrencyError(false);
    setItemFieldErrors({});

    const focusById = (id: string) => {
      const el = typeof document !== 'undefined' ? (document.getElementById(id) as HTMLElement | null) : null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        el.focus?.();
      }, 0);
    };

    const scrollById = (id: string) => {
      const el = typeof document !== 'undefined' ? (document.getElementById(id) as HTMLElement | null) : null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    const focusByIdDirect = (id: string) => {
      const el = typeof document !== 'undefined' ? (document.getElementById(id) as HTMLElement | null) : null;
      if (!el) return;
      window.setTimeout(() => {
        el.focus?.();
      }, 0);
    };

    const qtyOkFor = (q: string) => safeNum(q) > 0;
    const unitOkFor = (u: string) => safeNum(u) > 0;

    if (!customerId || !customerSnapshot.name.trim()) {
      setCustomerError(true);
      setError('Please select a customer');
      focusById('quote-customer-search');
      return;
    }

    if (!currency.trim()) {
      setCurrencyError(true);
      setError('Please choose a currency');
      focusById('quote-currency');
      return;
    }

    if (!issueDate.trim()) {
      setIssueDateError(true);
      setError('Please choose an issue date');
      focusById('quote-issue-date');
      return;
    }

    let hasValidItem = false;
    let firstInvalidItem: { index: number; field: 'name' | 'quantity' | 'unit_price' } | null = null;
    const nextItemErrors: Record<number, { name?: boolean; quantity?: boolean; unit_price?: boolean }> = {};

    items.forEach((it, idx) => {
      const nameProvided = it.name.trim().length > 0;
      const qtyProvided = it.quantity.trim().length > 0;
      const unitProvided = it.unit_price.trim().length > 0;
      const rowTouched = nameProvided || qtyProvided || unitProvided;

      if (!rowTouched) return;

      const quantityOk = qtyOkFor(it.quantity);
      const unitOk = unitOkFor(it.unit_price);

      if (nameProvided && quantityOk && unitOk) {
        hasValidItem = true;
        return;
      }

      if (!nameProvided) {
        nextItemErrors[idx] = { ...(nextItemErrors[idx] ?? {}), name: true };
        if (!firstInvalidItem) firstInvalidItem = { index: idx, field: 'name' };

        if (qtyProvided && !quantityOk) {
          nextItemErrors[idx] = { ...(nextItemErrors[idx] ?? {}), quantity: true };
          if (!firstInvalidItem) firstInvalidItem = { index: idx, field: 'quantity' };
        }
        if (unitProvided && !unitOk) {
          nextItemErrors[idx] = { ...(nextItemErrors[idx] ?? {}), unit_price: true };
          if (!firstInvalidItem) firstInvalidItem = { index: idx, field: 'unit_price' };
        }
        return;
      }

      // name is provided but quantity/unit are incomplete/invalid
      if (!quantityOk) {
        nextItemErrors[idx] = { ...(nextItemErrors[idx] ?? {}), quantity: true };
        if (!firstInvalidItem) firstInvalidItem = { index: idx, field: 'quantity' };
      }

      if (!unitOk) {
        nextItemErrors[idx] = { ...(nextItemErrors[idx] ?? {}), unit_price: true };
        if (!firstInvalidItem) firstInvalidItem = { index: idx, field: 'unit_price' };
      }
    });

    if (!hasValidItem && Object.keys(nextItemErrors).length === 0 && items.length > 0) {
      nextItemErrors[0] = { name: true };
      if (!firstInvalidItem) firstInvalidItem = { index: 0, field: 'name' };
    }

    const hasItemErrors = Object.keys(nextItemErrors).length > 0;
    if (!hasValidItem || totals.total <= 0 || hasItemErrors) {
      setItemFieldErrors(nextItemErrors);
      setError('Complete item details');
      setItemCardFlash(true);
      if (itemCardFlashTimeoutRef.current) window.clearTimeout(itemCardFlashTimeoutRef.current);
      itemCardFlashTimeoutRef.current = window.setTimeout(() => setItemCardFlash(false), 1200);
      scrollById('quote-items-card');
      if (firstInvalidItem) {
        const { index: idx, field } = firstInvalidItem;
        const focusId =
          field === 'name'
            ? `quote-line-${idx}-name`
            : field === 'quantity'
              ? `quote-line-${idx}-qty`
              : `quote-line-${idx}-unit`;
        focusByIdDirect(focusId);
      }
      return;
    }

    setSaving(true);
    try {
      const validItems = items.filter((i) => i.name.trim() && qtyOkFor(i.quantity) && unitOkFor(i.unit_price));
      const payload = {
        business_id: businessId,
        customer_id: customerId,
        customer_snapshot: {
          name: customerSnapshot.name.trim(),
          email: customerSnapshot.email ?? null,
          address: customerSnapshot.address ?? null,
          company: customerSnapshot.company ?? null,
          address_line1: customerSnapshot.address_line1 ?? null,
          address_line2: customerSnapshot.address_line2 ?? null,
          city: customerSnapshot.city ?? null,
          state: customerSnapshot.state ?? null,
          postal_code: customerSnapshot.postal_code ?? null,
          country: customerSnapshot.country ?? null,
          use_delivery_address: !!customerSnapshot.use_delivery_address,
          delivery_address_line1: customerSnapshot.delivery_address_line1 ?? null,
          delivery_address_line2: customerSnapshot.delivery_address_line2 ?? null,
          delivery_city: customerSnapshot.delivery_city ?? null,
          delivery_state: customerSnapshot.delivery_state ?? null,
          delivery_postal_code: customerSnapshot.delivery_postal_code ?? null,
          delivery_country: customerSnapshot.delivery_country ?? null,
        },
        issue_date: issueDate,
        expiry_date: expiryDate || null,
        notes: notes || null,
        currency,
        items: validItems.map((i) => ({
          name: i.name.trim(),
          description: i.description.trim() || null,
          quantity: safeNum(normalizeQuantityOnBlur(i.quantity)),
          unit_price: safeNum(normalizeUnitPriceOnBlur(i.unit_price)),
          tax_percent: safeNum(normalizeTaxOnBlur(i.tax_percent || '0')),
        })),
      };
      const url = mode === 'create' ? '/api/quotes' : `/api/quotes/${initialQuote?.id}`;
      const method = mode === 'create' ? 'POST' : 'PATCH';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not save quote');
      persistSavedLineItemsFromSave(
        businessId,
        payload.items.map((i) => ({
          name: i.name,
          unitPrice: i.unit_price,
          description: i.description,
          taxPercent: i.tax_percent,
        }))
      );
      router.push(`/dashboard/quotes/${mode === 'create' ? data.id : initialQuote?.id}`);
      router.refresh();
      showSuccessToast('Quote saved');
    } catch (err) {
      showErrorToast('Something went wrong. Please retry');
      setError(null);
    } finally {
      setSaving(false);
    }
  }

  const quoteNumberPreview = mode === 'edit' && initialQuote?.quote_number ? initialQuote.quote_number : null;

  const customerOrphanLabel =
    customerId &&
    !selectedCustomer &&
    customerId === initialQuote?.customer_id &&
    initialQuote?.customer_snapshot?.name?.trim()
      ? String(initialQuote.customer_snapshot.name).trim()
      : undefined;

  return (
    <>
    <form onSubmit={onSubmit} className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {mode === 'create' ? 'Create Quote' : 'Edit Quote'}
        </h1>
        <Link
          href={mode === 'create' ? '/dashboard/quotes' : `/dashboard/quotes/${initialQuote?.id}`}
          className="app-btn-secondary inline-flex items-center justify-center"
        >
          Cancel
        </Link>
      </div>

      {mode === 'create' && customers.length === 0 ? (
        <CustomerNeededSoftPrompt variant="quote" returnTo={quoteReturnTo} />
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1fr_minmax(300px,420px)]">
        <div className="min-w-0 space-y-6">
          <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 md:grid-cols-2">
            {mode === 'edit' && initialQuote?.quote_number ? (
              <div className="space-y-1 text-sm md:col-span-2">
                <span className="text-slate-600 dark:text-slate-300">Quote number</span>
                <input
                  type="text"
                  readOnly
                  value={initialQuote.quote_number}
                  className="w-full cursor-default rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-800 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-200"
                  aria-readonly
                />
              </div>
            ) : (
              <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 md:col-span-2">
                Quote number is assigned automatically when you save (e.g. QT-00001).
              </p>
            )}
            <label className="space-y-1 text-sm md:col-span-2" htmlFor="quote-customer">
              <span className="text-slate-600 dark:text-slate-300">Customer</span>
              <SearchableCustomerSelect
                id="quote-customer"
                options={customers.map((c) => ({
                  id: c.id,
                  label: c.label,
                  company: c.company,
                  email: c.email,
                }))}
                value={customerId}
                onChange={setCustomerId}
                placeholder="Select customer"
                orphanValueLabel={customerOrphanLabel}
                triggerClassName={
                  submitAttempted && customerError
                    ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-500 dark:focus-visible:ring-red-500/35'
                    : undefined
                }
              />
            </label>
            <div className="space-y-3 rounded-lg border border-slate-200 p-3 md:col-span-2 dark:border-slate-700">
              <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={useDeliveryAddress}
                  onChange={(e) => setUseDeliveryAddress(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800"
                />
                Use different delivery address
              </label>
              {useDeliveryAddress ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-slate-600 dark:text-slate-300">Delivery address line 1</span>
                    <input
                      value={deliveryAddressLine1}
                      onChange={(e) => setDeliveryAddressLine1(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                  <label className="space-y-1 text-sm md:col-span-2">
                    <span className="text-slate-600 dark:text-slate-300">Delivery address line 2</span>
                    <input
                      value={deliveryAddressLine2}
                      onChange={(e) => setDeliveryAddressLine2(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Delivery city</span>
                    <input
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Delivery state</span>
                    <input
                      value={deliveryState}
                      onChange={(e) => setDeliveryState(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Delivery postal code</span>
                    <input
                      value={deliveryPostalCode}
                      onChange={(e) => setDeliveryPostalCode(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-slate-600 dark:text-slate-300">Delivery country</span>
                    <input
                      value={deliveryCountry}
                      onChange={(e) => setDeliveryCountry(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </label>
                </div>
              ) : null}
            </div>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Currency</span>
              <select
                id="quote-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className={cn(
                  'w-full rounded-lg border bg-white px-3 py-2 text-slate-900 dark:bg-slate-800 dark:text-slate-100',
                  submitAttempted && currencyError
                    ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-500 dark:focus-visible:ring-red-500/35'
                    : 'border-slate-300 dark:border-slate-700'
                )}
                required
                aria-invalid={submitAttempted && currencyError ? true : undefined}
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Issue date</span>
              <div className="relative">
                <CalendarDays
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  aria-hidden
                />
                <input
                  id="quote-issue-date"
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  className={cn(
                    'app-date-field w-full pl-10',
                    submitAttempted && issueDateError
                      ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-500 dark:focus-visible:ring-red-500/35'
                      : null
                  )}
                  required
                  aria-invalid={submitAttempted && issueDateError ? true : undefined}
                />
              </div>
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="text-slate-600 dark:text-slate-300">Expiry date</span>
              <div className="relative max-w-xs">
                <CalendarDays
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500"
                  aria-hidden
                />
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="app-date-field w-full pl-10"
                />
              </div>
            </label>
          </div>

          <div
            className={cn(
              'space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900',
              submitAttempted && Object.keys(itemFieldErrors).length > 0
                ? 'border-red-500 bg-red-50 dark:bg-red-900/10 dark:border-red-500 transition-colors duration-200'
                : null,
              itemCardFlash ? 'ring-2 ring-red-500/30 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : null
            )}
            id="quote-items-card"
          >
            <div className="hidden min-w-0 gap-x-3 gap-y-2 md:grid md:grid-cols-12 md:items-end md:px-0.5">
              <div className="grid min-w-0 gap-1 md:col-span-5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Item</span>
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Description</span>
              </div>
              <div className="grid min-w-0 gap-1 md:col-span-2">
                <div className="text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                  Quantity
                </div>
                <div className="text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                  Unit Price
                </div>
              </div>
              <div className="md:col-span-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                Amount
              </div>
              <div className="flex min-w-0 items-end gap-2 md:col-span-2">
                <div className="w-16 shrink-0 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                  Tax (%)
                </div>
              </div>
              <div className="hidden md:block md:col-span-1" aria-hidden />
            </div>

            <div className="min-w-0 space-y-3">
              {items.map((item, index) => {
                const lineAmount = safeNum(item.quantity) * safeNum(item.unit_price);
                return (
                  <div
                    key={index}
                    className="grid min-w-0 gap-3 md:grid-cols-12 md:items-end md:gap-x-3 md:gap-y-3"
                  >
                    <div className="flex min-w-0 flex-col gap-2 md:col-span-5">
                      <ItemNameInput
                        businessId={businessId}
                        currencyCode={currency}
                        value={item.name}
                        onChange={(v) => updateItem(index, { name: v })}
                        onPickSuggestion={(s) =>
                          updateItem(index, {
                            name: s.name,
                            description: s.description ?? '',
                            unit_price: formatNumberForInput(s.unitPrice, false),
                            tax_percent: formatNumberForInput(s.taxPercent ?? 0, false),
                          })
                        }
                        placeholder="Item"
                        className={cn(
                          'w-full rounded-lg border px-3 py-2 text-sm dark:bg-slate-800 dark:text-slate-100',
                          submitAttempted && itemFieldErrors[index]?.name
                            ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-500 dark:focus-visible:ring-red-500/35'
                            : 'border-slate-300 dark:border-slate-700'
                        )}
                        required={false}
                        id={`quote-line-${index}-name`}
                        nextFieldId={`quote-line-${index}-description`}
                        aria-invalid={submitAttempted && itemFieldErrors[index]?.name ? true : undefined}
                      />
                      <input
                        id={`quote-line-${index}-description`}
                        value={item.description}
                        onChange={(e) => updateItem(index, { description: e.target.value })}
                        placeholder="Description"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div className="flex min-w-0 max-w-full flex-col gap-2 max-sm:w-full sm:max-w-[11rem] sm:flex-row sm:flex-nowrap sm:items-end sm:gap-2 md:col-span-2 md:max-w-none md:flex-col md:gap-2">
                      <input
                        id={`quote-line-${index}-qty`}
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.]?[0-9]*"
                        autoComplete="off"
                        value={item.quantity}
                        onChange={(e) =>
                          updateItem(index, { quantity: sanitizeDecimalInput(e.target.value) })
                        }
                        onBlur={() => updateItem(index, { quantity: normalizeQuantityOnBlur(item.quantity) })}
                        placeholder="Qty"
                        className={cn(
                          'h-10 min-h-10 w-full min-w-0 shrink-0 rounded-lg border px-2.5 py-2 text-right text-sm tabular-nums sm:w-20 dark:bg-slate-800 dark:text-slate-100 md:w-full',
                          submitAttempted && itemFieldErrors[index]?.quantity
                            ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-500 dark:focus-visible:ring-red-500/35'
                            : 'border-slate-300 dark:border-slate-700'
                        )}
                        aria-invalid={submitAttempted && itemFieldErrors[index]?.quantity ? true : undefined}
                      />
                      <input
                        id={`quote-line-${index}-unit`}
                        type="text"
                        inputMode="decimal"
                        pattern="[0-9]*[.]?[0-9]*"
                        autoComplete="off"
                        value={item.unit_price}
                        onChange={(e) =>
                          updateItem(index, { unit_price: sanitizeDecimalInput(e.target.value) })
                        }
                        onBlur={() => updateItem(index, { unit_price: normalizeUnitPriceOnBlur(item.unit_price) })}
                        placeholder="Price"
                        className={cn(
                          'h-10 min-h-10 w-full min-w-0 shrink-0 rounded-lg border px-2.5 py-2 text-right text-sm tabular-nums sm:w-24 dark:bg-slate-800 dark:text-slate-100 md:w-full',
                          submitAttempted && itemFieldErrors[index]?.unit_price
                            ? 'border-red-500 focus-visible:border-red-500 focus-visible:ring-2 focus-visible:ring-red-500/30 dark:border-red-500 dark:focus-visible:ring-red-500/35'
                            : 'border-slate-300 dark:border-slate-700'
                        )}
                        aria-invalid={submitAttempted && itemFieldErrors[index]?.unit_price ? true : undefined}
                      />
                    </div>
                    <div
                      className="flex min-h-10 min-w-0 items-center rounded-lg border border-transparent px-1 py-2 text-right text-sm tabular-nums text-slate-800 dark:text-slate-200 md:col-span-2 md:justify-end"
                      aria-readonly
                    >
                      {formatCurrencyAmount(lineAmount, currency)}
                    </div>
                    <div className="flex min-w-0 flex-nowrap items-center justify-between gap-3 md:col-span-2">
                      <span className="shrink-0 text-left text-sm text-gray-500 dark:text-gray-400 md:hidden">
                        Tax (%)
                      </span>
                      <div className="relative w-20 min-w-0 shrink-0 sm:w-24 md:w-full">
                        <input
                          type="text"
                          inputMode="decimal"
                          pattern="[0-9]*[.]?[0-9]*"
                          autoComplete="off"
                          maxLength={5}
                          value={item.tax_percent}
                          onChange={(e) =>
                            updateItem(index, {
                              tax_percent: sanitizeDecimalInput(e.target.value).slice(0, 5),
                            })
                          }
                          onBlur={() => updateItem(index, { tax_percent: normalizeTaxOnBlur(item.tax_percent) })}
                          placeholder="0"
                          aria-label="Tax percent"
                          className="h-10 min-h-10 w-full rounded-lg border border-slate-300 px-3 py-2 pr-8 text-right text-sm tabular-nums dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                        />
                        <span
                          className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm font-medium text-slate-500 dark:text-slate-400"
                          aria-hidden
                        >
                          %
                        </span>
                      </div>
                    </div>
                    <div className="flex h-10 min-h-10 min-w-0 items-center justify-end md:col-span-1 md:justify-center">
                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className={quoteItemRemoveButtonClass}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {submitAttempted && Object.keys(itemFieldErrors).length > 0 ? (
              <p className="px-4 pb-2 text-sm text-red-500 dark:text-red-400" role="alert">
                Complete item details
              </p>
            ) : null}

            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                onClick={addItem}
                className="app-btn-primary inline-flex items-center justify-center"
              >
                Add Item
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <label className="space-y-1 text-sm">
              <span className="text-slate-600 dark:text-slate-300">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </label>
          </div>

          <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1 text-sm">
              <p className="text-slate-600 dark:text-slate-300">Subtotal: {formatCurrencyAmount(totals.subtotal, currency)}</p>
              <p className="text-slate-600 dark:text-slate-300">Tax: {formatCurrencyAmount(totals.tax, currency)}</p>
              <p className="font-semibold text-slate-900 dark:text-white">Total: {formatCurrencyAmount(totals.total, currency)}</p>
            </div>
            <button type="submit" disabled={saving} className="app-btn-primary">
              {saving ? 'Saving...' : mode === 'create' ? 'Create Quote' : 'Save Quote'}
            </button>
          </div>

          {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        </div>

        <aside className="min-w-0 space-y-3 xl:sticky xl:top-24 xl:self-start">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Quote preview
          </h2>
          <QuoteDocumentPreview
            issuer={issuer}
            quoteNumber={quoteNumberPreview}
            issueDate={issueDate}
            expiryDate={expiryDate || null}
            currency={currency}
            customerSnapshot={customerSnapshot}
            items={previewItems}
            subtotal={totals.subtotal}
            tax={totals.tax}
            total={totals.total}
            notes={notes || null}
          />
        </aside>
      </div>
    </form>
    <CustomerRequiredModal
      open={customerRequiredModalOpen}
      onClose={() => setCustomerRequiredModalOpen(false)}
      returnTo={quoteReturnTo}
      variant="quote"
    />
    </>
  );
}
