import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { futureBusinessDate } from "./testDates";

/**
 * Frontend integration tests for staff/owner manual-booking extension
 * against the REAL Auth + Firestore + Functions emulators — tagged
 * @emulator, same convention as manualBooking.emulator.spec.ts and
 * cancelManualBooking.emulator.spec.ts.
 *
 * Deterministic dates at offsets 260+, distinct from every other spec
 * file's date range, so these tests can run in the same shared emulator
 * session without colliding on room/date/time.
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

/** Same as signInStaff, but doesn't assert the (Sinhala-translated) schedule heading text. */
async function signInStaffAnyLocale(page: Page): Promise<void> {
  await page.goto("/staff/login");
  await page.getByLabel(/email/i).fill(STAFF.email);
  await page.getByLabel(/password/i).fill(STAFF.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("link", { name: "New Manual Booking" })).toBeVisible();
}

/** docs/DECISIONS.md D17 — must be explicitly checked before Confirm can proceed; never preselected. "cash advance" appears verbatim in both English and Sinhala copy. */
async function checkAdvanceReceived(page: Page): Promise<void> {
  await page.getByLabel(/cash advance/i).check();
}

/** Creates a manual booking through the real UI flow (form → review → confirm) and lands back on the schedule for that date. Carries the D17 advance, so it's always at least "partially_paid", never "unpaid". */
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

test.describe("staff manual-booking extension — desktop @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("staff extends an eligible manual booking — dialog details, charge, new total, and schedule update", async ({ page }) => {
    const dateISO = futureBusinessDate(260);
    await signInStaff(page);
    await createManualBookingViaUI(page, {
      packageLabel: "AC Small",
      dateISO,
      time: "09:00",
      name: "Extend Flow Customer",
      phone: "0771260001",
    });

    // Original booking shows 09:00–12:00.
    await expect(page.getByText("09:00–12:00", { exact: false })).toBeVisible();

    const extendButton = page.getByRole("button", { name: "Extend +1 hour" }).first();
    await expect(extendButton).toBeVisible();
    await extendButton.click();

    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).toBeVisible();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("09:00–12:00")).toBeVisible(); // current end
    await expect(dialog.getByText("09:00–13:00")).toBeVisible(); // new end
    await expect(dialog.getByText("LKR 1,000")).toBeVisible(); // additional charge
    // AC Small is LKR 3,200 — new total after one extension is LKR 4,200.
    await expect(dialog.getByText("LKR 4,200")).toBeVisible();
    await expect(page.getByText("This does not record a payment", { exact: false })).toBeVisible();

    await page.getByRole("button", { name: "Confirm extension" }).click();

    // Dialog closes, schedule refreshes, row now shows the extended time
    // range and an "extended" indicator — never a silent no-op.
    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).not.toBeVisible();
    await expect(page.getByText("09:00–13:00", { exact: false })).toBeVisible();
    await expect(page.getByText("extended +1h", { exact: false })).toBeVisible();
    // Still shows Partially paid (LKR 1,000 advance against a now-LKR-4,200
    // total) — extension never changes the amount actually paid.
    await expect(page.getByText("Partially paid", { exact: false })).toBeVisible();
  });

  test("Escape closes the dialog without extending — keyboard navigation", async ({ page }) => {
    const dateISO = futureBusinessDate(261);
    await signInStaff(page);
    await createManualBookingViaUI(page, {
      packageLabel: "Non-AC",
      dateISO,
      time: "12:00",
      name: "Keyboard Escape Extend Customer",
      phone: "0771260002",
    });

    await page.getByRole("button", { name: "Extend +1 hour" }).first().click();
    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).not.toBeVisible();

    // Still the original 12:00–15:00 — nothing happened.
    await expect(page.getByText("12:00–15:00", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Extend +1 hour" })).toBeVisible();
  });

  test("the extended slot blocks the overlapping public slot on the booking wizard", async ({ page }) => {
    const dateISO = futureBusinessDate(262);
    await signInStaff(page);
    await createManualBookingViaUI(page, {
      packageLabel: "AC Small",
      dateISO,
      time: "09:00",
      name: "Availability Extend Customer",
      phone: "0771260003",
    });

    await page.getByRole("button", { name: "Extend +1 hour" }).first().click();
    await page.getByRole("button", { name: "Confirm extension" }).click();
    // Wait for the dialog to actually close (not just for "09:00–13:00" to
    // appear anywhere — the dialog itself previews that exact text as the
    // would-be new end time before the request even completes, so
    // asserting on that text alone could pass before the extension has
    // really been committed).
    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).not.toBeVisible();
    await expect(page.getByText("09:00–13:00", { exact: false })).toBeVisible();

    // The 12:00 public slot for AC Small (only room-4) is now blocked —
    // proving public availability reflects the extension, matching
    // docs/PROJECT_BRIEF.md's canonical 09:00–13:00 → 12:00 example.
    await page.goto(`/book?package=ac-small`);
    await page.getByLabel(/ac small/i).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Pick a date & time" })).toBeVisible();
    await page.getByLabel("Or choose another date").fill(dateISO);
    await expect(page.getByRole("button", { name: /^12:00/ })).toBeDisabled();
  });
});

