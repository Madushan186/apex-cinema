import { PACKAGE_CATALOG } from "@apex-cinema/booking-core";

/**
 * Re-exported under the old name for minimal churn across the app — the
 * actual facts now live in @apex-cinema/booking-core (PACKAGE_CATALOG),
 * shared with the Cloud Functions seed script so fixture-preview mode and
 * real emulator mode can never quietly disagree on price/capacity.
 */
export const PACKAGE_FIXTURES = PACKAGE_CATALOG;
