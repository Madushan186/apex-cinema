/**
 * All booking date/time logic is Asia/Colombo, regardless of the visitor's
 * (or server's) own timezone (docs/PROJECT_BRIEF.md). Never hardcode a
 * date/time — everything here is derived from `Date.now()` at call time.
 * Pure functions only (no DOM, no Firebase) — used by both the frontend and
 * Cloud Functions so "what is today/now in Colombo" is computed identically
 * on both sides, and Cloud Functions always use their own server clock here,
 * never a client-supplied date/time.
 */
const TIME_ZONE = "Asia/Colombo";

/** How many days ahead the booking UI lets a customer pick — a UI bound for this demo, not a business rule. */
export const BOOKING_WINDOW_DAYS = 30;

function colomboParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** Today's date in Asia/Colombo, as YYYY-MM-DD. */
export function getColomboTodayISO(): string {
  const { year, month, day } = colomboParts(new Date());
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Current minute-of-day (0-1439) in Asia/Colombo. */
export function getColomboMinuteOfDay(): number {
  const { hour, minute } = colomboParts(new Date());
  return hour * 60 + minute;
}

export function slotTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** YYYY-MM-DD, `daysAhead` days after the Colombo "today". */
export function addDaysToColomboToday(daysAhead: number): string {
  const todayISO = getColomboTodayISO();
  const [y, m, d] = todayISO.split("-").map(Number);
  // Use UTC noon as a stable pivot so date-only arithmetic never rolls over from DST/local quirks.
  const pivot = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12));
  pivot.setUTCDate(pivot.getUTCDate() + daysAhead);
  const yy = pivot.getUTCFullYear();
  const mm = String(pivot.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(pivot.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function isColomboToday(dateISO: string): boolean {
  return dateISO === getColomboTodayISO();
}

/** Long, locale-aware date label (e.g. "Friday, 25 September 2026") for a YYYY-MM-DD date-only string. */
export function formatDateLabel(dateISO: string, locale: "en" | "si", style: "short" | "long" = "long"): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1, 12));
  return new Intl.DateTimeFormat(locale === "si" ? "si-LK" : "en-LK", {
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: style === "long" ? "numeric" : undefined,
    timeZone: "UTC",
  }).format(date);
}
