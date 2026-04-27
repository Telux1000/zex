import type { InvoiceTemplateId } from '@/lib/invoices/invoice-template-ids';

/**
 * Color tokens for the pdf-lib generator so each saved `template_id` maps to
 * a distinct look that aligns with the React `InvoiceDocumentView` skins.
 * Triples are RGB 0–1 for pdf-lib `rgb(...)`.
 */
export type PdfRgb = readonly [number, number, number];

export type InvoicePdfPaint = {
  topAccent: PdfRgb | null;
  companyName: PdfRgb;
  address: PdfRgb;
  taxId: PdfRgb;
  rightBlockLabel: PdfRgb;
  rightBlockValue: PdfRgb;
  rightTitle: PdfRgb;
  rightTitleSize: number;
  rightInvoiceSub: PdfRgb;
  amountBand: { fill: PdfRgb; border: PdfRgb; borderW: number; label: PdfRgb; value: PdfRgb };
  billToLabel: PdfRgb;
  body: PdfRgb;
  meta: PdfRgb;
  table: {
    head: { fill: PdfRgb; border: PdfRgb; borderW: number; text: PdfRgb };
    rowLine: PdfRgb;
    cell: PdfRgb;
    num: PdfRgb;
    lineTotal: PdfRgb;
    bottom: PdfRgb;
  };
  timeSummary: { heading: PdfRgb; caption: PdfRgb; line: PdfRgb; footer: PdfRgb };
  totals: { heading: PdfRgb; key: PdfRgb; value: PdfRgb; valueStrong: PdfRgb; mut: PdfRgb };
  earlyPay: { fill: PdfRgb; border: PdfRgb; title: PdfRgb; line: PdfRgb; strong: PdfRgb; foot: PdfRgb };
  schedule: { title: PdfRgb; line: PdfRgb };
  payment: { cap: PdfRgb; title: PdfRgb; line: PdfRgb; field: PdfRgb };
  notes: { title: PdfRgb; body: PdfRgb };
};

const T = (r: number, g: number, b: number): PdfRgb => [r, g, b];

/* Shared neutrals (classic baseline) */
const C = {
  companyName: T(0.12, 0.13, 0.16),
  address: T(0.38, 0.4, 0.45),
  rightLabel: T(0.5, 0.52, 0.56),
  rightValue: T(0.2, 0.22, 0.28),
  title: T(0.08, 0.09, 0.12),
  sub: T(0.22, 0.24, 0.3),
  billTo: T(0.55, 0.57, 0.62),
  body: T(0.18, 0.2, 0.24),
  tableHead: T(0.42, 0.44, 0.5),
} as const;

