/**
 * Strict NL command layer for Assistant in-chat customer edit (`edit_customer` lock).
 * Deterministic only — no LLM. Order of checks matches product priority (see `parseCustomerInlineEditCommand`).
 */

export type CustomerInlinePatchKey =
  | 'name'
  | 'email'
  | 'company'
  | 'phone'
  | 'address_line1'
  | 'address_line2'
  | 'city'
  | 'state'
  | 'postal_code'
  | 'country';

export type CustomerInlineClearTarget = 'phone' | 'email' | 'name' | 'company' | 'country';

/**
 * Parsed command while `pending_customer_context.kind === 'inline_editing'`.
 * Session exit (`done`, `cancel`, …) and switch-customer are also handled in the route for `awaiting_value_for` turns.
 */
export type CustomerInlineEditCommand =
  | { kind: 'direct_update'; key: CustomerInlinePatchKey; value: string }
  | { kind: 'field_focus'; key: CustomerInlinePatchKey }
  | { kind: 'need_value'; key: CustomerInlinePatchKey }
  | { kind: 'clear_address' }
  | { kind: 'clear_field'; target: CustomerInlineClearTarget }
  | { kind: 'show_review' }
  | { kind: 'switch_customer' }
  | { kind: 'open_form' }
  | { kind: 'ambiguous_name' }
  | { kind: 'unclear' };

/** @deprecated Use `CustomerInlineEditCommand` + `parseCustomerInlineEditCommand`. */
export type CustomerInlineParseResult =
  | { kind: 'patch'; key: CustomerInlinePatchKey; value: string }
  | { kind: 'need_value'; key: CustomerInlinePatchKey }
  | { kind: 'field_focus'; key: CustomerInlinePatchKey }
  | { kind: 'open_form' }
  | { kind: 'clear_address' }
  | { kind: 'unclear' };

function stripQuotes(s: string): string {
  const t = s.trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('`') && t.endsWith('`'))
  ) {
    return t.slice(1, -1).trim();
  }
  return t;
}

function restAfterFieldKeyword(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m?.[1]) return null;
  return stripQuotes(m[1]);
}

/** Map legacy tests / call sites to the command union. */
export function parseCustomerInlineEditIntent(raw: string): CustomerInlineParseResult {
  const cmd = parseCustomerInlineEditCommand(raw);
  switch (cmd.kind) {
    case 'direct_update':
      return { kind: 'patch', key: cmd.key, value: cmd.value };
    case 'need_value':
      return { kind: 'need_value', key: cmd.key };
    case 'field_focus':
      return { kind: 'field_focus', key: cmd.key };
    case 'open_form':
      return { kind: 'open_form' };
    case 'clear_address':
      return { kind: 'clear_address' };
    default:
      return { kind: 'unclear' };
  }
}

/**
 * Priority (non-awaiting path; route may re-order for `awaiting_value_for`):
 * 1. Direct update
 * 2. Field-only / need value / ambiguous “name”
 * 3. Clear / remove
 * 4. Review / show
 * 5. Switch customer
 * 6. Open form
 * 7. Unclear
 */
