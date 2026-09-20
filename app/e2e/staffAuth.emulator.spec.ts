import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

/**
 * Frontend integration tests for staff/owner auth against the REAL Auth +
 * Firestore + Functions emulators — tagged @emulator, same convention as
 * emulator.spec.ts. Only meaningful when the app was built with
 * VITE_DATA_MODE=emulator and the emulators are running with the seeded
 * test accounts (see `npm run seed:auth` / the root `test:e2e:emulator`
 * script, which runs it automatically).
 *
 * Local emulator-only test credentials (never real, see
 * functions/src/scripts/seedAuthUsers.ts):
 *   owner@apexcinema.test / LocalOwner!123
 *   staff@apexcinema.test / LocalStaff!123
 */

const OWNER = { email: "owner@apexcinema.test", password: "LocalOwner!123" };
const STAFF = { email: "staff@apexcinema.test", password: "LocalStaff!123" };

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function signIn(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto("/staff/login");
  await page.getByLabel(/email/i).fill(account.email);
  await page.getByLabel(/password/i).fill(account.password);
  await page.getByRole("button", { name: "Sign In" }).click();
}

async function useSinhala(page: Page): Promise<void> {
  // A string (not a typed function) — this file's tsconfig has no DOM lib,
  // so referencing `window`/`localStorage` by name wouldn't type-check even
  // though the script only ever runs in the browser page.
  await page.addInitScript('window.localStorage.setItem("apex-cinema:locale", "si")');
}

test.describe("staff auth — core flows @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("an unauthenticated visitor sees a sign-in prompt, not the schedule", async ({ page }) => {
    await page.goto("/staff");
    await expect(page.getByRole("heading", { name: "Staff Sign In" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in again" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toHaveCount(0);
  });

  test("an invalid login shows an inline error, not a crash", async ({ page }) => {
    await signIn(page, { email: "nobody@apexcinema.test", password: "wrong-password" });
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Staff Sign In" })).toBeVisible();
  });

  test("staff can sign in, sees today's schedule, and cannot reach the owner overview", async ({ page }) => {
    await signIn(page, STAFF);
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
    for (let room = 1; room <= 6; room++) {
      await expect(page.getByRole("heading", { name: `Room ${room}` })).toBeVisible();
    }
    await expect(page.getByText("Contact-only")).toBeVisible();
    // Staff role — no link to the owner-only view.
    await expect(page.getByRole("link", { name: /owner overview/i })).toHaveCount(0);

    // Direct navigation is also denied, not just hidden from the UI.
    await page.goto("/staff/overview");
    await expect(page.getByRole("alert").getByText("Access denied")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Booking Overview" })).toHaveCount(0);
  });

  test("owner can sign in, sees the schedule, and can reach the booking overview counts", async ({ page }) => {
    await signIn(page, OWNER);
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
    await page.getByRole("link", { name: /owner overview/i }).click();

    await expect(page.getByRole("heading", { name: "Booking Overview" })).toBeVisible();
    await expect(page.getByText("Total bookings")).toBeVisible();
    await expect(page.getByText("Active holds")).toBeVisible();
    await expect(page.getByText("Expired holds")).toBeVisible();
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  });

  test("signing out removes access to the schedule", async ({ page }) => {
    await signIn(page, OWNER);
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();

    await page.getByRole("button", { name: "Sign Out" }).click();
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toHaveCount(0);

    await page.goto("/staff");
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toHaveCount(0);
  });
});

test.describe("staff auth — 390px mobile layout @emulator", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("the login form and schedule are usable at 390px", async ({ page }) => {
    await page.goto("/staff/login");
    await expect(page.getByRole("heading", { name: "Staff Sign In" })).toBeVisible();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();

    await signIn(page, STAFF);
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Room 1" })).toBeVisible();
  });
});

test.describe("staff auth — Sinhala @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("the login form and schedule render in Sinhala", async ({ page }) => {
    await useSinhala(page);
    await page.goto("/staff/login");
    await expect(page.getByRole("heading", { name: "Staff Sign In" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "si");

    await signIn(page, STAFF);
    await expect(page.getByRole("heading", { name: "අද දිනයේ කාලසටහන" })).toBeVisible();
  });
});

test.describe("staff auth — Sinhala at 390px @emulator", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("the login form renders in Sinhala at 390px", async ({ page }) => {
    await useSinhala(page);
    await page.goto("/staff/login");
    await expect(page.getByRole("heading", { name: "Staff Sign In" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "si");
  });
});
