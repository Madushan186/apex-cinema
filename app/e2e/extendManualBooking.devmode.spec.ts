import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { futureBusinessDate } from "./testDates";

/**
 * Regression test for the "blank screen on Extend" bug (docs/PROGRESS.md) —
 * run via `playwright.dev.config.ts` against the REAL `vite dev` server,
 * never `vite preview`. See that config's own doc comment for why: every
 * other Playwright spec in this repo runs against a production build,
 * which cannot exercise `vite dev`'s dependency-optimizer pipeline at all
 * — the exact pipeline whose staleness caused the real incident this test
 * guards against (a long-running dev server's cached, pre-bundled copy of
 * `@apex-cinema/booking-core` didn't have this phase's new
 * `EXTENSION_FEE_LKR`/`EXTENSION_MINUTES` exports, so `ExtendBookingDialog`
 * crashed with `Cannot read properties of undefined (reading
 * 'toLocaleString')`, which — with no error boundary anywhere in the
 * app — unmounted the entire page to a blank screen).
 *
 * This test starts a genuinely fresh `vite dev` server every run (see
 * `reuseExistingServer: false` in the dev config), so it cannot force the
 * exact staleness timing that caused the real incident (a fresh server
 * always optimizes against current source). Its value is coverage that
 * did not exist at all before: proving the actual dev-mode
 * transform/module-resolution pipeline — not just the production build —
 * renders this dialog without throwing, and would catch a
 * broader class of dev-mode-only regressions (e.g. `optimizeDeps.include`
 * being removed, or another dependency losing named-export interop).
 */

const STAFF = { email: "staff@apexcinema.test", password: "LocalStaff!123" };

async function signInStaff(page: Page): Promise<void> {
  await page.goto("/staff/login");
  await page.getByLabel(/email/i).fill(STAFF.email);
  await page.getByLabel(/password/i).fill(STAFF.password);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
}

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
  await page.getByRole("button", { name: "Confirm booking" }).click();
  await expect(page.getByRole("status").getByText("Booking confirmed")).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: /Back to schedule/ }).click();
  await expect(page.getByRole("heading", { name: "Today's Schedule" })).toBeVisible();
}

test.describe("staff manual-booking extension — real vite dev server @devmode @emulator", () => {
  test("opening and confirming the extend dialog against a genuinely fresh vite dev server does not crash the app", async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    const dateISO = futureBusinessDate(270);
    await signInStaff(page);
    await createManualBookingViaUI(page, {
      packageLabel: "AC Small",
      dateISO,
      time: "12:00",
      name: "Dev Mode Extend Customer",
      phone: "0771270001",
    });

    await page.getByRole("button", { name: "Extend +1 hour" }).first().click();

    // The actual regression: this heading must render, not a blank page.
    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).toBeVisible();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("12:00–15:00")).toBeVisible(); // current end
    await expect(dialog.getByText("12:00–16:00")).toBeVisible(); // new end
    await expect(dialog.getByText("LKR 1,000")).toBeVisible(); // additional charge
    // AC Small is LKR 3,200 — new total after one extension is LKR 4,200.
    await expect(dialog.getByText("LKR 4,200")).toBeVisible();
    await expect(page.getByText("Payment not recorded", { exact: false })).toBeVisible();

    // Zero JS exceptions reached the console/page at any point so far —
    // this is what actually distinguishes "fixed" from "still broken" here,
    // not just that some text happens to be on screen.
    expect(pageErrors, `Unexpected page errors: ${pageErrors.join("; ")}`).toHaveLength(0);
    expect(
      consoleErrors.filter((m) => !m.includes("Download the React DevTools")),
      `Unexpected console errors: ${consoleErrors.join("; ")}`,
    ).toHaveLength(0);

    // Confirm succeeds too — synthetic data, isolated emulator, safe to
    // actually apply (unlike a real developer's live preview booking).
    await page.getByRole("button", { name: "Confirm extension" }).click();
    await expect(page.getByRole("heading", { name: "Extend this booking by 1 hour?" })).not.toBeVisible();
    await expect(page.getByText("12:00–16:00", { exact: false })).toBeVisible();
    await expect(page.getByText("Unpaid", { exact: true })).toBeVisible();

    expect(pageErrors, `Unexpected page errors after confirming: ${pageErrors.join("; ")}`).toHaveLength(0);
  });
});
