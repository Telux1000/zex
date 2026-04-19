import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import type { InvoiceDocumentPayload, InvoiceDocTextLine } from '@/lib/invoices/invoice-document-payload';

function clampText(s: string, max = 3000) {
  const t = String(s ?? '').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function splitLines(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

async function tryEmbedLogo(pdfDoc: PDFDocument, logoUrl?: string | null) {
  const url = String(logoUrl ?? '').trim();
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const ctype = String(res.headers.get('content-type') ?? '').toLowerCase();
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (ctype.includes('png')) {
      const image = await pdfDoc.embedPng(bytes);
      return { image, kind: 'png' as const };
    }
    if (ctype.includes('jpeg') || ctype.includes('jpg')) {
      const image = await pdfDoc.embedJpg(bytes);
      return { image, kind: 'jpg' as const };
    }
    return null;
  } catch {
    return null;
  }
}

type PdfContext = {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument['addPage']>;
  width: number;
  height: number;
  marginX: number;
  marginBottom: number;
  fontRegular: Awaited<ReturnType<PDFDocument['embedFont']>>;
  fontBold: Awaited<ReturnType<PDFDocument['embedFont']>>;
  y: number;
};

const A4 = [595.28, 841.89] as const;

function ensureSpace(
  ctx: PdfContext,
  need: number,
  minBottom?: number,
  onNewPage?: () => void
): boolean {
  const floor = minBottom ?? ctx.marginBottom;
  if (ctx.y - need < floor) {
    ctx.page = ctx.pdfDoc.addPage([...A4]);
    ctx.y = ctx.height - 48;
    onNewPage?.();
    return true;
  }
  return false;
}

function textWidth(font: PdfContext['fontRegular'], text: string, size: number) {
  return font.widthOfTextAtSize(clampText(text, 500), size);
}

function drawVoidWatermark(
  ctx: PdfContext,
  fontBold: PdfContext['fontBold']
) {
  ctx.page.drawText('VOIDED', {
    x: ctx.width / 2 - 72,
    y: ctx.height / 2,
    size: 40,
    font: fontBold,
    color: rgb(0.78, 0.78, 0.82),
    opacity: 0.35,
    rotate: degrees(-18),
  });
}

function flattenBillToLines(lines: InvoiceDocTextLine[]): string[] {
  const out: string[] = [];
  for (const ln of lines) {
    if (ln.preWrap) {
      splitLines(ln.text, 90).forEach((t) => out.push(t));
    } else {
      out.push(ln.text);
    }
  }
  return out;
}

export async function buildInvoicePdfBase64(
  doc: InvoiceDocumentPayload,
  paymentUrl?: string | null
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([...A4]);
  const { width, height } = page.getSize();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 48;
  const marginTop = 48;
  const marginBottom = 48;

  const ctx: PdfContext = {
    pdfDoc,
    page,
    width,
    height,
    marginX,
    marginBottom,
    fontRegular,
    fontBold,
    y: height - marginTop,
  };

  const drawText = (
    text: string,
    opts: {
      x: number;
      y: number;
      size: number;
      font: typeof fontRegular;
      color?: ReturnType<typeof rgb>;
      maxWidth?: number;
      opacity?: number;
    }
  ) => {
    ctx.page.drawText(clampText(text), opts);
  };

  const drawRight = (
    text: string,
    rightX: number,
    y: number,
    size: number,
    font: typeof fontRegular,
    color: ReturnType<typeof rgb>
  ) => {
    const w = textWidth(font, text, size);
    drawText(text, { x: rightX - w, y, size, font, color });
  };

  const stampVoid = () => {
    if (doc.voided) drawVoidWatermark(ctx, fontBold);
  };
  stampVoid();

  const logo = await tryEmbedLogo(pdfDoc, doc.company.logoUrl);
  const leftColX = marginX;
  const leftColW = width * 0.46;
  let leftCursorY = ctx.y;

  if (logo) {
    const maxW = 100;
    const maxH = 44;
    const ratio = Math.min(maxW / logo.image.width, maxH / logo.image.height);
    const lw = logo.image.width * ratio;
    const lh = logo.image.height * ratio;
    ctx.page.drawImage(logo.image, {
      x: leftColX,
      y: leftCursorY - lh,
      width: lw,
      height: lh,
    });
    leftCursorY -= lh + 10;
  }

  drawText(doc.company.name || 'Company', {
    x: leftColX,
    y: leftCursorY,
    size: 12,
    font: fontBold,
    color: rgb(0.12, 0.13, 0.16),
    maxWidth: leftColW,
  });
  leftCursorY -= 16;

  for (const line of doc.company.addressLines) {
    drawText(line, {
      x: leftColX,
      y: leftCursorY,
      size: 9,
      font: fontRegular,
      color: rgb(0.38, 0.4, 0.45),
      maxWidth: leftColW,
    });
    leftCursorY -= 11;
  }
  if (doc.company.taxIdLine) {
    drawText(doc.company.taxIdLine, {
      x: leftColX,
      y: leftCursorY,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.5, 0.52, 0.56),
      maxWidth: leftColW,
    });
    leftCursorY -= 11;
  }

  const rightX = width - marginX;
  const rightBlockLeft = width * 0.52;
  let rightY = ctx.y - 2;

  drawRight('INVOICE', rightX, rightY, 26, fontBold, rgb(0.08, 0.09, 0.12));
  rightY -= 30;

  drawRight(`# ${doc.invoiceMeta.invoiceNumber}`, rightX, rightY, 11, fontBold, rgb(0.22, 0.24, 0.3));
  rightY -= 16;

  drawText('Issue date', {
    x: rightBlockLeft,
    y: rightY,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.52, 0.56),
  });
  drawRight(doc.invoiceMeta.issueDateFormatted, rightX, rightY, 9, fontBold, rgb(0.2, 0.22, 0.28));
  rightY -= 13;

  drawText('Due date', {
    x: rightBlockLeft,
    y: rightY,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.52, 0.56),
  });
  drawRight(doc.invoiceMeta.dueDateFormatted, rightX, rightY, 9, fontBold, rgb(0.2, 0.22, 0.28));
  rightY -= 13;

  drawText('Currency', {
    x: rightBlockLeft,
    y: rightY,
    size: 8,
    font: fontRegular,
    color: rgb(0.5, 0.52, 0.56),
  });
  drawRight(doc.invoiceMeta.currency, rightX, rightY, 9, fontBold, rgb(0.2, 0.22, 0.28));
  rightY -= 14;

  const headerBottom = Math.min(leftCursorY, rightY) - 8;
  ctx.y = headerBottom;

  const amountBandH = 52;
  ensureSpace(ctx, amountBandH + 24, marginBottom, stampVoid);
  ctx.page.drawRectangle({
    x: marginX,
    y: ctx.y - amountBandH,
    width: width - marginX * 2,
    height: amountBandH,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.9, 0.91, 0.94),
    borderWidth: 0.75,
  });
  drawText('Amount due', {
    x: marginX + 16,
    y: ctx.y - 22,
    size: 9,
    font: fontBold,
    color: rgb(0.38, 0.4, 0.46),
  });
  drawRight(doc.totals.balanceDue, rightX - 16, ctx.y - 28, 20, fontBold, rgb(0.06, 0.08, 0.12));
  ctx.y -= amountBandH + 20;

  const billW = width - marginX * 2;
  const billLeftX = marginX;

  ensureSpace(ctx, 96, marginBottom, stampVoid);

  drawText('Bill to', {
    x: billLeftX,
    y: ctx.y,
    size: 8,
    font: fontBold,
    color: rgb(0.55, 0.57, 0.62),
  });
  ctx.y -= 14;

  const billLinesLeft = [
    ...flattenBillToLines(doc.billTo.billing.lines),
    ...(doc.billTo.delivery ? flattenBillToLines(doc.billTo.delivery.lines) : []),
  ];

  let yL = ctx.y;
  for (const line of billLinesLeft) {
    drawText(line, {
      x: billLeftX,
      y: yL,
      size: 9,
      font: fontRegular,
      color: rgb(0.18, 0.2, 0.24),
      maxWidth: billW,
    });
    yL -= 11;
  }
  ctx.y = yL - 18;

  const metaLines: string[] = [];
  if (doc.invoiceMeta.referencePo) metaLines.push(`Reference / PO: ${doc.invoiceMeta.referencePo}`);
  if (doc.invoiceMeta.sourceQuoteNumber) metaLines.push(`From quote: ${doc.invoiceMeta.sourceQuoteNumber}`);
  if (metaLines.length > 0) {
    ensureSpace(ctx, metaLines.length * 12 + 8, marginBottom, stampVoid);
    for (const ml of metaLines) {
      drawText(ml, {
        x: marginX,
        y: ctx.y,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.45, 0.47, 0.52),
        maxWidth: width - marginX * 2,
      });
      ctx.y -= 12;
    }
    ctx.y -= 6;
  }

  const tableX = marginX;
  const tableW = width - marginX * 2;
  const descW = Math.floor(tableW * 0.34);
  const qtyW = Math.floor(tableW * 0.08);
  const unitLblW = Math.floor(tableW * 0.1);
  const rateW = Math.floor(tableW * 0.16);
  const taxW = Math.floor(tableW * 0.1);
  const col = {
    desc: descW,
    qty: qtyW,
    unitLabel: unitLblW,
    rate: rateW,
    tax: taxW,
    total: tableW - descW - qtyW - unitLblW - rateW - taxW,
  };

  ensureSpace(ctx, 36, marginBottom + 60, stampVoid);
  ctx.y -= 14;

  const headerH = 22;
  ctx.page.drawRectangle({
    x: tableX,
    y: ctx.y - headerH,
    width: tableW,
    height: headerH,
    color: rgb(0.96, 0.97, 0.99),
    borderColor: rgb(0.9, 0.91, 0.94),
    borderWidth: 0.5,
  });
  const headerY = ctx.y - 15;
  drawText('Description', {
    x: tableX + 10,
    y: headerY,
    size: 8.5,
    font: fontBold,
    color: rgb(0.42, 0.44, 0.5),
  });
  drawRight('Qty', tableX + col.desc + col.qty - 4, headerY, 8.5, fontBold, rgb(0.42, 0.44, 0.5));
  drawRight('Unit', tableX + col.desc + col.qty + col.unitLabel - 4, headerY, 8.5, fontBold, rgb(0.42, 0.44, 0.5));
  drawRight('Rate', tableX + col.desc + col.qty + col.unitLabel + col.rate - 4, headerY, 8.5, fontBold, rgb(0.42, 0.44, 0.5));
  drawRight('Tax', tableX + col.desc + col.qty + col.unitLabel + col.rate + col.tax - 4, headerY, 8.5, fontBold, rgb(0.42, 0.44, 0.5));
  drawRight('Amount', tableX + tableW - 10, headerY, 8.5, fontBold, rgb(0.42, 0.44, 0.5));
  ctx.y -= headerH;

  const rows = doc.lineItems.length > 0 ? doc.lineItems : [
    {
      name: 'Invoice amount',
      description: null,
      quantity: '1',
      unitLabelDisplay: 'Item',
      unitPriceDisplay: doc.totals.total,
      taxPercentDisplay: '—',
      lineTotalDisplay: doc.totals.total,
    },
  ];

  for (let i = 0; i < rows.slice(0, 40).length; i++) {
    const item = rows[i];
    const descText =
      item.description && String(item.description).trim() ? `${item.name} — ${item.description}` : item.name;
    const descLines = splitLines(descText, 52).slice(0, 4);
    const rowBodyH = Math.max(22, 10 + descLines.length * 10);
    const rowH = rowBodyH + 2;

    ensureSpace(ctx, rowH + 8, marginBottom + 80, stampVoid);

    ctx.page.drawLine({
      start: { x: tableX, y: ctx.y },
      end: { x: tableX + tableW, y: ctx.y },
      thickness: 0.35,
      color: rgb(0.91, 0.92, 0.94),
    });

    let descY = ctx.y - 12;
    for (const ln of descLines) {
      drawText(ln, {
        x: tableX + 10,
        y: descY,
        size: 9,
        font: fontRegular,
        color: rgb(0.14, 0.16, 0.2),
        maxWidth: col.desc - 8,
      });
      descY -= 10;
    }

    const numY = ctx.y - 14;
    drawRight(item.quantity, tableX + col.desc + col.qty - 4, numY, 9, fontRegular, rgb(0.22, 0.24, 0.28));
    drawRight(
      item.unitLabelDisplay,
      tableX + col.desc + col.qty + col.unitLabel - 4,
      numY,
      9,
      fontRegular,
      rgb(0.22, 0.24, 0.28)
    );
    drawRight(
      item.unitPriceDisplay,
      tableX + col.desc + col.qty + col.unitLabel + col.rate - 4,
      numY,
      9,
      fontRegular,
      rgb(0.22, 0.24, 0.28)
    );
    drawRight(
      item.taxPercentDisplay,
      tableX + col.desc + col.qty + col.unitLabel + col.rate + col.tax - 4,
      numY,
      9,
      fontRegular,
      rgb(0.22, 0.24, 0.28)
    );
    drawRight(item.lineTotalDisplay, tableX + tableW - 10, numY, 9, fontBold, rgb(0.1, 0.12, 0.16));

    ctx.y -= rowH;
  }

  ctx.page.drawLine({
    start: { x: tableX, y: ctx.y },
    end: { x: tableX + tableW, y: ctx.y },
    thickness: 0.5,
    color: rgb(0.88, 0.89, 0.92),
  });
  ctx.y -= 14;

  if (doc.timeSummary && doc.timeSummary.rows.length > 0) {
    const TIME_SUMMARY_CAPTION =
      'Work breakdown from hour-based lines above. Invoice totals are calculated in the section below.';
    const captionLines = splitLines(TIME_SUMMARY_CAPTION, 88);
    const tsBlockH =
      18 + captionLines.length * 9 + 8 + doc.timeSummary.rows.length * 14 + 26;
    ensureSpace(ctx, tsBlockH, marginBottom + 80, stampVoid);
    drawText('Time Summary', {
      x: tableX,
      y: ctx.y - 10,
      size: 8.5,
      font: fontBold,
      color: rgb(0.42, 0.44, 0.5),
    });
    ctx.y -= 18;
    for (const ln of captionLines) {
      ensureSpace(ctx, 12, marginBottom + 80, stampVoid);
      drawText(ln, {
        x: tableX,
        y: ctx.y - 8,
        size: 7.5,
        font: fontRegular,
        color: rgb(0.45, 0.47, 0.52),
        maxWidth: tableW - 4,
      });
      ctx.y -= 9;
    }
    ctx.y -= 6;
    for (const row of doc.timeSummary.rows) {
      ensureSpace(ctx, 16, marginBottom + 80, stampVoid);
      const rowY = ctx.y - 10;
      drawText(row.assignee, {
        x: tableX + 8,
        y: rowY,
        size: 9,
        font: fontRegular,
        color: rgb(0.14, 0.16, 0.2),
        maxWidth: col.desc,
      });
      drawRight(row.detail, tableX + col.desc + col.qty + col.unitLabel + col.rate - 4, rowY, 9, fontRegular, rgb(0.22, 0.24, 0.28));
      drawRight(row.amount, tableX + tableW - 10, rowY, 9, fontBold, rgb(0.1, 0.12, 0.16));
      ctx.y -= 14;
    }
    ctx.page.drawLine({
      start: { x: tableX, y: ctx.y },
      end: { x: tableX + tableW, y: ctx.y },
      thickness: 0.35,
      color: rgb(0.91, 0.92, 0.94),
    });
    ctx.y -= 12;
    const footY = ctx.y - 10;
    drawText(doc.timeSummary.footer.label, {
      x: tableX + 8,
      y: footY,
      size: 9,
      font: fontBold,
      color: rgb(0.12, 0.13, 0.16),
    });
    drawRight(doc.timeSummary.footer.hours, tableX + tableW - 10, footY, 9, fontBold, rgb(0.12, 0.13, 0.16));
    ctx.y -= 22;
  } else {
    ctx.y -= 6;
  }

  const totalsW = 216;
  const totalsRight = width - marginX;
  const totalsLeft = totalsRight - totalsW;

  const totalsRows: Array<[string, string, boolean]> = [
    ['Subtotal', doc.totals.subtotal, false],
    ...(doc.totals.discountLine
      ? [[`${doc.totals.discountLine.label}`, doc.totals.discountLine.amount, false] as [string, string, boolean]]
      : []),
    [doc.totals.taxLine.label, doc.totals.taxLine.amount, false],
    ['Total', doc.totals.total, true],
    ['Paid', doc.totals.paid, false],
    ['Balance due', doc.totals.balanceDue, true],
  ];

  const totalsBlockH = totalsRows.length * 17 + 8 + 14;
  ensureSpace(ctx, totalsBlockH + 16, marginBottom, stampVoid);

  let ty = ctx.y - 6;
  drawText('Invoice totals', {
    x: totalsLeft,
    y: ty,
    size: 8,
    font: fontBold,
    color: rgb(0.42, 0.44, 0.5),
  });
  ty -= 14;
  for (const [k, v, emphasize] of totalsRows) {
    const sz = emphasize ? 10.5 : 9;
    drawText(k, {
      x: totalsLeft,
      y: ty,
      size: sz,
      font: emphasize ? fontBold : fontRegular,
      color: emphasize ? rgb(0.1, 0.11, 0.14) : rgb(0.38, 0.4, 0.45),
    });
    drawRight(v, totalsRight, ty, sz, emphasize ? fontBold : fontRegular, emphasize ? rgb(0.06, 0.08, 0.12) : rgb(0.28, 0.3, 0.34));
    ty -= emphasize ? 18 : 16;
  }
  ctx.y = ty - 8;

  if (doc.totals.earlyPayment) {
    ensureSpace(ctx, 72, marginBottom, stampVoid);
    ctx.y -= 6;
    ctx.page.drawRectangle({
      x: marginX,
      y: ctx.y - 58,
      width: width - marginX * 2,
      height: 58,
      color: rgb(0.98, 0.99, 0.99),
      borderColor: rgb(0.91, 0.92, 0.94),
      borderWidth: 0.5,
    });
    drawText('Early payment discount', {
      x: marginX + 12,
      y: ctx.y - 14,
      size: 9,
      font: fontBold,
      color: rgb(0.32, 0.34, 0.4),
    });
    drawText(`Original total  ${doc.totals.earlyPayment.originalTotal}`, {
      x: marginX + 12,
      y: ctx.y - 28,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.35, 0.37, 0.42),
    });
    drawText(`${doc.totals.earlyPayment.discountLabel}  ${doc.totals.earlyPayment.discountAmount}`, {
      x: marginX + 12,
      y: ctx.y - 40,
      size: 8.5,
      font: fontRegular,
      color: rgb(0.35, 0.37, 0.42),
      maxWidth: width - marginX * 2 - 24,
    });
    drawText(`Effective payable  ${doc.totals.earlyPayment.payableAmount}`, {
      x: marginX + 12,
      y: ctx.y - 52,
      size: 9,
      font: fontBold,
      color: rgb(0.12, 0.14, 0.18),
    });
    ctx.y -= 66;
    drawText(doc.totals.earlyPayment.footnote, {
      x: marginX,
      y: ctx.y,
      size: 8,
      font: fontRegular,
      color: rgb(0.48, 0.5, 0.55),
      maxWidth: width - marginX * 2,
    });
    ctx.y -= 12;
  }

  if (doc.schedule && doc.schedule.length > 0) {
    ensureSpace(ctx, 28, marginBottom, stampVoid);
    ctx.y -= 8;
    drawText('Payment schedule', {
      x: marginX,
      y: ctx.y,
      size: 10,
      font: fontBold,
      color: rgb(0.22, 0.24, 0.3),
    });
    ctx.y -= 16;
    for (const row of doc.schedule.slice(0, 20)) {
      ensureSpace(ctx, 14, marginBottom, stampVoid);
      const line = `${row.description}  ·  ${row.amount}  ·  Due ${row.dueDate}  ·  ${row.status}`;
      drawText(clampText(line, 240), {
        x: marginX,
        y: ctx.y,
        size: 8.5,
        font: fontRegular,
        color: rgb(0.28, 0.3, 0.34),
        maxWidth: width - marginX * 2,
      });
      ctx.y -= 12;
    }
    ctx.y -= 8;
  }

  if (doc.paymentMethods) {
    const hasBankCols =
      Boolean(doc.paymentMethods.bankTransfer) ||
      Boolean(doc.paymentMethods.internationalBankTransfer);
    const colGap = 24;
    const colW = (width - marginX * 2 - colGap) / 2;
    const leftColX = marginX;
    const rightColX = marginX + colW + colGap;

    let sectionHeight = 26;
    if (hasBankCols) {
      const leftRows = doc.paymentMethods.bankTransfer
        ? 1 + doc.paymentMethods.bankTransfer.fields.length
        : 0;
      const rightRows = doc.paymentMethods.internationalBankTransfer
        ? 1 + doc.paymentMethods.internationalBankTransfer.fields.length
        : 0;
      sectionHeight += Math.max(leftRows, rightRows) * 12 + 8;
    }
    for (const block of doc.paymentMethods.additionalBlocks) {
      sectionHeight += 14 + block.lines.reduce((sum, ln) => sum + splitLines(ln, 88).length * 10, 0) + 6;
    }

    ensureSpace(ctx, sectionHeight + 34, marginBottom, stampVoid);
    ctx.y -= 22;
    drawText('PAYMENT METHODS', {
      x: marginX,
      y: ctx.y,
      size: 8.5,
      font: fontBold,
      color: rgb(0.5, 0.52, 0.56),
    });
    ctx.y -= 16;

    if (hasBankCols) {
      let yLeft = ctx.y;
      let yRight = ctx.y;
      if (doc.paymentMethods.bankTransfer) {
        drawText(doc.paymentMethods.bankTransfer.title, {
          x: leftColX,
          y: yLeft,
          size: 9.5,
          font: fontBold,
          color: rgb(0.2, 0.22, 0.28),
        });
        yLeft -= 12;
        for (const field of doc.paymentMethods.bankTransfer.fields) {
          drawText(`${field.label}: ${field.value}`, {
            x: leftColX,
            y: yLeft,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.32, 0.34, 0.38),
            maxWidth: colW,
          });
          yLeft -= 10;
        }
      }
      if (doc.paymentMethods.internationalBankTransfer) {
        drawText(doc.paymentMethods.internationalBankTransfer.title, {
          x: rightColX,
          y: yRight,
          size: 9.5,
          font: fontBold,
          color: rgb(0.2, 0.22, 0.28),
        });
        yRight -= 12;
        for (const field of doc.paymentMethods.internationalBankTransfer.fields) {
          drawText(`${field.label}: ${field.value}`, {
            x: rightColX,
            y: yRight,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.32, 0.34, 0.38),
            maxWidth: colW,
          });
          yRight -= 10;
        }
      }
      ctx.y = Math.min(yLeft, yRight) - 8;
    }

    for (const block of doc.paymentMethods.additionalBlocks) {
      drawText(block.title, {
        x: marginX,
        y: ctx.y,
        size: 9.5,
        font: fontBold,
        color: rgb(0.2, 0.22, 0.28),
      });
      ctx.y -= 12;
      for (const ln of block.lines) {
        for (const sub of splitLines(ln, 92)) {
          drawText(sub, {
            x: marginX,
            y: ctx.y,
            size: 8.5,
            font: fontRegular,
            color: rgb(0.32, 0.34, 0.38),
            maxWidth: width - marginX * 2,
          });
          ctx.y -= 10;
        }
      }
      ctx.y -= 6;
    }
  }

  if (doc.notesTerms && (doc.notesTerms.notes || doc.notesTerms.terms)) {
    ensureSpace(ctx, 32, marginBottom, stampVoid);
    ctx.y -= 8;
    drawText('Notes & terms', {
      x: marginX,
      y: ctx.y,
      size: 9,
      font: fontBold,
      color: rgb(0.45, 0.47, 0.52),
    });
    ctx.y -= 13;
    if (doc.notesTerms.notes) {
      for (const ln of splitLines(doc.notesTerms.notes, 98).slice(0, 12)) {
        ensureSpace(ctx, 10, marginBottom, stampVoid);
        drawText(ln, {
          x: marginX,
          y: ctx.y,
          size: 8,
          font: fontRegular,
          color: rgb(0.38, 0.4, 0.44),
          maxWidth: width - marginX * 2,
        });
        ctx.y -= 10;
      }
    }
    if (doc.notesTerms.terms) {
      ctx.y -= 4;
      for (const ln of splitLines(doc.notesTerms.terms, 98).slice(0, 12)) {
        ensureSpace(ctx, 10, marginBottom, stampVoid);
        drawText(ln, {
          x: marginX,
          y: ctx.y,
          size: 8,
          font: fontRegular,
          color: rgb(0.38, 0.4, 0.44),
          maxWidth: width - marginX * 2,
        });
        ctx.y -= 10;
      }
    }
  }

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes).toString('base64');
}
