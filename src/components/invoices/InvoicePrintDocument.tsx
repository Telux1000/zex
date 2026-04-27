/**
 * Same saved-invoice document as dashboard / print (`InvoiceRenderer`).
 * Use for print-only and headless-PDF entry points to avoid a second design.
 */
export { InvoiceRenderer as InvoicePrintDocument, type InvoiceRendererData as InvoicePrintDocumentData } from './InvoiceRenderer';
