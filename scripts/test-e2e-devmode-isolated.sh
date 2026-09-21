#!/usr/bin/env bash
#
# Runs `npm run test:e2e:devmode` — the @devmode Playwright suite
# (playwright.dev.config.ts) — against an ISOLATED Firebase Emulator Suite
# instance (firebase.test.json, project "demo-apex-cinema-test") AND a
# genuinely fresh `vite dev` server. Never the developer's live preview
# (firebase.json, default project "demo-apex-cinema", nor its already-
# running dev server on the default port) — both are separate processes
# this script never touches.
#
# See app/playwright.dev.config.ts's own doc comment for why this exists:
# it's the only suite in this repo that exercises `vite dev`'s actual
# dependency-optimizer pipeline, added after a real "blank screen on
# Extend" incident that every production-build-only test (the normal
# `test:e2e:emulator` suite) was structurally blind to.
#
# Same isolated-instance workflow as scripts/test-e2e-emulator-isolated.sh
# — see that script's own comments for why `emulators:start`-in-background
# (not `emulators:exec`) is used.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

TEST_PROJECT_ID="demo-apex-cinema-test"
TEST_AUTH_EMULATOR_PORT="9199"
TEST_FIRESTORE_EMULATOR_PORT="8180"
TEST_FUNCTIONS_EMULATOR_PORT="5101"
export TEST_PROJECT_ID TEST_AUTH_EMULATOR_PORT TEST_FIRESTORE_EMULATOR_PORT TEST_FUNCTIONS_EMULATOR_PORT

# Standard Firebase Admin SDK emulator env vars, for the seed scripts.
export FIRESTORE_EMULATOR_HOST="127.0.0.1:${TEST_FIRESTORE_EMULATOR_PORT}"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:${TEST_AUTH_EMULATOR_PORT}"
export GCLOUD_PROJECT="${TEST_PROJECT_ID}"

# Java is required by the Auth/Firestore emulators but isn't linked onto
# PATH by default on this machine (see docs/PROGRESS.md "Environment
# notes") — add it for THIS script's own subprocess only, never globally,
# and only if a working `java` isn't already resolvable.
if ! java -version >/dev/null 2>&1; then
  if [ -x /opt/homebrew/opt/openjdk@21/bin/java ]; then
    export PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"
  fi
fi
if ! java -version >/dev/null 2>&1; then
  echo "Refusing to start: no working 'java' found (required by the Auth/Firestore emulators)." >&2
  echo "Install it (see README.md) or ensure it's resolvable on PATH, then retry." >&2
  exit 1
fi

LOG_FILE="$(mktemp -t apex-cinema-isolated-emulator-log)"
EMULATOR_PID=""

cleanup() {
  local status=$?
  if [ -n "$EMULATOR_PID" ] && kill -0 "$EMULATOR_PID" 2>/dev/null; then
    echo "== stopping isolated test emulator (PID $EMULATOR_PID); your live preview emulator and its dev server are separate processes and are never touched by this script =="
    kill "$EMULATOR_PID" 2>/dev/null || true
    wait "$EMULATOR_PID" 2>/dev/null || true
  fi
  rm -f "$LOG_FILE"
  exit "$status"
}
trap cleanup EXIT INT TERM

echo "== building packages/booking-core and functions =="
npm run build --workspace packages/booking-core
npm run build --workspace functions

echo "== starting isolated emulator: project=$TEST_PROJECT_ID auth=$TEST_AUTH_EMULATOR_PORT firestore=$TEST_FIRESTORE_EMULATOR_PORT functions=$TEST_FUNCTIONS_EMULATOR_PORT =="
npx firebase --config firebase.test.json --project "$TEST_PROJECT_ID" emulators:start --only auth,firestore,functions >"$LOG_FILE" 2>&1 &
EMULATOR_PID=$!

echo "== waiting for isolated emulator readiness =="
ready=""
for _ in $(seq 1 60); do
  if grep -q "All emulators ready" "$LOG_FILE" 2>/dev/null; then
    ready="1"
    break
  fi
  if ! kill -0 "$EMULATOR_PID" 2>/dev/null; then
    echo "Isolated emulator process exited before becoming ready. Log:" >&2
    cat "$LOG_FILE" >&2
    exit 1
  fi
  sleep 2
done
if [ -z "$ready" ]; then
  echo "Timed out waiting for the isolated emulator to become ready. Log:" >&2
  cat "$LOG_FILE" >&2
  exit 1
fi

echo "== seeding isolated emulator only (never ./emulator-data, never the live preview) =="
npm run seed:emulator --workspace functions
npm run seed:auth --workspace functions

echo "== running @devmode Playwright suite against a fresh vite dev server (playwright.dev.config.ts manages its own webServer lifecycle) =="
cd app && npx playwright test --config playwright.dev.config.ts --grep @devmode
