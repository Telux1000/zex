'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { WaitlistSource } from '@/lib/billing/checkout-waitlist-meta';
import type { WaitlistTriggerReason } from '@/lib/billing/checkout-waitlist-meta';
import { WaitlistModal } from '@/components/waitlist/WaitlistModal';

export type OpenWaitlistParams = {
  triggerReason: WaitlistTriggerReason | string;
  source: WaitlistSource;
};

type Ctx = {
  openWaitlist: (p: OpenWaitlistParams) => void;
  closeWaitlist: () => void;
};

const WaitlistUiContext = createContext<Ctx | null>(null);

export function WaitlistUiProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<OpenWaitlistParams | null>(null);

  const openWaitlist = useCallback((p: OpenWaitlistParams) => {
    setModal(p);
  }, []);

  const closeWaitlist = useCallback(() => {
    setModal(null);
  }, []);

  const value = useMemo(() => ({ openWaitlist, closeWaitlist }), [openWaitlist, closeWaitlist]);

  return (
    <WaitlistUiContext.Provider value={value}>
      {children}
      {modal ? (
        <WaitlistModal
          key={`${modal.source}-${String(modal.triggerReason)}`}
          onClose={closeWaitlist}
          triggerReason={String(modal.triggerReason)}
          source={modal.source}
        />
      ) : null}
    </WaitlistUiContext.Provider>
  );
}

export function useWaitlistUi(): Ctx {
  const v = useContext(WaitlistUiContext);
  if (!v) {
    return {
      openWaitlist: () => {
        console.warn('[waitlist] WaitlistUiProvider missing — openWaitlist ignored');
      },
      closeWaitlist: () => {},
    };
  }
  return v;
}
