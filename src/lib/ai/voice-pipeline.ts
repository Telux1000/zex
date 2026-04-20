import { getOpenAI } from '@/lib/ai/openai-server';
import { parseInvoiceFromText } from '@/lib/ai/invoice-parser';
import type { ParsedInvoice } from '@/lib/validations/invoice';

/**
 * Voice pipeline: audio → Whisper transcription → AI invoice parser → ParsedInvoice
 */
export async function transcribeAndParseInvoice(audioBuffer: Buffer): Promise<{
  transcript: string;
  parsed: ParsedInvoice;
}> {
  const file = new File([new Uint8Array(audioBuffer)], 'voice.webm', {
    type: 'audio/webm',
  });

  const transcription = await getOpenAI().audio.transcriptions.create({
    file,
    model: 'whisper-1',
    response_format: 'text',
  });

  const transcript =
    typeof transcription === 'string'
      ? transcription
      : (transcription as { text?: string }).text ?? '';

  if (!transcript.trim()) throw new Error('No speech detected');

  const parsed = await parseInvoiceFromText(transcript);
  return { transcript, parsed };
}
