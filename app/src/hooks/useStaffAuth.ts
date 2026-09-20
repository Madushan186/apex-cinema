import { type User, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase/client";

export type StaffRole = "staff" | "owner";

export type StaffAuthStatus = "loading" | "signed-out" | "session-expired" | "signed-in";

export interface StaffAuthState {
  readonly status: StaffAuthStatus;
  readonly user: User | null;
  /** null when signed in but the account has no approved staff/owner role. */
  readonly role: StaffRole | null;
}

function parseRole(claim: unknown): StaffRole | null {
  return claim === "staff" || claim === "owner" ? claim : null;
}

/**
 * Tracks Firebase Auth state against the LOCAL emulator only (see
 * lib/firebase/client.ts — Firebase is only ever connected when
 * DATA_MODE === "emulator"). Role comes exclusively from the signed-in
 * user's ID token custom claim (docs/ARCHITECTURE.md §8) — never trusted
 * from anywhere else.
 *
 * Distinguishes a deliberate sign-out (via the returned `signOutStaff`)
 * from an unexpected loss of session (e.g. the account was disabled, or the
 * emulator was restarted) — the latter surfaces as "session-expired" rather
 * than silently looking identical to "never signed in."
 */
export function useStaffAuth(): StaffAuthState & {
  signInStaff: (email: string, password: string) => Promise<void>;
  signOutStaff: () => Promise<void>;
} {
  const [state, setState] = useState<StaffAuthState>({ status: "loading", user: null, role: null });
  const wasSignedIn = useRef(false);
  const deliberateSignOut = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        const expired = wasSignedIn.current && !deliberateSignOut.current;
        setState({ status: expired ? "session-expired" : "signed-out", user: null, role: null });
        wasSignedIn.current = false;
        deliberateSignOut.current = false;
        return;
      }

      wasSignedIn.current = true;
      void user.getIdTokenResult().then((tokenResult) => {
        setState({ status: "signed-in", user, role: parseRole(tokenResult.claims.role) });
      });
    });
    return unsubscribe;
  }, []);

  async function signInStaff(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(auth, email, password);
  }

  async function signOutStaff(): Promise<void> {
    deliberateSignOut.current = true;
    await signOut(auth);
  }

  return { ...state, signInStaff, signOutStaff };
}
