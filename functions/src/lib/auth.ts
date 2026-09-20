import { HttpsError } from "firebase-functions/v2/https";
import type { CallableRequest } from "firebase-functions/v2/https";

/**
 * The documented role model (docs/ARCHITECTURE.md §8): role lives ONLY in
 * the Firebase Auth custom claim on the caller's ID token, set exclusively
 * by scripts/seedAuthUsers.ts (an emulator-only, offline admin script — see
 * docs/PROGRESS.md). There is no second mechanism: no Firestore field, no
 * request-body field, ever grants a role. `request.data.role` (anything the
 * client sends) is never consulted here on purpose — only the verified,
 * server-decoded token can be trusted (docs/ARCHITECTURE.md §2 "the browser
 * proposes, the server disposes").
 */
export type StaffRole = "staff" | "owner";

function isStaffRole(value: unknown): value is StaffRole {
  return value === "staff" || value === "owner";
}

/**
 * Throws "unauthenticated" if there's no verified caller at all, or
 * "permission-denied" if the caller is verified but their role (if any)
 * isn't in `allowedRoles` — distinct codes so the frontend can tell "please
 * sign in" apart from "you're signed in but not allowed here."
 */
export function requireRole<T>(request: CallableRequest<T>, allowedRoles: readonly StaffRole[]): StaffRole {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }
  const role = request.auth.token.role;
  if (!isStaffRole(role) || !allowedRoles.includes(role)) {
    throw new HttpsError("permission-denied", "Your account does not have access to this operation.");
  }
  return role;
}
