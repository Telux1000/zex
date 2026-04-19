type InvoiceEmailSubjectState = 'default' | 'reminder' | 'overdue';

function toDateOnly(value: string) {
  return String(value ?? '').slice(0, 10);
}

function smartDueText(dueDate: string) {
  const iso = toDateOnly(dueDate);
  if (!iso) return 'Due date unavailable';
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todayIso = toDateOnly(today.toISOString());
  const tomorrowIso = toDateOnly(tomorrow.toISOString());

  if (iso === todayIso) return 'Due today';
  if (iso === tomorrowIso) return 'Due tomorrow';

  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return `Due ${iso}`;
  return `Due ${parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function overdueDueText(dueDate: string) {
  const iso = toDateOnly(dueDate);
  if (!iso) return 'due date unavailable';
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function buildInvoiceEmailSubject(input: {
  state?: InvoiceEmailSubjectState;
  invoiceNumber: string;
  companyName?: string | null;
  dueDate: string;
}) {
  const state = input.state ?? 'default';
  const invoiceNumber = String(input.invoiceNumber ?? '').trim() || 'Invoice';
  const companyName = String(input.companyName ?? '').trim() || 'Your Business';

  if (state === 'reminder') {
    return `Reminder: Invoice ${invoiceNumber} ${smartDueText(input.dueDate).replace(/^Due\s+/i, 'due ')}`;
  }

  if (state === 'overdue') {
    return `Overdue: Invoice ${invoiceNumber} was due ${overdueDueText(input.dueDate)}`;
  }

  return `Invoice ${invoiceNumber} from ${companyName} — ${smartDueText(input.dueDate)}`;
}

