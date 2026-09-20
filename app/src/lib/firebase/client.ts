/**
 * Firebase client adapter — the one place the app touches the Firebase SDK.
 * See docs/ARCHITECTURE.md §13: business logic must not depend on this
 * module directly; UI code should go through feature-specific hooks/adapters
 * that happen to be built on top of this, not `firebase/*` imports scattered
 * across components.
 *
 * In dev (VITE_USE_FIREBASE_EMULATOR=true, the default), this connects to
 * the local Firebase Emulator Suite only — never a real project. See
 * docs/SECURITY.md and CLAUDE.md: no production connection without explicit
 * approval.
 *
 * The emulator connection is established automatically below, at module
 * load, whenever DATA_MODE === "emulator" — every consumer (customer
 * booking adapters, staff auth, staff/owner APIs) imports `auth` /
 * `firestore` / `functions` from *this* module, so none of them can forget
 * to wire up the emulator themselves. This used to be the caller's
 * responsibility (each adapter/module called `connectToEmulatorsIfConfigured()`
 * itself); a new staff-auth module skipped it and silently ran Firebase Auth
 * against its default (non-emulator) configuration instead — see
 * docs/PROGRESS.md's "staff initialization bug" and
 * `client.test.ts`'s "regression: forgetting to call
 * connectToEmulatorsIfConfigured() is no longer possible" for the coverage
 * that would have caught it. Centralizing the call here removes the
 * possibility of a *future* module repeating that mistake.
 */
import { type Auth, connectAuthEmulator, getAuth } from "firebase/auth";
import { type FirebaseApp, getApps, initializeApp } from "firebase/app";
import { type Firestore, connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { type Functions, connectFunctionsEmulator, getFunctions } from "firebase/functions";
import { DATA_MODE } from "@/lib/dataMode";
import { env } from "@/lib/env";

function createFirebaseApp(): FirebaseApp {
  const existing = getApps();
  if (existing.length > 0) {
    const [app] = existing;
    if (!app) throw new Error("Firebase app list was non-empty but contained no app.");
    return app;
  }
  return initializeApp(env.firebase);
}

export const firebaseApp: FirebaseApp = createFirebaseApp();
export const auth: Auth = getAuth(firebaseApp);
export const firestore: Firestore = getFirestore(firebaseApp);
export const functions: Functions = getFunctions(firebaseApp);

let emulatorsConnected = false;

/** Idempotent — safe to call more than once (e.g. from hot-reloaded modules). */
export function connectToEmulatorsIfConfigured(): void {
  if (emulatorsConnected) return;
  if (!env.useEmulator) {
    // DATA_MODE === "emulator" means the app is about to make real
    // Auth/Firestore/Functions calls. Doing that without pointing the SDK
    // at the local emulator would mean silently talking to whatever
    // `env.firebase` resolves to — potentially a real project, if one is
    // ever configured for a future deployment. Fail loudly instead of
    // guessing (CLAUDE.md rule 3/5: never connect to production without
    // explicit approval, and never let this kind of thing fail silently).
    throw new Error(
      "DATA_MODE=emulator requires VITE_USE_FIREBASE_EMULATOR=true (the default). Refusing to " +
        "initialize Firebase without pointing it at the local Emulator Suite — this would otherwise " +
        "silently use env.firebase's configured project, which could be a real one. Remove " +
        "VITE_USE_FIREBASE_EMULATOR=false, or switch DATA_MODE to \"fixture\".",
    );
  }
  connectAuthEmulator(auth, `http://${env.emulatorHost}:${env.emulatorPorts.auth}`, {
    disableWarnings: true,
  });
  connectFirestoreEmulator(firestore, env.emulatorHost, env.emulatorPorts.firestore);
  connectFunctionsEmulator(functions, env.emulatorHost, env.emulatorPorts.functions);
  emulatorsConnected = true;
}

if (DATA_MODE === "emulator") {
  connectToEmulatorsIfConfigured();
}
