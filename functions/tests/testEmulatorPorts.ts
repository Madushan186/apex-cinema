/**
 * Emulator ports for the backend test suite — NOT a test file itself (no
 * `describe`/`it`, so Vitest ignores it). Every default here matches
 * firebase.json exactly, so the normal `npm run test:emulators` /
 * `npm run test:e2e:emulator` flow (which relies on `firebase
 * emulators:exec` setting no overrides) is completely unaffected.
 *
 * Overridable only so this same suite can be pointed at an isolated,
 * alternate-port emulator instance (firebase.test.json) without disturbing
 * a separately-running preview emulator on the default ports — see
 * docs/PROGRESS.md "isolated emulator test ports."
 */
function readPort(name: string, fallback: number): number {
  const value = process.env[name];
  const parsed = value ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export const EMULATOR_PORTS = {
  auth: readPort("TEST_AUTH_EMULATOR_PORT", 9099),
  firestore: readPort("TEST_FIRESTORE_EMULATOR_PORT", 8080),
  functions: readPort("TEST_FUNCTIONS_EMULATOR_PORT", 5001),
};

/**
 * The Functions/Auth emulator hub coordinates instances via a locator keyed
 * by PROJECT ID, independent of port config — two `firebase emulators:exec`
 * runs for the same project id collide there even with fully distinct
 * ports (confirmed: firebase-tools' own "running multiple instances...
 * this may result in unexpected behavior" warning, which turned out to be
 * literal — client SDK calls silently reached the OTHER instance's
 * emulators). An isolated run therefore needs its own project id too, not
 * just its own ports — see docs/PROGRESS.md "isolated emulator test ports."
 */
export const TEST_PROJECT_ID = process.env.TEST_PROJECT_ID ?? "demo-apex-cinema";
