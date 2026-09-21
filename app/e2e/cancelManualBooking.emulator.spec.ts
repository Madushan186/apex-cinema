import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { writeLegacyUnpaidBooking } from "./adminEmulator";
import { futureBusinessDate } from "./testDates";

/**
 * Frontend integration tests for staff/owner manual-booking cancellation
 * against the REAL Auth + Firestore + Functions emulators — tagged
 * @emulator, same convention as manualBooking.emulator.spec.ts.
 *
 * Deterministic dates at offsets 230+, distinct from every other spec
 * file's date range, so these tests can run in the same shared emulator
 * session without colliding on room/date/time.
 *
 * docs/DECISIONS.md D17 changed what "an eligible-for-cancellation booking"
 * even is: every booking created through the real UI/API now always
 * records the LKR 1,000 advance, which blocks cancellation by design (see
 * functions/tests/cancelManualBooking.emulator.test.ts's "a recorded
 * payment blocks cancellation" describe block). So the cancel *dialog's*
 * own UI behavior (open, required reason, Escape, badge, history) can only
 * still be exercised against a booking that predates D17 — these tests set
 * that up via `writeLegacyUnpaidBooking` (a direct Firestore Admin write,
 * mirroring the equivalent Cloud Functions emulator test's synthetic
 * fixture), then drive everything else through the real browser UI.
 */

const STAFF = { email: "staff@apexcinema.test", password: "LocalStaff!123" };

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const MOBILE_VIEWPORT = { width: 390, height: 844 };

async function signInStaff(page: Page): Promise<void> {
  await page.goto("/staff/login");
  await page.getByLabel(/email/i).fill(STAFF.email);
  await page.getByLabel(/password/i).fill(STAFF.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
}

/** docs/DECISIONS.md D17 — must be explicitly checked before Confirm can proceed; never preselected. */
async function checkAdvanceReceived(page: Page): Promise<void> {
  await page.getByLabel(/cash advance has been received/i).check();
}

/** Creates a manual booking through the real UI flow (form → review → confirm) and lands back on the schedule for that date. This booking always carries the D17 advance — it is NOT eligible for cancellation. */
async function createManualBookingViaUI(
  page: Page,
  opts: { packageLabel: string; dateISO: string; time: string; name: string; phone: string },
): Promise<void> {
  await page.getByRole("link", { name: "New manual booking" }).click();
  await expect(page.getByRole("heading", { name: "New Manual Booking" })).toBeVisible();

  await page.getByLabel(new RegExp(opts.packageLabel, "i")).check({ force: true });
  await page.getByLabel("Or choose another date").fill(opts.dateISO);
  await expect(page.getByRole("button", { name: new RegExp(`^${opts.time}`) })).toBeEnabled();
  await page.getByRole("button", { name: new RegExp(`^${opts.time}`) }).click();
  await page.getByLabel("Number of people").fill("2");
  await page.getByLabel("Customer name").fill(opts.name);
  await page.getByLabel("Customer phone").fill(opts.phone);

  await page.getByRole("button", { name: "Review booking" }).click();
  await expect(page.getByRole("heading", { name: "Review booking" })).toBeVisible();
  await checkAdvanceReceived(page);
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("status").getByText("Booking confirmed")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Back to schedule/ }).click();
  await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
}

test.describe("a booking with the D17 advance has no Cancel action @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("a booking created via the real UI (advance recorded) never offers Cancel — cancellation is blocked until the refund policy is decided", async ({ page }) => {
    const dateISO = futureBusinessDate(235);
    await signInStaff(page);
    await createManualBookingViaUI(page, {
      packageLabel: "AC Small",
      dateISO,
      time: "09:00",
      name: "No Cancel Action Customer",
      phone: "0771230009",
    });

    await expect(page.getByText("No Cancel Action Customer")).toBeVisible();
    await expect(page.getByText("Partially paid", { exact: false })).toBeVisible();
    // The cosmetic eligibility check (scheduleFormat.ts's isCancelEligible)
    // hides the button entirely for a booking with any recorded payment —
    // this is not a disabled button, there is no button at all.
    await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
    // Extend, by contrast, IS still offered — payment status doesn't gate extension.
    await expect(page.getByRole("button", { name: "Extend +1 hour" })).toBeVisible();
  });
});

