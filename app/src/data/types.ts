/**
 * Typed contracts for package/availability/booking-preview data (see
 * docs/PROJECT_BRIEF.md and docs/ARCHITECTURE.md). Two implementations exist
 * side by side (see data/index.ts):
 *  - data/fixtures/*      — local, deterministic, for visual preview only.
 *  - data/firebase/*      — real Cloud Functions via the emulator, for the
 *                            actual booking engine (this phase).
 * The UI only ever imports the interfaces + the composed instances in
 * data/index.ts, never an implementation file directly, so swapping one for
 * the other (or later, a real production backend) never touches UI code.
 *
 * The core domain shapes (PackageDefinition, SlotAvailability, ...) live in
 * @apex-cinema/booking-core so the frontend and Cloud Functions can't drift
 * apart on what a valid response looks like.
 */
export type {
  AvailabilityResult,
  BookablePackageId,
  FeatureId,
  PackageDefinition,
  PackageId,
  SlotAvailability,
  SlotStatus,
  SlotTime,
} from "@apex-cinema/booking-core";
export { SLOT_TIMES } from "@apex-cinema/booking-core";

import type { AvailabilityResult, BookablePackageId, PackageDefinition, PackageId, SlotTime } from "@apex-cinema/booking-core";

export interface PackagesAdapter {
  listPackages(): Promise<readonly PackageDefinition[]>;
  getPackage(id: PackageId): Promise<PackageDefinition | undefined>;
}

export interface AvailabilityAdapter {
  /** @param simulateError For demoing the error state (see Book.tsx `?fixtureError=1`). */
  getAvailability(params: {
    packageId: BookablePackageId;
    dateISO: string;
    simulateError?: boolean;
  }): Promise<AvailabilityResult>;
}

export interface BookingDraft {
  readonly packageId: BookablePackageId;
  readonly dateISO: string;
  readonly time: SlotTime;
  readonly peopleCount: number;
  readonly name: string;
  readonly phone: string;
  readonly email: string;
}

export interface BookingPreviewResult {
  readonly referenceCode: string;
  readonly totalLKR: number;
  readonly startISO: string;
  readonly endISO: string;
}

export interface BookingPreviewAdapter {
  /** Never a real reservation — see docs/PROGRESS.md and the demo notice shown throughout the wizard. */
  createPreview(input: BookingDraft): Promise<BookingPreviewResult>;
}

/** The six customer-facing outcomes the FIXTURE demo checkout can render — see docs/DESIGN.md. Not used by the real emulator flow (see HoldsAdapter below). */
export type DemoOutcome =
  | "awaiting-payment"
  | "verifying"
  | "failed"
  | "hold-expired"
  | "confirmed"
  | "needs-review";

export interface ContactConfig {
  readonly whatsappNumber: string | null;
  readonly callNumber: string | null;
  readonly email: string | null;
  readonly address: string | null;
}

// --- Real booking engine (this phase): temporary checkout holds ----------

/**
 * A real, transactionally-reserved room hold — distinct from
 * BookingPreviewResult, which is instant fixture make-believe. Nothing is
 * "confirmed" here; payment isn't implemented yet (see docs/PROGRESS.md).
 */
export interface HoldResult {
  readonly holdId: string;
  readonly referenceCode: string;
  /** Server-computed, integer minor units (cents) — never trust a client-sent amount. */
  readonly totalAmountMinor: number;
  readonly currency: "LKR";
  readonly startISO: string;
  readonly endISO: string;
  /** Epoch ms — when this hold stops being honoured; server-authoritative. */
  readonly expiresAtMillis: number;
}

/** Discriminated failure reasons the UI needs to render distinct honest messages for. */
export type HoldErrorReason =
  | "unavailable"
  | "invalid-request"
  | "idempotency-conflict"
  | "rate-limited"
  | "unknown";

export class HoldError extends Error {
  constructor(
    public readonly reason: HoldErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "HoldError";
  }
}

export interface CreateHoldInput extends BookingDraft {
  /** Client-generated once per checkout attempt; retries must reuse the same key. */
  readonly idempotencyKey: string;
}

export interface HoldsAdapter {
  createHold(input: CreateHoldInput): Promise<HoldResult>;
}
