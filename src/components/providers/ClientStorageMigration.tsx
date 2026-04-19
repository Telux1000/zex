'use client';

import { useEffect } from 'react';
import { migrateEnvoxClientStorage } from '@/lib/migrations/envox-client-storage-migration';

/**
 * Safety net after hydration: repeats the same envox→zenzex copy as the head script
 * (idempotent). Covers edge cases where storage was written before the inline migration ran.
 */
export function ClientStorageMigration() {
  useEffect(() => {
    migrateEnvoxClientStorage();
  }, []);
  return null;
}
