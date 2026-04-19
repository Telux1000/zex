'use client';

import type { ReactNode } from 'react';

/**
 * Renders assistant copy that uses markdown-style **bold** segments (one block per pair).
 * Keeps hierarchy scannable: title, amounts, and period each on their own line in source text.
 */
export function renderAssistantFormattedText(text: string): ReactNode {
  const re = /\*\*([^*]+)\*\*/g;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      out.push(text.slice(last, m.index));
    }
    out.push(
      <strong key={`b-${k++}`} className="font-semibold text-slate-900 dark:text-slate-50">
        {m[1]}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push(text.slice(last));
  }
  return out.length ? out : text;
}
