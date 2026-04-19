'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type AssistantConversationControlHandlers = {
  /** Opens clear confirmation — destructive only after user confirms. */
  clearConversation: () => void;
  exportConversation: () => void;
  openRetentionModal: () => void;
  /** Disable menu actions while loading */
  disabled?: boolean;
};

type Ctx = {
  handlers: AssistantConversationControlHandlers | null;
  register: (h: AssistantConversationControlHandlers | null) => void;
};

const AssistantConversationCtx = createContext<Ctx | null>(null);

export function AssistantConversationProvider({ children }: { children: ReactNode }) {
  const [handlers, setHandlers] = useState<AssistantConversationControlHandlers | null>(null);
  const register = useCallback((h: AssistantConversationControlHandlers | null) => {
    setHandlers(h);
  }, []);
  const value = useMemo(() => ({ handlers, register }), [handlers, register]);
  return (
    <AssistantConversationCtx.Provider value={value}>{children}</AssistantConversationCtx.Provider>
  );
}

export function useAssistantConversationRegister() {
  const ctx = useContext(AssistantConversationCtx);
  if (!ctx) return null;
  return ctx.register;
}

export function useAssistantConversationMenu() {
  const ctx = useContext(AssistantConversationCtx);
  return ctx?.handlers ?? null;
}
