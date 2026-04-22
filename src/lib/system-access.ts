import type { SupabaseClient } from '@supabase/supabase-js';

export const SYSTEM_MODES = ['NORMAL', 'MAINTENANCE', 'READ_ONLY', 'EMERGENCY_LOCKDOWN'] as const;
export type SystemMode = (typeof SYSTEM_MODES)[number];

export type AppSystemSettings = {
  system_mode: SystemMode;
  system_message: string | null;
  emergency_admin_access_enabled: boolean;
  updated_at: string | null;
  updated_by: string | null;
};

export type SystemActionType = 'login' | 'read' | 'write';

type SystemModeBlockCode = 'READ_ONLY_WRITE_BLOCKED' | 'EMERGENCY_LOCKDOWN';

export type SystemAccessDecision =
  | {
      allowed: true;
      mode: SystemMode;
      action: SystemActionType;
      message: string | null;
      code: null;
    }
  | {
      allowed: false;
      mode: SystemMode;
      action: SystemActionType;
      message: string;
      code: SystemModeBlockCode;
      status: 423;
    };

const DEFAULT_SETTINGS: AppSystemSettings = {
  system_mode: 'NORMAL',
  system_message: null,
  emergency_admin_access_enabled: false,
  updated_at: null,
  updated_by: null,
};

const DEFAULT_MODE_MESSAGES: Record<Exclude<SystemMode, 'NORMAL'>, string> = {
  MAINTENANCE:
    'We’re performing maintenance. You can still sign in, but some features may be temporarily unavailable.',
  READ_ONLY:
    'The system is temporarily in read-only mode while we perform updates. You can still access your account and view data.',
  EMERGENCY_LOCKDOWN:
    'We’ve temporarily restricted access while we address a critical issue. Please try again later.',
};

export function normalizeSystemMode(value: unknown): SystemMode {
  const raw = String(value ?? '')
    .trim()
    .toUpperCase();
  if ((SYSTEM_MODES as readonly string[]).includes(raw)) return raw as SystemMode;
  return 'NORMAL';
}

function normalizeSystemMessage(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return v ? v.slice(0, 2000) : null;
}

export function getSystemModeMessage(mode: SystemMode, systemMessage?: string | null): string | null {
  if (systemMessage && systemMessage.trim()) return systemMessage.trim().slice(0, 2000);
  if (mode === 'NORMAL') return null;
  return DEFAULT_MODE_MESSAGES[mode];
}

export function mergeAppSystemSettingsRow(row: Record<string, unknown> | null): AppSystemSettings {
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    system_mode: normalizeSystemMode(row.system_mode),
    system_message: normalizeSystemMessage(row.system_message),
    emergency_admin_access_enabled: Boolean(row.emergency_admin_access_enabled),
    updated_at: row.updated_at ? String(row.updated_at) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
  };
}

export async function fetchAppSystemSettings(admin: SupabaseClient): Promise<AppSystemSettings> {
  const { data } = await admin.from('app_settings').select('*').eq('id', 'default').maybeSingle();
  return mergeAppSystemSettingsRow((data ?? null) as Record<string, unknown> | null);
}

export function actionFromMethod(method: string): SystemActionType {
  const m = method.toUpperCase();
  if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return 'read';
  return 'write';
}

export function isInternalAdminRoleValue(role: unknown): boolean {
  const normalized = String(role ?? '')
    .trim()
    .toLowerCase();
  return normalized === 'owner' || normalized === 'admin' || normalized === 'support';
}

export function evaluateSystemAccess(params: {
  settings: AppSystemSettings;
  action: SystemActionType;
  isAdmin: boolean;
}): SystemAccessDecision {
  const { settings, action, isAdmin } = params;
  const message = getSystemModeMessage(settings.system_mode, settings.system_message);

  if (settings.system_mode === 'EMERGENCY_LOCKDOWN') {
    const hasEmergencyAdminAccess = isAdmin && settings.emergency_admin_access_enabled;
    const loginBlocked = action === 'login' && !hasEmergencyAdminAccess;
    const generalBlocked = action !== 'login' && !hasEmergencyAdminAccess;
    if (loginBlocked || generalBlocked) {
      return {
        allowed: false,
        mode: settings.system_mode,
        action,
        status: 423,
        code: 'EMERGENCY_LOCKDOWN',
        message: message ?? DEFAULT_MODE_MESSAGES.EMERGENCY_LOCKDOWN,
      };
    }
  }

  if (settings.system_mode === 'READ_ONLY' && action === 'write' && !isAdmin) {
    return {
      allowed: false,
      mode: settings.system_mode,
      action,
      status: 423,
      code: 'READ_ONLY_WRITE_BLOCKED',
      message: message ?? DEFAULT_MODE_MESSAGES.READ_ONLY,
    };
  }

  return {
    allowed: true,
    mode: settings.system_mode,
    action,
    message,
    code: null,
  };
}
