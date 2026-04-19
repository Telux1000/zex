/** Browser event when a new support_ticket_messages row is inserted (subscriber workspace). */
export const SUPPORT_INBOUND_MESSAGE_EVENT = 'zenzex:support-inbound-message';

export type SupportInboundMessageDetail = {
  id: string;
  ticket_id: string;
  author_user_id: string;
  body: string;
  is_staff: boolean;
  created_at: string;
  attachment_storage_path?: string | null;
  attachment_content_type?: string | null;
  attachment_original_name?: string | null;
  attachment_size_bytes?: number | null;
};

export function dispatchSupportInboundMessage(detail: SupportInboundMessageDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SUPPORT_INBOUND_MESSAGE_EVENT, { detail }));
}

/** Admin console: any new row on `support_ticket_messages` (staff syncs queue / thread). */
export const ADMIN_SUPPORT_MESSAGE_INSERT_EVENT = 'zenzex:admin-support-message-insert';

export type AdminSupportMessageInsertDetail = SupportInboundMessageDetail;

export function dispatchAdminSupportMessageInsert(detail: AdminSupportMessageInsertDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ADMIN_SUPPORT_MESSAGE_INSERT_EVENT, { detail }));
}