export function parseCustomerInlineEditCommand(raw: string): CustomerInlineEditCommand {
  const text = raw.trim();
  if (!text) return { kind: 'unclear' };
  const lower = text.toLowerCase();

  // --- 1. Direct updates (specific phrases first) ---

  const setContact = restAfterFieldKeyword(
    text,
    /set\s+contact(?:\s+person|\s+name)?\s+to\s+(.+)/i
  );
  if (setContact) {
    return { kind: 'direct_update', key: 'name', value: setContact.trim() };
  }

  const contactChange = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?contact(?:\s+person|\s+name)?\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (contactChange) {
    return { kind: 'direct_update', key: 'name', value: contactChange.trim() };
  }

  const emailFromChange = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?(?:e-?mail(?:\s+address)?)\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (emailFromChange) {
    return { kind: 'direct_update', key: 'email', value: emailFromChange.trim() };
  }
  const emailIs = restAfterFieldKeyword(
    text,
    /(?:e-?mail|email)(?:\s+address)?\s+(?:is|should be|will be|=|:)\s*(.+)/i
  );
  if (emailIs) {
    return { kind: 'direct_update', key: 'email', value: emailIs.trim() };
  }

  const phoneVal = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?(?:mobile|cell\s+|telephone\s+)?phone(?:\s+number)?\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (phoneVal) {
    return { kind: 'direct_update', key: 'phone', value: phoneVal.trim() };
  }

  const companyVal = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?(?:company|client|business|customer)\s+(?:name\s+)?(?:to|as|into|=|:)\s*(.+)/i
  );
  if (companyVal) {
    return { kind: 'direct_update', key: 'company', value: companyVal.trim() };
  }

  const nameTo = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?name\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (nameTo) {
    return { kind: 'direct_update', key: 'name', value: nameTo.trim() };
  }

  const addressNatural = restAfterFieldKeyword(
    text,
    /(?:the\s+)?(?:address|street\s+address)\s+is\s+(.+)/i
  );
  if (addressNatural) {
    return { kind: 'direct_update', key: 'address_line1', value: addressNatural.trim() };
  }
  const addressPut = restAfterFieldKeyword(
    text,
    /(?:put|set)\s+(?:the\s+)?(?:address|street\s+address)\s+(?:to|as)\s+(.+)/i
  );
  if (addressPut) {
    return { kind: 'direct_update', key: 'address_line1', value: addressPut.trim() };
  }

  const addressVal = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?(?:street\s+)?address(?:\s+line\s*1)?\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (addressVal) {
    return { kind: 'direct_update', key: 'address_line1', value: addressVal.trim() };
  }

  const cityVal = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?city\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (cityVal) {
    return { kind: 'direct_update', key: 'city', value: cityVal.trim() };
  }

  const stateVal = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?(?:state|province)\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (stateVal) {
    return { kind: 'direct_update', key: 'state', value: stateVal.trim() };
  }

  const postalVal = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?(?:postal\s+code|postcode|zip(?:\s+code)?)\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (postalVal) {
    return { kind: 'direct_update', key: 'postal_code', value: postalVal.trim() };
  }

  const countryVal = restAfterFieldKeyword(
    text,
    /(?:change|set|update)\s+(?:the\s+)?country\s+(?:to|as|into|=|:)\s*(.+)/i
  );
  if (countryVal) {
    return { kind: 'direct_update', key: 'country', value: countryVal.trim() };
  }

  // Bare email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return { kind: 'direct_update', key: 'email', value: text };
  }

  const phoneLoose = text.match(/phone(?:\s+number)?\s+(?:to|is|:)?\s*(.+)$/i);
  if (phoneLoose?.[1] && /\d/.test(phoneLoose[1])) {
    return { kind: 'direct_update', key: 'phone', value: stripQuotes(phoneLoose[1]).trim() };
  }

  // --- 2. “Update X” without value → need_value; bare field tokens → field_focus or ambiguous_name ---

  if (
    /(?:change|set|update)\s+(?:the\s+)?(?:e-?mail|email)(?:\s+address)?\b/i.test(text) &&
    !/(?:to|as|into|=|:)\s*\S/.test(text)
  ) {
    return { kind: 'need_value', key: 'email' };
  }
  if (/(?:change|set|update)\s+(?:the\s+)?(?:mobile|cell\s+|telephone\s+)?phone(?:\s+number)?\b/i.test(text)) {
    if (!/(?:to|as|into|=|:)\s*\S/.test(text)) {
      return { kind: 'need_value', key: 'phone' };
    }
  }
  if (
    /(?:change|set|update)\s+(?:the\s+)?(?:company|client|business)(?:\s+name)?\b/i.test(text) ||
    /(?:change|set|update)\s+(?:the\s+)?customer\s+name\b/i.test(text)
  ) {
    if (!/(?:to|as|into|=|:)\s*\S/.test(text)) {
      return { kind: 'need_value', key: 'company' };
    }
  }
  if (/(?:change|set|update)\s+(?:the\s+)?contact(?:\s+person|\s+name)?\b/i.test(text)) {
    if (!/(?:to|as|into|=|:)\s*\S/.test(text)) {
      return { kind: 'need_value', key: 'name' };
    }
  }
  if (/(?:change|set|update)\s+(?:the\s+)?(?:street\s+)?address\b/i.test(text)) {
    if (!/(?:to|as|into|=|:)\s*\S/.test(text)) {
      return { kind: 'need_value', key: 'address_line1' };
    }
  }
  if (/(?:change|set|update)\s+(?:the\s+)?country\b/i.test(text)) {
    if (!/(?:to|as|into|=|:)\s*\S/.test(text)) {
      return { kind: 'need_value', key: 'country' };
    }
  }

  // Bare “name” → disambiguate (do not guess company vs contact)
  if (/^(the\s+)?name$/i.test(text.trim())) {
    return { kind: 'ambiguous_name' };
  }

  const fieldOnly = parseCustomerInlineFieldOnly(lower, text);
  if (fieldOnly) {
    return { kind: 'field_focus', key: fieldOnly };
  }

  // --- 3. Clear / remove ---

  if (/\b(remove|clear|delete)\s+(?:the\s+)?(?:phone(?:\s+number)?|mobile|cell|telephone)\b/i.test(lower)) {
    return { kind: 'clear_field', target: 'phone' };
  }
  if (/\b(remove|clear|delete)\s+(?:the\s+)?(?:e-?mail|email(?:\s+address)?)\b/i.test(lower)) {
    return { kind: 'clear_field', target: 'email' };
  }
  if (
    /\b(remove|clear|delete)\s+(?:the\s+)?(?:contact(?:\s+person|\s+name)?|representative)\b/i.test(lower)
  ) {
    return { kind: 'clear_field', target: 'name' };
  }
  if (
    /\b(remove|clear|delete)\s+(?:the\s+)?(?:company|client|business)(?:\s+name)?\b/i.test(lower) ||
    /\b(remove|clear|delete)\s+(?:the\s+)?customer\s+name\b/i.test(lower)
  ) {
    return { kind: 'clear_field', target: 'company' };
  }
  if (/\b(remove|clear|delete)\s+(?:the\s+)?country\b/i.test(lower)) {
    return { kind: 'clear_field', target: 'country' };
  }
  if (/\b(remove|clear|delete)\s+(?:the\s+)?address\b/i.test(lower)) {
    return { kind: 'clear_address' };
  }

  // --- 4. Review / show ---

  if (
    /^(show\s+details|show\s+current\s+data|review|what'?s\s+on\s+file|show\s+customer)(\s*[!.?])*$/i.test(
      text
    ) ||
    /^(show\s+me\s+the\s+details|current\s+details)(\s*[!.?])*$/i.test(text)
  ) {
    return { kind: 'show_review' };
  }

  // --- 5. Switch customer ---

  if (
    /^(edit\s+another\s+customer|switch\s+customer|not\s+this\s+customer|change\s+customer|different\s+customer)(\s*[!.?])*$/i.test(
      text
    ) ||
    /\b(edit\s+another\s+customer|switch\s+customer|not\s+this\s+customer)\b/i.test(text)
  ) {
    return { kind: 'switch_customer' };
  }

  // --- 6. Open form ---

  if (
    /^(open\s+form|edit\s+manually)([.!?]*)$/i.test(text) ||
    /\bopen\s+the\s+form\b/i.test(lower) ||
    /\bedit\s+manually\b/i.test(lower) ||
    /\buse\s+the\s+form\b/i.test(lower)
  ) {
    return { kind: 'open_form' };
  }

  return { kind: 'unclear' };
}

