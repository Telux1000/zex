ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS system_mode TEXT NOT NULL DEFAULT 'NORMAL' CHECK (
    system_mode IN ('NORMAL', 'MAINTENANCE', 'READ_ONLY', 'EMERGENCY_LOCKDOWN')
  ),
  ADD COLUMN IF NOT EXISTS system_message TEXT NULL,
  ADD COLUMN IF NOT EXISTS emergency_admin_access_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_settings.system_mode IS
  'Global system access mode. Login remains available except emergency lockdown.';
COMMENT ON COLUMN public.app_settings.system_message IS
  'Optional operator message shown to users during maintenance/read-only/emergency modes.';
COMMENT ON COLUMN public.app_settings.emergency_admin_access_enabled IS
  'Allows internal admins to sign in during EMERGENCY_LOCKDOWN.';

CREATE TABLE IF NOT EXISTS public.app_system_mode_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  previous_mode TEXT NOT NULL CHECK (previous_mode IN ('NORMAL', 'MAINTENANCE', 'READ_ONLY', 'EMERGENCY_LOCKDOWN')),
  new_mode TEXT NOT NULL CHECK (new_mode IN ('NORMAL', 'MAINTENANCE', 'READ_ONLY', 'EMERGENCY_LOCKDOWN')),
  changed_by UUID NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS app_system_mode_audit_logs_created_at_idx
  ON public.app_system_mode_audit_logs (created_at DESC);

ALTER TABLE public.app_system_mode_audit_logs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.app_system_mode_audit_logs IS
  'Minimal audit trail for global system mode changes.';