test.describe("staff manual-booking cancellation — desktop @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("staff cancels an eligible (legacy unpaid) manual booking — dialog, required reason, badge, and history preserved", async ({ page }) => {
    const dateISO = futureBusinessDate(230);
    await writeLegacyUnpaidBooking({
      packageId: "ac-small",
      dateISO,
      time: "09:00",
      name: "Cancel Flow Customer",
      phone: "0771230001",
    });

    await signInStaff(page);
    await page.goto(`/staff?date=${dateISO}`);
    await expect(page.getByText("Cancel Flow Customer")).toBeVisible();
    const cancelButton = page.getByRole("button", { name: "Cancel booking" }).first();
    await expect(cancelButton).toBeVisible();
    await cancelButton.click();

    await expect(page.getByRole("heading", { name: "Cancel this booking?" })).toBeVisible();
    // Booking details are shown in the confirmation dialog.
    await expect(page.getByRole("dialog").getByText("Cancel Flow Customer · 0771230001")).toBeVisible();

    // Confirming with an empty reason is rejected — inline, dialog stays open.
    await page.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(page.getByText("A cancellation reason is required.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Cancel this booking?" })).toBeVisible();

    await page.getByLabel("Reason for cancellation").fill("Customer called to cancel");
    await page.getByRole("button", { name: "Confirm cancellation" }).click();

    // Dialog closes, schedule refreshes, and the row now shows Cancelled —
    // never removed, history stays visible.
    await expect(page.getByRole("heading", { name: "Cancel this booking?" })).not.toBeVisible();
    await expect(page.getByText("Cancel Flow Customer")).toBeVisible();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
    // Payment status is untouched by cancellation.
    await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();
    // No longer offered a Cancel action once cancelled.
    await expect(page.getByRole("button", { name: "Cancel booking" })).toHaveCount(0);
  });

  test("Escape closes the dialog without cancelling — keyboard navigation", async ({ page }) => {
    const dateISO = futureBusinessDate(231);
    await writeLegacyUnpaidBooking({
      packageId: "non-ac",
      dateISO,
      time: "12:00",
      name: "Keyboard Escape Customer",
      phone: "0771230002",
    });

    await signInStaff(page);
    await page.goto(`/staff?date=${dateISO}`);
    await page.getByRole("button", { name: "Cancel booking" }).first().click();
    await expect(page.getByRole("heading", { name: "Cancel this booking?" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Cancel this booking?" })).not.toBeVisible();

    // Still confirmed, not cancelled, and still offers Cancel — nothing happened.
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel booking" })).toBeVisible();
  });

  test("a released slot can be booked again after cancellation", async ({ page }) => {
    const dateISO = futureBusinessDate(232);
    await writeLegacyUnpaidBooking({
      packageId: "ac-large",
      dateISO,
      time: "15:00",
      name: "Reslot First Customer",
      phone: "0771230003",
    });

    await signInStaff(page);
    await page.goto(`/staff?date=${dateISO}`);
    await page.getByRole("button", { name: "Cancel booking" }).first().click();
    await page.getByLabel("Reason for cancellation").fill("Freeing this slot for another customer");
    await page.getByRole("button", { name: "Confirm cancellation" }).click();
    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();

    // The exact same package/date/time is bookable again — a real
    // end-to-end proof the release actually happened, not just a badge change.
    await createManualBookingViaUI(page, {
      packageLabel: "AC Large",
      dateISO,
      time: "15:00",
      name: "Reslot Second Customer",
      phone: "0771230004",
    });
    await expect(page.getByText("Reslot Second Customer")).toBeVisible();
    await expect(page.getByText("Confirmed", { exact: true }).first()).toBeVisible();
  });
});

test.describe("staff manual-booking cancellation — 390px mobile @emulator", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("the cancel dialog is usable at 390px", async ({ page }) => {
    const dateISO = futureBusinessDate(233);
    await writeLegacyUnpaidBooking({
      packageId: "ac-small",
      dateISO,
      time: "18:00",
      name: "Mobile Cancel Customer",
      phone: "0771230005",
    });

    await signInStaff(page);
    await page.goto(`/staff?date=${dateISO}`);
    await page.getByRole("button", { name: "Cancel booking" }).first().click();
    await expect(page.getByRole("heading", { name: "Cancel this booking?" })).toBeVisible();
    await page.getByLabel("Reason for cancellation").fill("Cancelled from a mobile device");
    await page.getByRole("button", { name: "Confirm cancellation" }).click();

    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  });
});

test.describe("staff manual-booking cancellation — Sinhala @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("the cancellation dialog and badge render in Sinhala", async ({ page }) => {
    const dateISO = futureBusinessDate(234);
    await writeLegacyUnpaidBooking({
      packageId: "ac-small",
      dateISO,
      time: "09:00",
      name: "Sinhala Cancel Customer",
      phone: "0771230006",
    });

    await page.addInitScript('window.localStorage.setItem("apex-cinema:locale", "si")');
    await page.goto("/staff/login");
    await page.getByLabel(/email/i).fill(STAFF.email);
    await page.getByLabel(/password/i).fill(STAFF.password);
    await page.getByRole("button", { name: "Sign In" }).click();
    // Wait for sign-in to actually complete before navigating away — the
    // link text stays "New Manual Booking" (untranslated) even in Sinhala,
    // same wait signInStaffAnyLocale uses elsewhere in this codebase.
    await expect(page.getByRole("link", { name: "New Manual Booking" })).toBeVisible();
    await page.goto(`/staff?date=${dateISO}`);

    await page.getByRole("button", { name: "Booking එක Cancel කරන්න" }).first().click();
    await expect(page.getByRole("heading", { name: "මේ booking එක Cancel කරන්නද?" })).toBeVisible();
    await page.getByLabel("Cancel කරන්න හේතුව").fill("Sinhala locale වලින් cancel කරනවා");
    await page.getByRole("button", { name: "Cancellation එක Confirm කරන්න" }).click();

    await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  });
});
