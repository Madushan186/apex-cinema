import type { ContactConfig } from "@/data/types";

/**
 * No real contact details have been supplied for this project yet (see
 * docs/DECISIONS.md — party notice/duration, confirmation channel etc. are
 * still open). Every field defaults to `null` on purpose: CLAUDE.md rule 9
 * forbids inventing contact details, so the UI must render an honest
 * "not yet configured" state rather than a placeholder number or a dead
 * "#" link. Fill these in once real values exist — nothing else needs to
 * change, every consumer already handles the null case.
 */
export const CONTACT_CONFIG: ContactConfig = {
  whatsappNumber: null,
  callNumber: null,
  email: null,
  address: null,
};

if (import.meta.env.DEV) {
  const missing = Object.entries(CONTACT_CONFIG)
    .filter(([, value]) => value === null)
    .map(([key]) => key);
  if (missing.length > 0) {
    console.warn(
      `[apex-cinema] Contact config missing real values for: ${missing.join(", ")}. ` +
        "The site will show honest 'not available yet' states for these instead of inventing details.",
    );
  }
}
