import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

type QuotePdfInput = {
  businessName: string;
  quoteNumber: string;
  issueDate: string;
  expiryDate?: string | null;
  customerName: string;
  customerEmail?: string | null;
  currency: string;
  subtotal: number;
  tax: number;
  total: number;
  notes?: string | null;
  items: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
    tax_percent?: number;
    amount?: number;
  }>;
};

export async function buildQuotePdfBase64(input: QuotePdfInput): Promise<string> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const c = rgb(0.12, 0.14, 0.18);
  let y = 800;

  page.drawText(input.businessName || 'Business', { x: 40, y, size: 12, font: bold, color: c });
  y -= 24;
  page.drawText('QUOTE', { x: 40, y, size: 24, font: bold, color: c });
  y -= 24;
  page.drawText(`Quote #: ${input.quoteNumber}`, { x: 40, y, size: 10, font: regular, color: c });
  y -= 14;
  page.drawText(`Issue date: ${input.issueDate}`, { x: 40, y, size: 10, font: regular, color: c });
  y -= 14;
  if (input.expiryDate) {
    page.drawText(`Expiry date: ${input.expiryDate}`, { x: 40, y, size: 10, font: regular, color: c });
    y -= 14;
  }
  y -= 8;
  page.drawText(`Bill to: ${input.customerName}`, { x: 40, y, size: 10, font: regular, color: c });
  y -= 14;
  if (input.customerEmail) {
    page.drawText(input.customerEmail, { x: 40, y, size: 10, font: regular, color: c });
    y -= 14;
  }

  y -= 10;
  page.drawRectangle({ x: 40, y: y - 18, width: 515, height: 18, color: rgb(0.96, 0.97, 0.99) });
  page.drawText('Item', { x: 46, y: y - 12, size: 9, font: bold, color: c });
  page.drawText('Qty', { x: 330, y: y - 12, size: 9, font: bold, color: c });
  page.drawText('Unit', { x: 390, y: y - 12, size: 9, font: bold, color: c });
  page.drawText('Amount', { x: 485, y: y - 12, size: 9, font: bold, color: c });
  y -= 24;

  for (const item of input.items.slice(0, 26)) {
    const amount = item.amount != null ? Number(item.amount) : Number(item.quantity) * Number(item.unit_price);
    page.drawText(String(item.name ?? ''), { x: 46, y, size: 9, font: regular, color: c, maxWidth: 270 });
    page.drawText(String(item.quantity), { x: 330, y, size: 9, font: regular, color: c });
    page.drawText(`${input.currency} ${Number(item.unit_price).toFixed(2)}`, { x: 390, y, size: 9, font: regular, color: c });
    page.drawText(`${input.currency} ${amount.toFixed(2)}`, { x: 485, y, size: 9, font: regular, color: c });
    y -= 14;
    if (item.description) {
      page.drawText(String(item.description), { x: 52, y, size: 8, font: regular, color: rgb(0.4, 0.42, 0.48), maxWidth: 260 });
      y -= 12;
    }
  }

  y -= 10;
  page.drawText(`Subtotal: ${input.currency} ${Number(input.subtotal).toFixed(2)}`, { x: 380, y, size: 10, font: regular, color: c });
  y -= 14;
  page.drawText(`Tax: ${input.currency} ${Number(input.tax).toFixed(2)}`, { x: 380, y, size: 10, font: regular, color: c });
  y -= 16;
  page.drawText(`Total: ${input.currency} ${Number(input.total).toFixed(2)}`, { x: 380, y, size: 12, font: bold, color: c });

  if (input.notes?.trim()) {
    y -= 28;
    page.drawText('Notes', { x: 40, y, size: 10, font: bold, color: c });
    y -= 14;
    page.drawText(input.notes.trim(), { x: 40, y, size: 9, font: regular, color: c, maxWidth: 515 });
  }

  const bytes = await pdf.save();
  return Buffer.from(bytes).toString('base64');
}
