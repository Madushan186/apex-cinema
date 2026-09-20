/**
 * Strict validation for the isolated-emulator test environment used by
 * `functionsEmulator.ts`'s direct-HTTP-callable tests (e.g. the
 * staff-vs-competing-guest race in manualBooking.emulator.spec.ts) — NOT a
 * test file itself (no `test`/`describe` here).
 *
 * Root cause this guards against (see docs/PROGRESS.md "test-isolation
 * fallback"): `callableUrl()` used to default `TEST_PROJECT_ID`/
 * `TEST_FUNCTIONS_EMULATOR_PORT` to the live preview's own project id
 * ("demo-apex-cinema") and port (5001) whenever they weren't explicitly
 * exported. Running `npx playwright test` directly (outside the
 * `emulators:exec`-wrapped `test:e2e:emulator` script) in a shell that
 * hadn't re-exported those vars silently pointed the race test's direct
 * HTTP call at whatever was actually listening on those coordinates — in
 * practice, the developer's own always-on live preview emulator, not an
 * isolated instance. The request happened to be rejected that time, but
 * nothing about the code prevented it from succeeding and writing real
 * data into the preview.
 *
 * Fix: every value is required (no fallback, ever), validated, and
 * explicitly rejected if it matches the live preview's own known
 * coordinates — so a missing or preview-matching configuration fails
 * synchronously, before any network request is constructed or made,
 * instead of silently resolving to "wherever happens to be listening."
 */

/** The live preview's own project id (`.firebaserc` "default") — never a valid isolated-test value, whether defaulted OR explicitly set. */
const PREVIEW_PROJECT_ID = "demo-apex-cinema";

/** The live preview's own emulator ports (`firebase.json`, no `--config` override) — never valid isolated-test ports, for the same reason. */
const PREVIEW_PORTS = { auth: 9099, firestore: 8080, functions: 5001 } as const;

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost"]);

export interface IsolatedEmulatorConfig {
  readonly projectId: string;
  readonly authPort: number;
  readonly firestorePort: number;
  readonly functionsPort: number;
}

class IsolatedTestConfigError extends Error {
  constructor(message: string) {
    super(`${message} No network request was made.`);
    this.name = "IsolatedTestConfigError";
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new IsolatedTestConfigError(
      `Isolated test configuration is missing ${name}. This test targets an isolated emulator instance on purpose ` +
        `and never falls back to the live preview's project/ports — set ${name} explicitly ` +
        `(see docs/PROGRESS.md "isolated emulator test ports").`,
    );
  }
  return value;
}

function requirePort(name: string): number {
  const raw = requireEnv(name);
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    throw new IsolatedTestConfigError(`${name}="${raw}" is not a valid TCP port (1-65535).`);
  }
  return parsed;
}

/**
 * Reads and strictly validates the isolated test environment's project id
 * and emulator ports from `process.env`. Throws synchronously — before any
 * network request — if configuration is missing, malformed, or matches the
 * live preview's own project id/ports.
 */
export function getIsolatedEmulatorConfig(): IsolatedEmulatorConfig {
  const projectId = requireEnv("TEST_PROJECT_ID");
  if (!/^demo-[a-z0-9-]+$/.test(projectId)) {
    throw new IsolatedTestConfigError(
      `TEST_PROJECT_ID="${projectId}" must be a "demo-"-prefixed Firebase emulator project id ` +
        `(lowercase letters, digits, hyphens only) — required so the Emulator Suite treats it as offline-only.`,
    );
  }
  if (projectId === PREVIEW_PROJECT_ID) {
    throw new IsolatedTestConfigError(
      `TEST_PROJECT_ID must not be "${PREVIEW_PROJECT_ID}" — that is the live preview's own project id. ` +
        `Use a distinct isolated id (e.g. "demo-apex-cinema-test").`,
    );
  }

  const authPort = requirePort("TEST_AUTH_EMULATOR_PORT");
  const firestorePort = requirePort("TEST_FIRESTORE_EMULATOR_PORT");
  const functionsPort = requirePort("TEST_FUNCTIONS_EMULATOR_PORT");
  const ports = { auth: authPort, firestore: firestorePort, functions: functionsPort };

  for (const [name, port] of Object.entries(ports) as [keyof typeof PREVIEW_PORTS, number][]) {
    if (port === PREVIEW_PORTS[name]) {
      throw new IsolatedTestConfigError(
        `TEST_${name.toUpperCase()}_EMULATOR_PORT=${port} matches the live preview's own ${name} port — ` +
          `isolated test ports must be distinct (see firebase.test.json).`,
      );
    }
  }

  const portValues = Object.values(ports);
  if (new Set(portValues).size !== portValues.length) {
    throw new IsolatedTestConfigError(`Isolated test emulator ports must all be distinct from each other: ${portValues.join(", ")}.`);
  }

  return { projectId, authPort, firestorePort, functionsPort };
}

/**
 * Asserts a constructed emulator URL actually targets a loopback-only
 * host over plain HTTP on the expected port — an explicit, testable
 * check rather than a bare assumption baked into a template string.
 */
export function assertLoopbackEmulatorUrl(url: string, expectedPort: number): void {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:") {
    throw new IsolatedTestConfigError(`Emulator URL "${url}" must use http:, not ${parsed.protocol}`);
  }
  if (!LOOPBACK_HOSTNAMES.has(parsed.hostname)) {
    throw new IsolatedTestConfigError(`Emulator URL "${url}" must target a loopback host (127.0.0.1/localhost), not "${parsed.hostname}".`);
  }
  if (Number(parsed.port) !== expectedPort) {
    throw new IsolatedTestConfigError(`Emulator URL "${url}" port ${parsed.port} does not match the expected isolated port ${expectedPort}.`);
  }
}
