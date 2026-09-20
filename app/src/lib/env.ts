/**
 * Typed, validated access to build-time env vars. See app/.env.example for
 * what each variable means and why VITE_* Firebase client config is not a
 * secret (docs/SECURITY.md §7 / CLAUDE.md rule 10 still applies to *real*
 * secrets like the PayHere merchant key — those never go here).
 */

function readEnv(name: string, fallback: string): string {
  const value = import.meta.env[name] as string | undefined;
  return value !== undefined && value !== "" ? value : fallback;
}

function readBool(name: string, fallback: boolean): boolean {
  const value = import.meta.env[name] as string | undefined;
  if (value === undefined || value === "") return fallback;
  return value === "true";
}

function readPort(name: string, fallback: number): number {
  const value = import.meta.env[name] as string | undefined;
  const parsed = value ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

// Defaults match app/.env.example exactly: a "demo-" prefixed project id
// that the Firebase Emulator Suite treats as offline-only (never a real GCP
// project), so the app boots safely into emulator mode with zero setup.
// Real values only matter once VITE_USE_FIREBASE_EMULATOR=false is set
// deliberately for a non-local environment — see docs/DECISIONS.md.
export const env = {
  firebase: {
    apiKey: readEnv("VITE_FIREBASE_API_KEY", "demo-api-key"),
    authDomain: readEnv("VITE_FIREBASE_AUTH_DOMAIN", "demo-apex-cinema.firebaseapp.com"),
    projectId: readEnv("VITE_FIREBASE_PROJECT_ID", "demo-apex-cinema"),
    storageBucket: readEnv("VITE_FIREBASE_STORAGE_BUCKET", "demo-apex-cinema.appspot.com"),
    messagingSenderId: readEnv("VITE_FIREBASE_MESSAGING_SENDER_ID", "000000000000"),
    appId: readEnv("VITE_FIREBASE_APP_ID", "1:000000000000:web:0000000000000000000000"),
  },
  // Defaults to true so a missing .env.local can never accidentally point
  // dev at a real Firebase project (see docs/CLAUDE.md rule: never connect
  // to production without explicit approval).
  useEmulator: readBool("VITE_USE_FIREBASE_EMULATOR", true),
  emulatorHost: readEnv("VITE_FIREBASE_EMULATOR_HOST", "127.0.0.1"),
  // Overridable only for an isolated test run (see firebase.test.json /
  // docs/PROGRESS.md "isolated emulator test ports") — every default here
  // matches firebase.json exactly, so normal dev/preview is unaffected.
  emulatorPorts: {
    auth: readPort("VITE_FIREBASE_EMULATOR_AUTH_PORT", 9099),
    firestore: readPort("VITE_FIREBASE_EMULATOR_FIRESTORE_PORT", 8080),
    functions: readPort("VITE_FIREBASE_EMULATOR_FUNCTIONS_PORT", 5001),
  },
};
