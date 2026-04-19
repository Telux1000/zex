import type Anthropic from '@anthropic-ai/sdk';
import { getClaudeClient, CLAUDE_FALLBACK_MODELS_LIST } from '@/lib/ai/claude';

function extractAssistantText(content: Anthropic.Messages.ContentBlock[]): string {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

/**
 * Multi-turn Claude Messages API with tool_use / tool_result, matching the model fallback
 * pattern used by `claudeJson` in `claude.ts`.
 */
export async function runClaudeToolLoop(args: {
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  toolExecutor: (name: string, toolUseId: string, input: unknown) => Promise<string>;
  maxTokens?: number;
  maxToolRounds?: number;
}): Promise<{ text: string; messages: Anthropic.MessageParam[] }> {
  const client = getClaudeClient();
  const maxToolRounds = args.maxToolRounds ?? 8;
  const maxTokens = args.maxTokens ?? 8192;
  const working: Anthropic.MessageParam[] = [...args.messages];
  let lastText = '';

  for (let round = 0; round < maxToolRounds; round++) {
    let response: Anthropic.Messages.Message | null = null;
    let lastError: unknown = null;

    for (const model of CLAUDE_FALLBACK_MODELS_LIST) {
      try {
        response = await client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature: 0.2,
          system: args.system,
          tools: args.tools,
          messages: working,
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
      if (lastError instanceof Error) throw lastError;
      throw new Error('Claude request failed');
    }

    lastText = extractAssistantText(response.content) || lastText;

    if (response.stop_reason === 'end_turn') {
      working.push({ role: 'assistant', content: response.content });
      return { text: lastText, messages: working };
    }

    if (response.stop_reason === 'tool_use') {
      working.push({ role: 'assistant', content: response.content });
      const toolResultBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const out = await args.toolExecutor(block.name, block.id, block.input);
          toolResultBlocks.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: out,
          });
        }
      }
      if (toolResultBlocks.length === 0) {
        return { text: lastText || 'I could not complete that request.', messages: working };
      }
      working.push({ role: 'user', content: toolResultBlocks });
      continue;
    }

    working.push({ role: 'assistant', content: response.content });
    return { text: lastText || 'I could not complete that request.', messages: working };
  }

  return { text: lastText || 'Too many tool steps — try a simpler question.', messages: working };
}