test.describe("staff manual-booking extension — 390px mobile @emulator", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("the extend dialog is usable at 390px", async ({ page }) => {
    const dateISO = futureBusinessDate(263);
    await signInStaff(page);
    await createManualBookingViaUI(page, {
      packageLabel: "AC Large",
      dateISO,
      time: "15:00",
      name: "Mobile Extend Customer",
      phone: "0771260004",
    });

    await page.getByRole("button", { name: "Extend +1 hour" }).first().click();
    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm extension" }).click();
    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).not.toBeVisible();

    await expect(page.getByText("15:00–19:00", { exact: false })).toBeVisible();
  });
});

test.describe("staff manual-booking extension — Sinhala @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("the extension dialog and extended badge render in Sinhala", async ({ page }) => {
    const dateISO = futureBusinessDate(264);
    await page.addInitScript('window.localStorage.setItem("apex-cinema:locale", "si")');
    await signInStaffAnyLocale(page);

    await page.getByRole("link", { name: "New Manual Booking" }).click();
    await expect(page.getByRole("heading", { name: "New Manual Booking" })).toBeVisible();
    await page.getByLabel(/ac small/i).check({ force: true });
    await page.getByLabel("නැත්නම් වෙනත් දිනයක් තෝරන්න").fill(dateISO);
    await expect(page.getByRole("button", { name: /^09:00/ })).toBeEnabled();
    await page.getByRole("button", { name: /^09:00/ }).click();
    await page.getByLabel("අය ගණන").fill("2");
    await page.getByLabel("Customer නම").fill("Sinhala Extend Customer");
    await page.getByLabel("Customer Phone").fill("0771260005");
    await page.getByRole("button", { name: "Booking එක Review කරන්න" }).click();
    await checkAdvanceReceived(page);
    await page.getByRole("button", { name: "Booking එක Confirm කරන්න" }).click();
    await expect(page.getByRole("status").getByText("Booking එක Confirmed")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Schedule එකට ආපහු/ }).click();

    await page.getByRole("button", { name: "අමතර පැයක් (+1 hour) දාන්න" }).first().click();
    await expect(page.getByRole("heading", { name: "මේ booking එකට අමතර පැයක් දාන්නද?" })).toBeVisible();
    await page.getByRole("button", { name: "Extension එක Confirm කරන්න" }).click();
    await expect(page.getByRole("heading", { name: "මේ booking එකට අමතර පැයක් දාන්නද?" })).not.toBeVisible();

    await expect(page.getByText("09:00–13:00", { exact: false })).toBeVisible();
  });
});
