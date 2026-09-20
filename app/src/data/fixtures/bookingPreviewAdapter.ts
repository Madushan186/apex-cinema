import { slotTimeToMinutes } from "@/lib/colomboTime";
import type { BookingDraft, BookingPreviewAdapter, BookingPreviewResult } from "@/data/types";
import { PACKAGE_FIXTURES } from "./packages";

const FIXTURE_LATENCY_MS = 500;

function hashToInt(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Local-time ISO-ish string (no timezone conversion needed — display only, in Asia/Colombo terms). */
function isoAt(dateISO: string, minuteOfDay: number): string {
  const hh = String(Math.floor(minuteOfDay / 60) % 24).padStart(2, "0");
  const mm = String(minuteOfDay % 60).padStart(2, "0");
  return `${dateISO}T${hh}:${mm}:00`;
}

export function createFixtureBookingPreviewAdapter(): BookingPreviewAdapter {
  return {
    createPreview(input: BookingDraft): Promise<BookingPreviewResult> {
      return new Promise((resolve) => {
        setTimeout(() => {
          const pkg = PACKAGE_FIXTURES.find((p) => p.id === input.packageId);
          const sessionMinutes = pkg?.sessionMinutes ?? 180;
          const startMinute = slotTimeToMinutes(input.time);
          const endMinute = startMinute + sessionMinutes;

          const seed = hashToInt(`${input.packageId}|${input.dateISO}|${input.time}|${input.email}`);
          const referenceCode = `APX-${seed.toString(36).toUpperCase().padStart(6, "0").slice(0, 6)}`;

          resolve({
            referenceCode,
            totalLKR: pkg?.priceLKR ?? 0,
            startISO: isoAt(input.dateISO, startMinute),
            endISO: isoAt(input.dateISO, endMinute),
          });
        }, FIXTURE_LATENCY_MS);
      });
    },
  };
}
