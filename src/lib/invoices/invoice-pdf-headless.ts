/**
 * Renders a URL in headless Chrome with print media and returns a PDF buffer.
 * Used to align PDF downloads with the same HTML/CSS as the browser’s print
 * of `InvoiceRenderer` / `InvoiceDocumentView`.
 */
export async function renderUrlToInvoicePdfBuffer(fullUrl: string): Promise<Buffer> {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 2000, deviceScaleFactor: 1 });
    await page.emulateMediaType('print');
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    // `networkidle0` rarely completes on Next.js (HMR, streaming, open connections).
    await page.goto(fullUrl, { waitUntil: 'load', timeout: 90_000 });
    await page.waitForSelector('[data-pdf-invoice-ready="1"]', { timeout: 30_000 });
    const arr = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '0.3in', right: '0.3in', bottom: '0.3in', left: '0.3in' },
    });
    return Buffer.from(arr);
  } finally {
    await page.close();
    await browser.close();
  }
}

async function launchBrowser() {
  const noSandbox = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  if (String(process.env.PUPPETEER_EXECUTABLE_PATH ?? '').trim()) {
    const p = await import('puppeteer-core');
    return p.default.launch({
      executablePath: String(process.env.PUPPETEER_EXECUTABLE_PATH).trim(),
      headless: true,
      args: noSandbox,
    });
  }
  if (String(process.env.VERCEL ?? '').trim() || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = await import('@sparticuz/chromium');
    const p = await import('puppeteer-core');
    const C = chromium.default;
    return p.default.launch({
      args: [...C.args, ...noSandbox],
      defaultViewport: { width: 1200, height: 2000, deviceScaleFactor: 1 },
      executablePath: await C.executablePath(),
      headless: true,
    });
  }
  const p = await import('puppeteer');
  return p.default.launch({ headless: true, args: noSandbox });
}
