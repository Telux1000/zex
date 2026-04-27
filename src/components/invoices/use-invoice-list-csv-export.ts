'use client';

import { useCallback, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useToasts } from '@/components/feedback/toast/ToastProvider';
import { buildInvoiceListClientQueryParams } from '@/lib/invoices/invoice-list-client-query-params';
import { parseInvoiceListOrderParam, parseInvoiceListSortParam } from '@/lib/invoices/list-filters';

const DEFAULT_PAGE_SIZE = 25;

export function useInvoiceListCsvExport(businessId: string) {
  const searchParams = useSearchParams();
  const { showErrorToast, showSuccessToast } = useToasts();

  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? '';
  const filter = searchParams.get('filter') ?? '';
  const balance = searchParams.get('balance') ?? '';
  const scheduleFilter = searchParams.get('schedule_filter') ?? '';
  const issue = searchParams.get('issue') ?? '';
  const issue_from = searchParams.get('issue_from') ?? '';
  const issue_to = searchParams.get('issue_to') ?? '';
  const due = searchParams.get('due') ?? '';
  const due_from = searchParams.get('due_from') ?? '';
  const due_to = searchParams.get('due_to') ?? '';
  const customer = searchParams.get('customer') ?? '';
  const sort = parseInvoiceListSortParam(searchParams.get('sort'));
  const order = parseInvoiceListOrderParam(searchParams.get('order'));
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const page_size = Math.min(
    100,
    Math.max(10, parseInt(searchParams.get('page_size') ?? String(DEFAULT_PAGE_SIZE), 10))
  );

  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportLongWait, setExportLongWait] = useState(false);
  const exportLockRef = useRef(false);
  const exportLongWaitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getQuery = useCallback(
    (includePagination: boolean) =>
      buildInvoiceListClientQueryParams(
        {
          businessId,
          q,
          status,
          filter,
          balance,
          scheduleFilter,
          issue,
          issue_from,
          issue_to,
          due,
          due_from,
          due_to,
          customer,
          sort,
          order,
          page,
          page_size,
        },
        includePagination
      ),
    [
      businessId,
      q,
      status,
      filter,
      balance,
      scheduleFilter,
      issue,
      issue_from,
      issue_to,
      due,
      due_from,
      due_to,
      customer,
      sort,
      order,
      page,
      page_size,
    ]
  );

  const exportInvoicesCsv = useCallback(async () => {
    if (exportLockRef.current) return;
    exportLockRef.current = true;
    setExportingCsv(true);
    setExportLongWait(false);
    exportLongWaitTimerRef.current = setTimeout(() => setExportLongWait(true), 400);
    try {
      const params = getQuery(false);
      const res = await fetch(`/api/invoices/export-csv?${params.toString()}`);
      if (exportLongWaitTimerRef.current) {
        clearTimeout(exportLongWaitTimerRef.current);
        exportLongWaitTimerRef.current = null;
      }
      setExportLongWait(false);
      if (!res.ok) {
        showErrorToast('Could not export invoices. Please try again.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `zenzex-invoices-${new Date().toISOString().slice(0, 10)}.csv`;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (res.headers.get('X-Zenzex-Export-Row-Cap-Applied') === '1') {
        showSuccessToast(
          'Export includes up to 5,000 rows. Narrow your filters if you need a different set.'
        );
      }
    } catch {
      if (exportLongWaitTimerRef.current) {
        clearTimeout(exportLongWaitTimerRef.current);
        exportLongWaitTimerRef.current = null;
      }
      setExportLongWait(false);
      showErrorToast('Could not export invoices. Please try again.');
    } finally {
      exportLockRef.current = false;
      setExportingCsv(false);
    }
  }, [getQuery, showErrorToast, showSuccessToast]);

  return {
    exportInvoicesCsv,
    exportingCsv,
    exportLongWait,
  };
}
