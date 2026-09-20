import { expect, test } from "@playwright/test";
import { futureBusinessDate, SLOT_TIMES } from "./testDates";

/**
 * Frontend integration test against the REAL booking engine (Cloud
 * Functions + Firestore emulator) — tagged @emulator so the default
 * `npm run test:e2e` (fixture mode) never tries to run it. Only meaningful
 * when the app was built with VITE_DATA_MODE=emulator and the emulators are
 * actually running — see the root `test:e2e:emulator` script.
 */
test.describe("real booking engine @emulator", () => {
  test("creates a real hold via the emulator and shows a hold reference, not a fake confirmation", async ({ page }) => {
    // Deterministic date/slot — never "today", so this can never fail just
    // because the suite happens to run late in the business day or after
    // closing (see e2e/testDates.ts). A future date on a freshly seeded
    // emulator has zero existing bookings, so 09:00 is always free.
    const dateISO = futureBusinessDate();
    const time = SLOT_TIMES[0];

    await page.goto("/book?package=ac-small");

    await page.getByLabel(/ac small/i).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Pick a date & time" })).toBeVisible();
    await page.getByLabel("Or choose another date").fill(dateISO);
    await page.getByRole("button", { name: new RegExp(`^${time}`) }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    await page.getByLabel(/full name/i).fill("Emulator Test");
    await page.getByLabel(/phone number/i).fill("0771234567");
    await page.getByLabel(/^email/i).fill(`emulator-e2e-${Date.now()}@example.com`);
    await page.getByLabel(/number of people/i).fill("2");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
    await page.getByRole("button", { name: "Continue to demo checkout" }).click();

    // The REAL engine's checkout step — visually and textually distinct
    // from the fixture "Demo checkout" (no "simulate outcome" control).
    await expect(page.getByRole("heading", { name: "Real booking engine preview" })).toBeVisible();
    await expect(page.getByText("EMULATOR", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Create hold (local emulator)" }).click();

    await expect(page.getByRole("heading", { name: "Hold created" })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/APX-/)).toBeVisible();
    // Never claim a confirmed paid booking from a hold — see docs/PROGRESS.md.
    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toHaveCount(0);
    await expect(page.getByText("Not charged")).toBeVisible();
  });
});
