import { DEFAULT_HOLD_DURATION_MINUTES } from "@apex-cinema/booking-core";
import { COLLECTIONS, db } from "./firestore";

/** See docs/DECISIONS.md D7: configurable, default 10 minutes. Falls back safely if `config/booking` hasn't been seeded. */
export async function getHoldDurationMinutes(): Promise<number> {
  const snap = await db.collection(COLLECTIONS.config).doc("booking").get();
  const value = snap.data()?.holdDurationMinutes as unknown;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : DEFAULT_HOLD_DURATION_MINUTES;
}