/**
 * Field-only utterance → awaiting value (canonical patch key).
 * Aliases: company name, client name, customer name, business name, email address, telephone, etc.
 */
export function parseCustomerInlineFieldOnly(lower: string, raw: string): CustomerInlinePatchKey | null {
  if (!lower || lower.length > 96) return null;
  if (
    /^(company\s+name|client\s+name|customer\s+name|business\s+name|company|client|business)$/i.test(raw.trim())
  ) {
    return 'company';
  }
  if (/^(e-?mail|email|email\s+address)$/i.test(raw.trim())) {
    return 'email';
  }
  if (/^(phone|phone\s+number|mobile|cell|telephone)$/i.test(raw.trim())) {
    return 'phone';
  }
  if (/^(contact\s+person|contact\s+name|contact|representative)$/i.test(raw.trim())) {
    return 'name';
  }
  if (/^(address|street\s+address)$/i.test(raw.trim())) {
    return 'address_line1';
  }
  if (/^country$/i.test(raw.trim())) {
    return 'country';
  }
  if (/^city$/i.test(raw.trim())) {
    return 'city';
  }
  if (/^(state|province)$/i.test(raw.trim())) {
    return 'state';
  }
  if (/^(postal\s+code|postcode|zip|zip\s+code)$/i.test(raw.trim())) {
    return 'postal_code';
  }
  return null;
}

/** @deprecated Use `parseCustomerInlineFieldOnly` via `parseCustomerInlineEditCommand`. */
export function parseCustomerInlineFieldFocus(text: string): CustomerInlinePatchKey | null {
  const raw = text.trim();
  if (!raw || raw.length > 96) return null;
  return parseCustomerInlineFieldOnly(raw.toLowerCase(), raw);
}
