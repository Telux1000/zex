import { describe, it, expect } from 'vitest';
import { mergeAssistantThreads } from '@/lib/assistant/conversation-sync-supabase';
import type { PersistedAssistantThread } from '@/lib/assistant/conversation-storage';
import { THREAD_STORAGE_VERSION } from '@/lib/assistant/conversation-storage';

function thread(updatedAt: number, messagesLen: number): PersistedAssistantThread {
  return {
    v: THREAD_STORAGE_VERSION,
    updatedAt,
    messages: Array.from({ length: messagesLen }, (_, i) => ({
      id: `m${i}`,
      role: 'user' as const,
      content: 'x',
      createdAt: updatedAt,
    })),
  };
}

describe('mergeAssistantThreads', () => {
  it('prefers remote when newer', () => {
    const remote = { thread: thread(200, 1), serverUpdatedAtMs: 200 };
    const local = thread(100, 2);
    const { merged, migrateLocalToServer } = mergeAssistantThreads(remote, local);
    expect(merged?.updatedAt).toBe(200);
    expect(merged?.messages.length).toBe(1);
    expect(migrateLocalToServer).toBe(false);
  });

  it('prefers local when newer and flags migration', () => {
    const remote = { thread: thread(100, 1), serverUpdatedAtMs: 100 };
    const local = thread(200, 2);
    const { merged, migrateLocalToServer } = mergeAssistantThreads(remote, local);
    expect(merged?.updatedAt).toBe(200);
    expect(merged?.messages.length).toBe(2);
    expect(migrateLocalToServer).toBe(true);
  });

  it('uses local only when remote missing', () => {
    const local = thread(50, 1);
    const { merged, migrateLocalToServer } = mergeAssistantThreads(null, local);
    expect(merged?.messages.length).toBe(1);
    expect(migrateLocalToServer).toBe(true);
  });

  it('uses remote only when local missing', () => {
    const remote = { thread: thread(50, 1), serverUpdatedAtMs: 50 };
    const { merged, migrateLocalToServer } = mergeAssistantThreads(remote, null);
    expect(merged?.messages.length).toBe(1);
    expect(migrateLocalToServer).toBe(false);
  });
});
