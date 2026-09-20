import type { PackageDefinition } from "./types";
import { SESSION_MINUTES } from "./businessRules";

/**
 * The single canonical source of these facts (docs/PROJECT_BRIEF.md) — the
 * frontend fixture adapter and the Cloud Functions seed script both read
 * from here, so "preview mode" and "real emulator mode" can never silently
 * drift apart on price/capacity/room count.
 */
export const PACKAGE_CATALOG: readonly PackageDefinition[] = [
  {
    id: "non-ac",
    priceLKR: 2300,
    sessionMinutes: SESSION_MINUTES,
    maxPeople: 3,
    roomCount: 3,
    roomLabel: "Rooms 1–3",
    isBookableOnline: true,
    featureIds: ["ps4", "streaming-4k", "non-ac"],
    roomIds: ["room-1", "room-2", "room-3"],
  },
  {
    id: "ac-small",
    priceLKR: 3200,
    sessionMinutes: SESSION_MINUTES,
    maxPeople: 3,
    roomCount: 1,
    roomLabel: "Room 4",
    isBookableOnline: true,
    featureIds: ["ac", "ps4", "streaming-4k"],
    roomIds: ["room-4"],
  },
  {
    id: "ac-large",
    priceLKR: 4500,
    sessionMinutes: SESSION_MINUTES,
    maxPeople: 5,
    roomCount: 1,
    roomLabel: "Room 5",
    isBookableOnline: true,
    featureIds: ["ac", "ps4", "streaming-4k"],
    roomIds: ["room-5"],
  },
  {
    id: "party",
    priceLKR: 12500,
    // Not confirmed — see docs/DECISIONS.md #2. Never invent a duration.
    sessionMinutes: null,
    maxPeople: 12,
    roomCount: 1,
    roomLabel: "Room 6",
    isBookableOnline: false,
    // 4K projector confirmed; YouTube/Netflix streaming is not (see FeatureId doc comment in types.ts).
    featureIds: ["ac", "projector-4k", "balloon-decor", "karaoke", "jbl-party-box"],
    roomIds: ["room-6"],
  },
];

export function getPackageFacts(id: string): PackageDefinition | undefined {
  return PACKAGE_CATALOG.find((pkg) => pkg.id === id);
}

/**
 * Server-computed price in integer minor units (cents) — LKR has no
 * subunit in practice for these round figures, but computing in minor
 * units avoids float arithmetic entirely and matches how a real payment
 * gateway integration will represent amounts.
 */
export function priceLKRToMinorUnits(priceLKR: number): number {
  return Math.round(priceLKR * 100);
}
