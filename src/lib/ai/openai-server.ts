import OpenAI from 'openai';

let singleton: OpenAI | null = null;

/**
 * Lazily construct the OpenAI client. Avoids instantiating at module load so `next build`
 * succeeds when OPENAI_API_KEY is unset (e.g. Vercel preview without that env).
 */
export function getOpenAI(): OpenAI {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error('OPENAI_API_KEY is not configured');
  if (!singleton) singleton = new OpenAI({ apiKey: key });
  return singleton;
}

export function getOpenAIOrNull(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!singleton) singleton = new OpenAI({ apiKey: key });
  return singleton;
}
