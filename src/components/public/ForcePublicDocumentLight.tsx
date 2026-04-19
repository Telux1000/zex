'use client';

import { useEffect } from 'react';

/**
 * Removes `dark` from <html> while mounted so public financial documents
 * render in light mode regardless of stored theme or prefers-color-scheme.
 * Restores the previous state on unmount.
 */
export function ForcePublicDocumentLight() {
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.remove('dark');
    return () => {
      if (hadDark) root.classList.add('dark');
    };
  }, []);
  return null;
}
