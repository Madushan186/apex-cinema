/**
 * The single seam between the app and its data source. Every route/component
 * imports the adapters from here, never from data/fixtures/* or
 * data/firebase/* directly — that's what makes swapping implementations a
 * one-file change.
 *
 * Two modes, chosen by DATA_MODE (see lib/dataMode.ts):
 *  - "fixture"  (default): local, deterministic, instant preview data.
 *  - "emulator": the real Cloud Functions booking engine, against the local
 *    Firebase Emulator Suite only (never a real project). The emulator
 *    connection itself is established by lib/firebase/client.ts as soon as
 *    DATA_MODE === "emulator" — that module guarantees it for every
 *    consumer (this file included), so nothing here needs to trigger it.
 */
import { createFirebaseAvailabilityAdapter } from "./firebase/availabilityAdapter";
import { createFirebaseHoldsAdapter } from "./firebase/holdsAdapter";
import { createFirebasePackagesAdapter } from "./firebase/packagesAdapter";
import { createFixtureAvailabilityAdapter } from "./fixtures/availabilityAdapter";
import { createFixtureBookingPreviewAdapter } from "./fixtures/bookingPreviewAdapter";
import { createFixturePackagesAdapter } from "./fixtures/packagesAdapter";
import { DATA_MODE } from "@/lib/dataMode";
import type { HoldsAdapter } from "./types";

export const packagesAdapter =
  DATA_MODE === "emulator" ? createFirebasePackagesAdapter() : createFixturePackagesAdapter();

export const availabilityAdapter =
  DATA_MODE === "emulator" ? createFirebaseAvailabilityAdapter() : createFixtureAvailabilityAdapter();

/** Fixture-only demo checkout (the "Simulate outcome" flow) — unaffected by DATA_MODE, always available for preview. */
export const bookingPreviewAdapter = createFixtureBookingPreviewAdapter();

/** Only meaningful in emulator mode — the fixture demo checkout doesn't use real holds. */
export const holdsAdapter: HoldsAdapter | null = DATA_MODE === "emulator" ? createFirebaseHoldsAdapter() : null;

export { DATA_MODE } from "@/lib/dataMode";
export { CONTACT_CONFIG } from "./fixtures/contact";
export * from "./types";