const PAINT: Record<InvoiceTemplateId, InvoicePdfPaint> = {
  classic: {
    topAccent: null,
    companyName: C.companyName,
    address: C.address,
    taxId: T(0.5, 0.52, 0.56),
    rightBlockLabel: C.rightLabel,
    rightBlockValue: C.rightValue,
    rightTitle: C.title,
    rightTitleSize: 26,
    rightInvoiceSub: C.sub,
    amountBand: {
      fill: T(0.97, 0.98, 0.99),
      border: T(0.9, 0.91, 0.94),
      borderW: 0.75,
      label: T(0.38, 0.4, 0.46),
      value: T(0.06, 0.08, 0.12),
    },
    billToLabel: C.billTo,
    body: C.body,
    meta: T(0.45, 0.47, 0.52),
    table: {
      head: { fill: T(0.96, 0.97, 0.99), border: T(0.9, 0.91, 0.94), borderW: 0.5, text: C.tableHead },
      rowLine: T(0.91, 0.92, 0.94),
      cell: T(0.14, 0.16, 0.2),
      num: T(0.22, 0.24, 0.28),
      lineTotal: T(0.1, 0.12, 0.16),
      bottom: T(0.88, 0.89, 0.92),
    },
    timeSummary: {
      heading: T(0.42, 0.44, 0.5),
      caption: T(0.45, 0.47, 0.52),
      line: T(0.14, 0.16, 0.2),
      footer: T(0.12, 0.13, 0.16),
    },
    totals: {
      heading: T(0.42, 0.44, 0.5),
      key: T(0.38, 0.4, 0.45),
      value: T(0.28, 0.3, 0.34),
      valueStrong: T(0.06, 0.08, 0.12),
      mut: T(0.1, 0.11, 0.14),
    },
    earlyPay: {
      fill: T(0.98, 0.99, 0.99),
      border: T(0.91, 0.92, 0.94),
      title: T(0.32, 0.34, 0.4),
      line: T(0.35, 0.37, 0.42),
      strong: T(0.12, 0.14, 0.18),
      foot: T(0.48, 0.5, 0.55),
    },
    schedule: { title: T(0.22, 0.24, 0.3), line: T(0.28, 0.3, 0.34) },
    payment: { cap: T(0.5, 0.52, 0.56), title: T(0.2, 0.22, 0.28), line: T(0.2, 0.22, 0.28), field: T(0.32, 0.34, 0.38) },
    notes: { title: T(0.45, 0.47, 0.52), body: T(0.38, 0.4, 0.44) },
  },
  modern: {
    topAccent: T(0.88, 0.92, 0.99),
    companyName: T(0.1, 0.12, 0.16),
    address: T(0.36, 0.4, 0.46),
    taxId: T(0.48, 0.5, 0.55),
    rightBlockLabel: T(0.45, 0.48, 0.55),
    rightBlockValue: T(0.16, 0.2, 0.28),
    rightTitle: T(0.06, 0.1, 0.18),
    rightTitleSize: 27,
    rightInvoiceSub: T(0.18, 0.22, 0.3),
    amountBand: {
      fill: T(0.95, 0.97, 0.99),
      border: T(0.82, 0.86, 0.92),
      borderW: 0.5,
      label: T(0.34, 0.4, 0.48),
      value: T(0.04, 0.08, 0.16),
    },
    billToLabel: T(0.48, 0.52, 0.6),
    body: T(0.12, 0.16, 0.24),
    meta: T(0.42, 0.45, 0.52),
    table: {
      head: { fill: T(0.93, 0.95, 0.99), border: T(0.8, 0.84, 0.9), borderW: 0.5, text: T(0.32, 0.38, 0.5) },
      rowLine: T(0.86, 0.9, 0.96),
      cell: T(0.1, 0.14, 0.24),
      num: T(0.18, 0.22, 0.3),
      lineTotal: T(0.04, 0.1, 0.2),
      bottom: T(0.78, 0.84, 0.92),
    },
    timeSummary: {
      heading: T(0.32, 0.4, 0.52),
      caption: T(0.4, 0.44, 0.5),
      line: T(0.1, 0.16, 0.26),
      footer: T(0.08, 0.12, 0.22),
    },
    totals: {
      heading: T(0.32, 0.4, 0.5),
      key: T(0.34, 0.4, 0.48),
      value: T(0.25, 0.3, 0.4),
      valueStrong: T(0.04, 0.1, 0.2),
      mut: T(0.1, 0.14, 0.2),
    },
    earlyPay: {
      fill: T(0.95, 0.97, 0.99),
      border: T(0.82, 0.86, 0.92),
      title: T(0.25, 0.32, 0.45),
      line: T(0.32, 0.36, 0.44),
      strong: T(0.05, 0.12, 0.25),
      foot: T(0.42, 0.46, 0.55),
    },
    schedule: { title: T(0.12, 0.18, 0.3), line: T(0.2, 0.26, 0.4) },
    payment: { cap: T(0.42, 0.5, 0.58), title: T(0.14, 0.2, 0.32), line: T(0.14, 0.2, 0.32), field: T(0.28, 0.35, 0.45) },
    notes: { title: T(0.4, 0.44, 0.5), body: T(0.32, 0.38, 0.45) },
  },
  minimal: {
    topAccent: null,
    companyName: T(0.15, 0.15, 0.16),
    address: T(0.42, 0.43, 0.45),
    taxId: T(0.5, 0.51, 0.52),
    rightBlockLabel: T(0.52, 0.52, 0.54),
    rightBlockValue: T(0.2, 0.2, 0.22),
    rightTitle: T(0.1, 0.1, 0.1),
    rightTitleSize: 25,
    rightInvoiceSub: T(0.28, 0.28, 0.3),
    amountBand: {
      fill: T(1, 1, 1),
      border: T(0.9, 0.9, 0.9),
      borderW: 0.35,
      label: T(0.4, 0.4, 0.44),
      value: T(0.08, 0.08, 0.1),
    },
    billToLabel: T(0.55, 0.55, 0.58),
    body: T(0.2, 0.2, 0.22),
    meta: T(0.46, 0.46, 0.5),
    table: {
      head: { fill: T(1, 1, 1), border: T(0.8, 0.8, 0.8), borderW: 0.4, text: T(0.4, 0.4, 0.45) },
      rowLine: T(0.88, 0.88, 0.9),
      cell: T(0.16, 0.16, 0.18),
      num: T(0.3, 0.3, 0.32),
      lineTotal: T(0.1, 0.1, 0.12),
      bottom: T(0.82, 0.82, 0.84),
    },
    timeSummary: {
      heading: T(0.4, 0.4, 0.44),
      caption: T(0.46, 0.46, 0.5),
      line: T(0.18, 0.18, 0.2),
      footer: T(0.12, 0.12, 0.15),
    },
    totals: {
      heading: T(0.4, 0.4, 0.44),
      key: T(0.4, 0.4, 0.45),
      value: T(0.32, 0.32, 0.36),
      valueStrong: T(0.06, 0.06, 0.08),
      mut: T(0.1, 0.1, 0.12),
    },
    earlyPay: {
      fill: T(0.99, 0.99, 0.99),
      border: T(0.88, 0.88, 0.9),
      title: T(0.3, 0.3, 0.35),
      line: T(0.36, 0.36, 0.4),
      strong: T(0.1, 0.1, 0.12),
      foot: T(0.48, 0.48, 0.52),
    },
    schedule: { title: T(0.22, 0.22, 0.26), line: T(0.32, 0.32, 0.35) },
    payment: { cap: T(0.5, 0.5, 0.54), title: T(0.2, 0.2, 0.24), line: T(0.2, 0.2, 0.24), field: T(0.34, 0.34, 0.38) },
    notes: { title: T(0.45, 0.45, 0.5), body: T(0.4, 0.4, 0.45) },
  },
  bold: {
    topAccent: null,
    companyName: T(0, 0, 0),
    address: T(0.2, 0.22, 0.26),
    taxId: T(0.4, 0.42, 0.45),
    rightBlockLabel: T(0.35, 0.38, 0.45),
    rightBlockValue: T(0, 0, 0.05),
    rightTitle: T(0, 0, 0.02),
    rightTitleSize: 28,
    rightInvoiceSub: T(0.05, 0.1, 0.2),
    amountBand: {
      fill: T(0.93, 0.94, 0.98),
      border: T(0.12, 0.14, 0.2),
      borderW: 1.1,
      label: T(0.1, 0.12, 0.2),
      value: T(0, 0, 0.08),
    },
    billToLabel: T(0.1, 0.12, 0.2),
    body: T(0, 0.04, 0.12),
    meta: T(0.3, 0.33, 0.4),
    table: {
      head: { fill: T(0.88, 0.9, 0.94), border: T(0.12, 0.14, 0.2), borderW: 0.8, text: T(0.1, 0.12, 0.2) },
      rowLine: T(0.78, 0.8, 0.86),
      cell: T(0, 0.04, 0.12),
      num: T(0.1, 0.14, 0.2),
      lineTotal: T(0, 0, 0.1),
      bottom: T(0.6, 0.62, 0.7),
    },
    timeSummary: {
      heading: T(0.1, 0.14, 0.2),
      caption: T(0.35, 0.38, 0.45),
      line: T(0, 0.05, 0.12),
      footer: T(0, 0.04, 0.12),
    },
    totals: {
      heading: T(0.1, 0.14, 0.2),
      key: T(0.15, 0.18, 0.25),
      value: T(0.15, 0.18, 0.25),
      valueStrong: T(0, 0, 0.1),
      mut: T(0, 0.02, 0.1),
    },
    earlyPay: {
      fill: T(0.95, 0.96, 0.99),
      border: T(0.2, 0.24, 0.35),
      title: T(0, 0.1, 0.2),
      line: T(0.1, 0.14, 0.2),
      strong: T(0, 0.05, 0.12),
      foot: T(0.35, 0.4, 0.48),
    },
    schedule: { title: T(0, 0.1, 0.2), line: T(0.1, 0.16, 0.24) },
    payment: { cap: T(0.2, 0.24, 0.3), title: T(0, 0.08, 0.2), line: T(0, 0.08, 0.2), field: T(0.1, 0.14, 0.2) },
    notes: { title: T(0.15, 0.18, 0.25), body: T(0.1, 0.14, 0.2) },
  },
  elegant: {
    topAccent: null,
    companyName: T(0.18, 0.14, 0.1),
    address: T(0.4, 0.36, 0.3),
    taxId: T(0.5, 0.46, 0.4),
    rightBlockLabel: T(0.48, 0.45, 0.4),
    rightBlockValue: T(0.2, 0.16, 0.1),
    rightTitle: T(0.2, 0.14, 0.1),
    rightTitleSize: 25,
    rightInvoiceSub: T(0.35, 0.3, 0.24),
    amountBand: {
      fill: T(0.98, 0.97, 0.95),
      border: T(0.8, 0.76, 0.7),
      borderW: 0.65,
      label: T(0.42, 0.4, 0.36),
      value: T(0.1, 0.08, 0.04),
    },
    billToLabel: T(0.45, 0.4, 0.34),
    body: T(0.2, 0.16, 0.1),
    meta: T(0.38, 0.36, 0.32),
    table: {
      head: { fill: T(0.97, 0.95, 0.92), border: T(0.78, 0.72, 0.66), borderW: 0.5, text: T(0.34, 0.3, 0.25) },
      rowLine: T(0.88, 0.84, 0.78),
      cell: T(0.18, 0.15, 0.1),
      num: T(0.3, 0.26, 0.2),
      lineTotal: T(0.1, 0.08, 0.04),
      bottom: T(0.78, 0.74, 0.68),
    },
    timeSummary: {
      heading: T(0.34, 0.3, 0.25),
      caption: T(0.4, 0.38, 0.32),
      line: T(0.18, 0.15, 0.1),
      footer: T(0.15, 0.12, 0.08),
    },
    totals: {
      heading: T(0.34, 0.3, 0.25),
      key: T(0.4, 0.36, 0.3),
      value: T(0.35, 0.32, 0.28),
      valueStrong: T(0.1, 0.08, 0.04),
      mut: T(0.12, 0.1, 0.06),
    },
    earlyPay: {
      fill: T(0.99, 0.98, 0.96),
      border: T(0.8, 0.76, 0.7),
      title: T(0.25, 0.2, 0.14),
      line: T(0.3, 0.26, 0.2),
      strong: T(0.12, 0.1, 0.06),
      foot: T(0.4, 0.38, 0.32),
    },
    schedule: { title: T(0.2, 0.16, 0.1), line: T(0.3, 0.26, 0.2) },
    payment: { cap: T(0.45, 0.4, 0.34), title: T(0.18, 0.15, 0.1), line: T(0.18, 0.15, 0.1), field: T(0.28, 0.25, 0.2) },
    notes: { title: T(0.4, 0.36, 0.3), body: T(0.32, 0.28, 0.24) },
  },
};

export function getInvoicePdfPaint(id: InvoiceTemplateId): InvoicePdfPaint {
  return PAINT[id] ?? PAINT.classic;
}
