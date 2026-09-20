// Centralized date & time utilities enforcing Asia/Karachi (PKT - UTC+5) for Nowshera Family Clinic

export const CLINIC_TIMEZONE = 'Asia/Karachi';

/**
 * Formats an ISO UTC timestamp to Asia/Karachi time string (e.g. "11:30 AM" or "09:00 AM")
 */
export function formatClinicTime(isoString: string): string {
  if (!isoString) return '';
  try {
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return isoString;
    return dt.toLocaleTimeString('en-US', {
      timeZone: CLINIC_TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats an ISO UTC timestamp to Asia/Karachi readable date & time (e.g. "Wed, Sep 23, 11:30 AM")
 */
export function formatClinicDateTime(isoString: string): string {
  if (!isoString) return '';
  try {
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString('en-US', {
      timeZone: CLINIC_TIMEZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats an ISO UTC timestamp to medium date & short time (e.g. "Sep 23, 2026, 11:30 AM")
 */
export function formatClinicDateTimeMedium(isoString: string): string {
  if (!isoString) return '';
  try {
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return isoString;
    return dt.toLocaleString('en-US', {
      timeZone: CLINIC_TIMEZONE,
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return isoString;
  }
}

/**
 * Formats an ISO UTC timestamp or date string to full date in Asia/Karachi (e.g. "Wed, Sep 23, 2026")
 */
export function formatClinicDate(isoString: string): string {
  if (!isoString) return '';
  try {
    const dt = new Date(isoString);
    if (isNaN(dt.getTime())) return isoString;
    return dt.toLocaleDateString('en-US', {
      timeZone: CLINIC_TIMEZONE,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoString;
  }
}

/**
 * Generates N consecutive calendar dates according to Asia/Karachi clinic calendar days.
 * Ensures patients anywhere in the world see the exact clinic days.
 */
export function getClinicDateOptions(daysCount = 7, startOffsetDays = 1): Array<{ iso: string; dayName: string; dayNum: string }> {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [year, month, day] = formatter.format(now).split('-').map(Number);

  return Array.from({ length: daysCount }, (_, i) => {
    const target = new Date(Date.UTC(year, month - 1, day + startOffsetDays + i));
    const y = target.getUTCFullYear();
    const m = String(target.getUTCMonth() + 1).padStart(2, '0');
    const d = String(target.getUTCDate()).padStart(2, '0');
    const iso = `${y}-${m}-${d}`;

    const dayName = target.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short' });
    const dayNum = target.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });

    return { iso, dayName, dayNum };
  });
}
