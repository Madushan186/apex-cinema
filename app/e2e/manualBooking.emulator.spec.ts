import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { assertPageTargetsIsolatedFunctions, callableUrl } from "./functionsEmulator";
import { futureBusinessDate } from "./testDates";

/**
 * Frontend integration tests for the staff/owner manual-booking flow
 * against the REAL Auth + Firestore + Functions emulators — tagged
 * @emulator, same convention as emulator.spec.ts / staffAuth.emulator.spec.ts.
 * Only meaningful when the app was built with VITE_DATA_MODE=emulator and
 * the emulators are running with the seeded staff/owner accounts.
 *
 * Deterministic dates (never "today" — see e2e/testDates.ts) at offsets
 * 20+, distinct from emulator.spec.ts's offset (5) and every other spec's
 * date range, so these tests can run in the same shared emulator session
 * without colliding on room/date/time.
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

async function fillManualBookingForm(
  page: Page,
  opts: { packageLabel: string; dateISO: string; time: string; people: string; name: string; phone: string },
): Promise<void> {
  // force: true — the package selector sits close enough to the top that
  // Playwright's native scrollIntoView (used by the default actionability
  // check) can leave it partly under the app's sticky header; the click
  // itself still lands on and toggles the real radio.
  await page.getByLabel(new RegExp(opts.packageLabel, "i")).check({ force: true });
  await page.getByLabel("Or choose another date").fill(opts.dateISO);
  await expect(page.getByRole("button", { name: new RegExp(`^${opts.time}`) })).toBeEnabled();
  await page.getByRole("button", { name: new RegExp(`^${opts.time}`) }).click();
  await page.getByLabel("Number of people").fill(opts.people);
  await page.getByLabel("Customer name").fill(opts.name);
  await page.getByLabel("Customer phone").fill(opts.phone);
}

test.describe("staff manual booking — desktop @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("staff creates a manual booking, sees it on the schedule, and it blocks public availability", async ({ page }) => {
    const dateISO = futureBusinessDate(20);

    await signInStaff(page);
    await page.getByRole("link", { name: "New manual booking" }).click();
    await expect(page.getByRole("heading", { name: "New Manual Booking" })).toBeVisible();

    await fillManualBookingForm(page, {
      packageLabel: "AC Small",
      dateISO,
      time: "09:00",
      people: "2",
      name: "Nimal Perera",
      phone: "0771234567",
    });

    await page.getByRole("button", { name: "Review booking" }).click();
    await expect(page.getByRole("heading", { name: "Review booking" })).toBeVisible();
    await expect(page.getByText("Payment not recorded — unpaid")).toBeVisible();
    await expect(page.getByText("Nimal Perera")).toBeVisible();

    await page.getByRole("button", { name: "Confirm booking" }).click();

    await expect(page.getByRole("status").getByText("Booking confirmed")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/APX-/)).toBeVisible();
    await expect(page.getByText("Room 4")).toBeVisible();
    await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();

    // "Back to schedule" carries the booked date so the new booking is
    // immediately visible without extra navigation.
    await page.getByRole("button", { name: /Back to schedule/ }).click();
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
    await expect(page.getByText("09:00–12:00")).toBeVisible();
    await expect(page.getByText("Nimal Perera")).toBeVisible();
    await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();

    // The same slot is now unavailable in the PUBLIC booking wizard.
    await page.goto(`/book?package=ac-small`);
    await page.getByLabel(/ac small/i).check();
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByRole("heading", { name: "Pick a date & time" })).toBeVisible();
    await page.getByLabel("Or choose another date").fill(dateISO);
    await expect(page.getByRole("button", { name: /^09:00/ })).toBeDisabled();
  });
});

test.describe("staff manual booking — 390px mobile @emulator", () => {
  test.use({ viewport: MOBILE_VIEWPORT });

  test("the manual-booking form is usable at 390px and the booking appears on the schedule", async ({ page }) => {
    const dateISO = futureBusinessDate(21);

    await signInStaff(page);
    await page.getByRole("link", { name: "New manual booking" }).click();
    await expect(page.getByRole("heading", { name: "New Manual Booking" })).toBeVisible();

    await fillManualBookingForm(page, {
      packageLabel: "Non-AC",
      dateISO,
      time: "12:00",
      people: "3",
      name: "Kamal Silva",
      phone: "0719876543",
    });

    await page.getByRole("button", { name: "Review booking" }).click();
    await expect(page.getByRole("heading", { name: "Review booking" })).toBeVisible();
    await expect(page.getByText("Payment not recorded — unpaid")).toBeVisible();

    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(page.getByRole("status").getByText("Booking confirmed")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: /Back to schedule/ }).click();
    await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
    await expect(page.getByText("Kamal Silva")).toBeVisible();
  });
});

test.describe("staff manual booking — Sinhala @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("the manual-booking form renders in Sinhala", async ({ page }) => {
    await page.addInitScript('window.localStorage.setItem("apex-cinema:locale", "si")');
    await signInStaffAnyLocale(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "si");

    await page.getByRole("link", { name: "New Manual Booking" }).click();
    await expect(page.getByRole("heading", { name: "New Manual Booking" })).toBeVisible();
    await expect(page.getByText("AC Small")).toBeVisible();
    await expect(page.getByLabel("නැත්නම් වෙනත් දිනයක් තෝරන්න")).toBeVisible();
  });
});

test.describe("staff manual booking — packages fetch failure @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("a failed packages fetch shows an explicit error with Retry — never a silently blank Package area — and Retry recovers the flow without losing entered details", async ({
    page,
  }) => {
    // Root cause this guards against (docs/PROGRESS.md): NewManualBooking
    // used to discard `usePromise`'s `loading`/`error` for the packages
    // fetch, so ANY failed/slow getPackages call (e.g. the Functions
    // emulator being down) rendered as a permanently empty "Package"
    // fieldset with no loading, error, or retry affordance — exactly the
    // symptom reported: a bare "Package" label, "Start time" stuck on
    // "Choose a package and date first", and Review blocked with no way to
    // ever select a package.
    const dateISO = futureBusinessDate(23);

    await signInStaff(page);

    let getPackagesCallCount = 0;
    await page.route("**/getPackages", async (route) => {
      getPackagesCallCount += 1;
      if (getPackagesCallCount === 1) {
        // A real network/emulator failure, not a mocked success — the first
        // call is aborted so the frontend's actual error path runs.
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await page.getByRole("link", { name: "New manual booking" }).click();
    await expect(page.getByRole("heading", { name: "New Manual Booking" })).toBeVisible();

    // Explicit error state with Retry — not a blank fieldset.
    await expect(page.getByText("Couldn't load packages. Check your connection and try again.")).toBeVisible();
    const retryButton = page.getByRole("button", { name: "Try again" });
    await expect(retryButton).toBeVisible();

    // No package radios exist while the fetch has failed (the booking-source
    // radios below it in the form are unaffected and still render).
    await expect(page.locator('input[name="manual-booking-package"]')).toHaveCount(0);

    // Start time and Review are both blocked while packages are unavailable
    // — never a silent path to an incomplete booking.
    await expect(page.getByText("Choose a package and date first.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Review booking" })).toBeDisabled();

    // Enter customer details before retrying — a retry must not lose them.
    await page.getByLabel("Customer name").fill("Retry Flow Customer");
    await page.getByLabel("Customer phone").fill("0771230000");

    await retryButton.click();

    // Packages now render for real, and the previously entered details —
    // which live in the parent route's state, untouched by the packages
    // retry — are still there.
    await expect(page.getByLabel(/ac small/i)).toBeVisible();
    await expect(page.getByLabel("Customer name")).toHaveValue("Retry Flow Customer");
    await expect(page.getByLabel("Customer phone")).toHaveValue("0771230000");

    await fillManualBookingForm(page, {
      packageLabel: "AC Small",
      dateISO,
      time: "15:00",
      people: "2",
      name: "Retry Flow Customer",
      phone: "0771230000",
    });

    await expect(page.getByRole("button", { name: "Review booking" })).toBeEnabled();
    await page.getByRole("button", { name: "Review booking" }).click();
    await expect(page.getByRole("heading", { name: "Review booking" })).toBeVisible();
    await expect(page.getByText("Retry Flow Customer")).toBeVisible();

    expect(getPackagesCallCount).toBeGreaterThanOrEqual(2);
  });
});

