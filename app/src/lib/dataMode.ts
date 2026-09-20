/**
 * Explicit switch between the two data sources (docs/PROGRESS.md — "explicit
 * separate emulator mode"):
 *  - "fixture"  (default): local, deterministic, instant — for visual
 *    preview. Never touches Firebase. This is what every earlier phase used.
 *  - "emulator": real Cloud Functions against the local Firebase Emulator
 *    Suite — the actual booking engine. Never a real Firebase project (see
 *    lib/firebase/client.ts / .firebaserc's "demo-" project id).
 *
 * Set via `VITE_DATA_MODE=emulator` (e.g. `VITE_DATA_MODE=emulator npm run
 * dev --workspace app`) — see README.md. Defaults to "fixture" so nothing
 * about existing preview behaviour changes unless this is set explicitly.
 */
export type DataMode = "fixture" | "emulator";

export const DATA_MODE: DataMode = import.meta.env.VITE_DATA_MODE === "emulator" ? "emulator" : "fixture";
