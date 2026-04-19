export type SecurityConsoleTab = 'overview' | 'access' | 'activity' | 'policies';

export type SecurityPoliciesDTO = {
  require_mfa_for_internal_staff: boolean;
  invite_ttl_hours: number;
  session_timeout_minutes: number | null;
  password_reset_policy: 'standard' | 'strict';
  staff_invite_allowed_domains: string[];
  updated_at: string | null;
  updated_by_user_id: string | null;
};

export type StaffAccessRow = {
  user_id: string;
  full_name: string;
  email: string;
  internal_code: string | null;
  role: string;
  status: 'active' | 'suspended';
  invited_by_email: string | null;
  invited_by_name: string | null;
  created_at: string;
  last_active_at: string | null;
  mfa_status: 'verified' | 'none' | 'unknown';
};

export type InviteRowDTO = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  status: string;
  invited_by_email: string | null;
  invited_by_name: string | null;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
};

export type AuditRowDTO = {
  id: string;
  actor_user_id: string;
  actor_role: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata?: unknown;
  created_at: string;
  /** B-code + name from profiles (set by security APIs). */
  actor_display?: string;
  action_label?: string;
  /** Resolved target line (security APIs merge subscriber profile + business when needed). */
  target_display?: string;
};

export type LoginSnapshotRow = {
  user_id: string;
  email: string | null;
  last_sign_in_at: string | null;
  suspended: boolean;
};

export type SecurityConsolePayload = {
  capabilities: { canEditPolicies: boolean };
  policies: SecurityPoliciesDTO;
  overview: {
    failed_logins: null;
    failed_logins_note: string;
    pending_invites: number;
    staff_without_mfa: number;
    role_changes_30d: number;
    suspended_internal_staff: number;
    security_signals_7d: number;
    invite_events_30d: number;
    password_resets_30d: number;
  };
  staff_access: StaffAccessRow[];
  invites: InviteRowDTO[];
  recent_audit_logs: AuditRowDTO[];
  login_snapshot: LoginSnapshotRow[];
};
