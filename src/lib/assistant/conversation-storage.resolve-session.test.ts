import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  resolveAssistantWizardSessionId,
  getActiveAssistantSessionPointerKey,
} from '@/lib/assistant/conversation-storage';

describe('resolveAssistantWizardSessionId', () => {
  const store: Record<string, string> = {};

  beforeEach(() => {
    for (const k of Object.keys(store)) delete store[k];
    vi.stubGlobal(
      'localStorage',
      {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          for (const k of Object.keys(store)) delete store[k];
        },
        key: () => null,
        get length() {
          return Object.keys(store).length;
        },
      } as Storage
    );
    vi.stubGlobal('window', globalThis);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses stored pointer when no query param', () => {
    const bid = 'biz1';
    const uid = 'user1';
    localStorage.setItem(getActiveAssistantSessionPointerKey(bid, uid), 'thread-abc');
    expect(resolveAssistantWizardSessionId(bid, uid, null)).toBe('thread-abc');
  });

  it('sets pointer from explicit session param', () => {
    const bid = 'biz1';
    const uid = 'user1';
    expect(resolveAssistantWizardSessionId(bid, uid, 'from-url')).toBe('from-url');
    expect(localStorage.getItem(getActiveAssistantSessionPointerKey(bid, uid))).toBe('from-url');
  });

  it('creates and persists a new id when no pointer', () => {
    const bid = 'biz1';
    const uid = 'user1';
    const a = resolveAssistantWizardSessionId(bid, uid, null);
    expect(a.length).toBeGreaterThan(8);
    expect(resolveAssistantWizardSessionId(bid, uid, null)).toBe(a);
  });
});
