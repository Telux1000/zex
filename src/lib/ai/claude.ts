import Anthropic from '@anthropic-ai/sdk';

const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-latest';
const CLAUDE_FALLBACK_MODELS = Array.from(
  new Set([
    CLAUDE_MODEL,
    // Prefer stable dated model IDs over moving aliases.
    'claude-3-5-sonnet-20241022',
    'claude-3-7-sonnet-20250219',
    'claude-sonnet-4-20250514',
  ])
);

export const CLAUDE_FALLBACK_MODELS_LIST = CLAUDE_FALLBACK_MODELS;

export function getClaudeClient(): Anthropic {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    throw new Error('Missing CLAUDE_API_KEY');
  }
  return new Anthropic({ apiKey });
}

function extractTextFromClaudeResponse(
  content: Anthropic.Messages.Message['content']
): string {
  return content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('\n')
    .trim();
}

function extractJson(text: string): string {
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

export async function claudeJson<T>(args: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<T> {
  const client = getClaudeClient();
  let response: Anthropic.Messages.Message | null = null;
  let lastError: unknown = null;

  for (const model of CLAUDE_FALLBACK_MODELS) {
    try {
      response = await client.messages.create({
        model,
        max_tokens: args.maxTokens ?? 1200,
        temperature: 0.1,
        system: args.system,
        messages: [{ role: 'user', content: args.prompt }],
      });
      break;
    } catch (e) {
      lastError = e;
      const message = e instanceof Error ? e.message.toLowerCase() : '';
      const canRetryWithAnotherModel =
        message.includes('model') ||
        message.includes('not found') ||
        message.includes('unsupported') ||
        message.includes('invalid_request_error');
      if (!canRetryWithAnotherModel) break;
    }
  }

  if (!response) {
    if (lastError instanceof Error) {
      throw new Error(
        `${lastError.message} (tried models: ${CLAUDE_FALLBACK_MODELS.join(', ')})`
      );
    }
    throw new Error('Claude request failed');
  }

  const text = extractTextFromClaudeResponse(response.content);
  const raw = extractJson(text);
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Claude returned invalid JSON');
  }
}

