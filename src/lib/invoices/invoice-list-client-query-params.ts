/**
 * Shared list query string for `GET /api/invoices` and `GET /api/invoices/export-csv`
 * (must match {@link InvoicesSection} URL state).
 */
export type InvoiceListClientQueryInput = {
  businessId: string;
  q: string;
  status: string;
  filter: string;
  balance: string;
  scheduleFilter: string;
  issue: string;
  issue_from: string;
  issue_to: string;
  due: string;
  due_from: string;
  due_to: string;
  customer: string;
  sort: string;
  order: string;
  page: number;
  page_size: number;
};

export function buildInvoiceListClientQueryParams(
  input: InvoiceListClientQueryInput,
  includePagination: boolean
): URLSearchParams {
  const params = new URLSearchParams();
  params.set('business_id', input.businessId);
  const q = input.q.trim();
  if (q) params.set('q', q);
  if (input.status) params.set('status', input.status);
  if (input.filter) params.set('filter', input.filter);
  if (input.balance) params.set('balance', input.balance);
  if (input.scheduleFilter) params.set('schedule_filter', input.scheduleFilter);
  if (input.issue) params.set('issue', input.issue);
  if (input.issue_from) params.set('issue_from', input.issue_from);
  if (input.issue_to) params.set('issue_to', input.issue_to);
  if (input.due) params.set('due', input.due);
  if (input.due_from) params.set('due_from', input.due_from);
  if (input.due_to) params.set('due_to', input.due_to);
  if (input.customer) params.set('customer', input.customer);
  params.set('sort', input.sort);
  params.set('order', input.order);
  if (includePagination) {
    params.set('page', String(input.page));
    params.set('page_size', String(input.page_size));
    params.set('exact_count', '1');
  }
  return params;
}
