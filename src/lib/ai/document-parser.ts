import OpenAI from 'openai';
import { parseInvoiceFromText } from '@/lib/ai/invoice-parser';
import type { ParsedInvoice } from '@/lib/validations/invoice';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const VISION_SYSTEM = `You are an OCR and invoice extraction assistant. Extract all text from this image (screenshot, document, or email). 
Format as a single block of text that could be used to create an invoice: client/customer name, line items with quantities and prices, due date if mentioned, and any notes. 
If it's an email, extract the relevant invoice details from the body. Output only the extracted text, no JSON.`;

async function extractVisionInvoiceText(imageContent: {
  type: 'image_url';
  image_url: { url: string };
}): Promise<string> {
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: VISION_SYSTEM },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract invoice-relevant text from this image:' },
          imageContent,
        ],
      },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  });

  const extracted = completion.choices[0]?.message?.content?.trim();
  if (!extracted) throw new Error('Could not extract text from image');
  return extracted;
}

/**
 * Raw OCR / vision text from a base64 image (Assistant chat upload). Same model prompt as document parse.
 */
export async function extractRawInvoiceTextFromImageBase64(
  base64: string,
  mimeType: string
): Promise<string> {
  const clean = base64.replace(/^data:image\/\w+;base64,/, '').trim();
  const mime = /^image\/(jpeg|png|webp|gif)$/i.test(mimeType) ? mimeType : 'image/jpeg';
  const dataUrl = `data:${mime};base64,${clean}`;
  return extractVisionInvoiceText({
    type: 'image_url',
    image_url: { url: dataUrl },
  });
}

/**
 * Document / screenshot pipeline: image → vision/OCR → extracted text → AI invoice parser → ParsedInvoice
 */
export async function parseInvoiceFromImage(imageUrlOrBase64: string): Promise<ParsedInvoice> {
  const isUrl = imageUrlOrBase64.startsWith('http');
  const imageContent = isUrl
    ? { type: 'image_url' as const, image_url: { url: imageUrlOrBase64 } }
    : {
        type: 'image_url' as const,
        image_url: {
          url: `data:image/jpeg;base64,${imageUrlOrBase64.replace(/^data:image\/\w+;base64,/, '')}`,
        },
      };

  const extracted = await extractVisionInvoiceText(imageContent);
  return parseInvoiceFromText(extracted);
}
