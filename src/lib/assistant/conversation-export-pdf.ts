import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import type { PersistedChatMessage } from '@/lib/assistant/conversation-storage';
import { flattenMessageForExport } from '@/lib/assistant/conversation-storage';

/**
 * Palette aligned with `RevenueOverviewChart` (revenue stroke gradient + slate axis/grid).
 * Revenue line: #6366f1 → #8b5cf6 · Grid/labels: slate-300 / slate-500
 */
function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace(/^#/, ''), 16);
  return [(n >> 16) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

const CHART_REV_INDIGO = hexRgb('#6366f1');
const CHART_REV_VIOLET = hexRgb('#8b5cf6');
const CHART_SLATE_500 = hexRgb('#64748b');
const CHART_SLATE_300 = hexRgb('#cbd5e1');
const CHART_SLATE_700 = hexRgb('#334155');

/** Standard 14 fonts are WinAnsi-oriented; map common Unicode punctuation to ASCII. */
function sanitizePdfText(input: string): string {
  const mapped = input
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // ZWSP, ZWNJ, ZWJ, BOM (avoid ? in PDF)
    .replace(/[\u200E\u200F]/g, '') // bidi marks
    // Fullwidth ASCII (e.g. ＄ U+FF04) → normal ASCII so money doesn’t show as "?10,000,000.00"
    .replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode((ch.codePointAt(0) ?? 0) - 0xfee0)
    )
    .replace(/\u2010|\u2011|\u2012|\u2013|\u2014|\u2015|\u2212/g, '-') // hyphen / en / em dash, minus
    .replace(/\u202F|\u2007|\u2009/g, ' ') // narrow nbsp, figure space, thin space → space
    .replace(/\u2026/g, '...')
    .replace(/\u2018|\u2019|\u201A|\u2032/g, "'")
    .replace(/\u201C|\u201D|\u201E|\u2033/g, '"')
    // Currency symbols outside Latin-1 (would otherwise become "?")
    .replace(/\u20AC/g, 'EUR ')
    .replace(/\u20B9/g, 'INR ')
    .replace(/\u20A6/g, 'NGN ')
    .replace(/\u20BD/g, 'RUB ')
    .replace(/\u20A9/g, 'KRW ')
    .replace(/\u20AA/g, 'ILS ')
    .replace(/\u20B1/g, 'PHP ')
    .replace(/\u20AB/g, 'VND ')
    .replace(/\u20BF/g, 'BTC ')
    .replace(/\u20BA/g, 'TRY ');
  return Array.from(mapped)
    .map((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      if (code === 9 || code === 10 || code === 13) return ch;
      if (code >= 32 && code <= 126) return ch;
      if (code >= 160 && code <= 255) return ch;
      return '?';
    })
    .join('');
}

function breakLongWord(word: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const out: string[] = [];
  let chunk = '';
  for (const ch of word) {
    const next = chunk + ch;
    if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
      chunk = next;
    } else {
      if (chunk) out.push(chunk);
      chunk = ch;
    }
  }
  if (chunk) out.push(chunk);
  return out.length ? out : [word.slice(0, 1)];
}

function wrapParagraphToWidth(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const sanitized = sanitizePdfText(text);
  const words = sanitized.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (font.widthOfTextAtSize(word, fontSize) > maxWidth) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(...breakLongWord(word, font, fontSize, maxWidth));
      continue;
    }
    const test = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(test, fontSize) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;

export async function buildConversationPdfBytes(
  messages: PersistedChatMessage[],
  title = 'Zenzex Assistant conversation'
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const maxW = PAGE_W - MARGIN * 2;

  let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const ensureLines = (count: number, lineHeight: number) => {
    if (y - count * lineHeight < MARGIN) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const drawLines = (lines: string[], opts?: { bold?: boolean; size?: number; color?: [number, number, number] }) => {
    const size = opts?.size ?? 10;
    const f = opts?.bold ? fontBold : font;
    const lh = size * 1.45;
    const [r, g, b] = opts?.color ?? CHART_SLATE_700;
    for (const raw of lines) {
      const wrapped = wrapParagraphToWidth(raw, f, size, maxW);
      for (const line of wrapped) {
        ensureLines(1, lh);
        page.drawText(line, {
          x: MARGIN,
          y,
          size,
          font: f,
          color: rgb(r, g, b),
        });
        y -= lh;
      }
    }
  };

  const yTitleBaseline = y;
  drawLines([title], { bold: true, size: 15, color: CHART_REV_INDIGO });
  const barH = 2.5;
  const gapBelowTitleGlyphs = 6;
  const stripBottom = yTitleBaseline - gapBelowTitleGlyphs - barH;
  page.drawRectangle({
    x: MARGIN,
    y: stripBottom,
    width: PAGE_W - MARGIN * 2,
    height: barH,
    color: rgb(...CHART_REV_VIOLET),
  });
  y = stripBottom - 10;
  drawLines(
    [
      'Exported for your records. Business data in Zenzex is unchanged.',
    ],
    { size: 9, color: CHART_SLATE_500 }
  );
  y -= 8;
  drawLines(['—'.repeat(56)], { size: 8, color: CHART_SLATE_300 });
  y -= 6;

  for (const msg of messages) {
    const block = flattenMessageForExport(msg).join('\n');
    const parts = block.split('\n');
    for (const p of parts) {
      drawLines([p], { size: 10 });
    }
    y -= 6;
    if (y < MARGIN + 40) {
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  }

  return pdfDoc.save();
}

export function downloadPdfFile(filename: string, bytes: Uint8Array): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