test.describe("staff manual booking — conflict/race @emulator", () => {
  test.use({ viewport: DESKTOP_VIEWPORT });

  test("a competing request takes the last matching room between review and confirm — staff sees a conflict, keeps their details, and retries successfully on another slot", async ({
    page,
    request,
  }) => {
    // ac-small has exactly one physical room (room-4) — any competing
    // request for this date/time genuinely takes "the last matching room."
    const dateISO = futureBusinessDate(22);

    await signInStaff(page);
    // Proves the built app (VITE_FIREBASE_* baked in at `vite build` time)
    // and this test process's direct HTTP call (TEST_* read from
    // process.env at run time) are pointed at the SAME isolated instance —
    // not just two independently-valid-looking configs that happened to
    // drift apart (the actual incident this guards against, see
    // isolatedEmulatorConfig.ts). Waits on the page's own real
    // getPackages call, triggered by the click below.
    await Promise.all([assertPageTargetsIsolatedFunctions(page), page.getByRole("link", { name: "New manual booking" }).click()]);
    await expect(page.getByRole("heading", { name: "New Manual Booking" })).toBeVisible();

    await fillManualBookingForm(page, {
      packageLabel: "AC Small",
      dateISO,
      time: "09:00",
      people: "2",
      name: "Race Condition Test",
      phone: "0771112222",
    });

    await page.getByRole("button", { name: "Review booking" }).click();
    await expect(page.getByRole("heading", { name: "Review booking" })).toBeVisible();
    await expect(page.getByText("Race Condition Test")).toBeVisible();

    // While the staff member sits on the review step (form already
    // submitted for review, not yet confirmed), a competing request takes
    // the same room/date/time — a real guest hold, created directly via the
    // callable HTTP endpoint so it genuinely races ahead of the UI, not a
    // mocked/simulated response.
    const competing = await request.post(callableUrl("createHold"), {
      data: {
        data: {
          packageId: "ac-small",
          dateISO,
          time: "09:00",
          peopleCount: 2,
          name: "Competing Guest",
          phone: "0779998888",
          email: `race-${Date.now()}@example.com`,
          idempotencyKey: `race-competing-${Date.now()}`,
        },
      },
    });
    expect(competing.ok(), "the competing request must itself succeed for this to be a real race").toBeTruthy();

    // The staff member's original submission now hits a real conflict —
    // this is not simulated, it's the actual server rejecting the actual
    // second request for the actual now-occupied room.
    await page.getByRole("button", { name: "Confirm booking" }).click();
    await expect(
      page.getByText(
        "That room is no longer available for this date and time — pick another slot. Your details have been kept.",
      ),
    ).toBeVisible();

    // No false success anywhere on the page.
    await expect(page.getByRole("status").getByText("Booking confirmed")).toHaveCount(0);
    await expect(page.getByText(/APX-/)).toHaveCount(0);

    // Customer details are still shown right there on the review screen —
    // nothing was cleared by the failed submission.
    await expect(page.getByText("Race Condition Test")).toBeVisible();

    // Going back to the form preserves everything already entered too.
    await page.getByRole("button", { name: "Edit details" }).click();
    await expect(page.getByLabel("Customer name")).toHaveValue("Race Condition Test");
    await expect(page.getByLabel("Customer phone")).toHaveValue("0771112222");

    // Pick a different, uncontended time on the same room/package and retry
    // — this must succeed for real, ending on the actual success screen.
    await page.getByRole("button", { name: /^12:00/ }).click();
    await page.getByRole("button", { name: "Review booking" }).click();
    await page.getByRole("button", { name: "Confirm booking" }).click();

    await expect(page.getByRole("status").getByText("Booking confirmed")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/APX-/)).toBeVisible();
    await expect(page.getByText("Room 4")).toBeVisible();
  });
});
