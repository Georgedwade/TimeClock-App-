/**
 * Utility functions for PTO date parsing and deduction scheduling.
 */

/**
 * Normalizes a date string or timestamp to 'YYYY-MM-DD'.
 */
export const normalizeToISODate = (dStr?: string): string => {
  if (!dStr) return '';
  const trimmed = dStr.trim();
  // If already YYYY-MM-DD, return directly
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return trimmed;
};

/**
 * Returns today's date in local 'YYYY-MM-DD' format.
 */
export const getTodayISODate = (): string => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Checks if the PTO date has passed (i.e. we are strictly AFTER the date the PTO was taken).
 * For example:
 * - If PTO is for Friday 2026-09-18, this returns false on or before 2026-09-18.
 * - Starting Saturday 2026-09-19, this returns true.
 * If endDate is provided, we check endDate; otherwise we check startDate.
 */
export const isPTODatePassed = (endDate?: string, startDate?: string): boolean => {
  const targetDate = normalizeToISODate(endDate || startDate || '');
  if (!targetDate) return false;
  const today = getTodayISODate();
  // Lexicographical comparison of YYYY-MM-DD is chronologically exact
  return targetDate < today;
};

/**
 * Formats a friendly date display for PTO ranges.
 * e.g. "Fri, Sep 18, 2026" or "Sep 18 - Sep 20, 2026"
 */
export const formatPTODateRange = (startDate: string, endDate?: string): string => {
  if (!startDate) return '';
  const startNorm = normalizeToISODate(startDate);
  const endNorm = normalizeToISODate(endDate || startDate);

  const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  
  const [sy, sm, sd] = startNorm.split('-').map(Number);
  const startDateObj = new Date(sy, sm - 1, sd);
  const startFormatted = startDateObj.toLocaleDateString('en-US', options);

  if (!endNorm || startNorm === endNorm) {
    return startFormatted;
  }

  const [ey, em, ed] = endNorm.split('-').map(Number);
  const endDateObj = new Date(ey, em - 1, ed);
  const endFormatted = endDateObj.toLocaleDateString('en-US', options);

  return `${startFormatted} – ${endFormatted}`;
};

/**
 * Safely parses a 'YYYY-MM-DD' string into a local Date at noon (12:00:00)
 * to guarantee that timezone offsets never shift the day across midnight.
 */
export const parseDateOnly = (dStr?: string): Date => {
  if (!dStr) return new Date();
  const norm = normalizeToISODate(dStr);
  if (/^\d{4}-\d{2}-\d{2}$/.test(norm)) {
    const [y, m, d] = norm.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
  }
  const parsed = new Date(dStr);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};
