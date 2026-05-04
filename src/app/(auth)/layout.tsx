import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthShellThemeSlot } from '@/components/auth/AuthShellThemeSlot';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AuthShellThemeSlot />
      {children}
    </>
  );
}
