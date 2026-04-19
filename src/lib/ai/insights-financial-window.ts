import {
  getDashboardFinancialRange,
  parseDashboardRangeParam,
  type DashboardFinancialRange,
} from '@/lib/dashboard/date-range';

/**
 * Builds the same financial window as the main dashboard from optional client fields.
 * Used by AI Insights APIs so prompts and aggregates match the user’s selected range.
 */
export function parseFinancialWindowFromRequestBody(body: Record<string, unknown>): DashboardFinancialRange {
  const raw = typeof body.range === 'string' ? body.range : undefined;
  const preset = parseDashboardRangeParam(raw);
  const tz =
    typeof body.dashboard_tz === 'string' && body.dashboard_tz.length > 0 && body.dashboard_tz.length < 120
      ? body.dashboard_tz
      : null;
  return getDashboardFinancialRange(preset, new Date(), tz);
}
