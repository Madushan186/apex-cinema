import { expect, test } from "@playwright/test";
import { findDeterministicFixtureSlot } from "./testDates";

test.describe("foundation smoke @smoke", () => {
  test("home page loads with the hero and brand logo", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Apex Cinema/);
    await expect(page.getByRole("heading", { name: /your screen\. your game\. your celebration\./i })).toBeVisible();
    await expect(page.getByRole("img", { name: "Apex Cinema" }).first()).toBeVisible();
  });

  test("client-side routing works", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Explore Packages" }).click();
    await expect(page).toHaveURL(/\/packages$/);
    await expect(page.getByRole("heading", { name: "Packages", level: 2 })).toBeVisible();
  });

  test("unknown routes render the not-found page", async ({ page }) => {
    await page.goto("/this-route-does-not-exist");
    await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();
  });
});

test.describe("customer UI @smoke", () => {
  test("language switch updates visible text without navigating", async ({ page }) => {
    await page.goto("/packages");
    await expect(page.getByRole("heading", { name: "Packages", level: 2 })).toBeVisible();
    await page.getByRole("button", { name: "සිංහල" }).click();
    await expect(page).toHaveURL(/\/packages$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "si");
    await expect(page.getByRole("heading", { name: "Packages" })).toBeVisible();
  });

  test("party package is not bookable online", async ({ page }) => {
    await page.goto("/book");
    await expect(page.getByRole("heading", { name: "Choose a package" })).toBeVisible();
    await expect(page.getByRole("radio", { name: /party/i })).toHaveCount(0);
  });

  test("full booking wizard reaches a demo confirmation", async ({ page }) => {
    // Deterministic date/slot — never "today", so this can never fail just
    // because the suite happens to run late in the business day or after
    // closing (see e2e/testDates.ts for why).
    const { dateISO, time } = findDeterministicFixtureSlot("ac-small", 1);

    await page.goto("/book?package=ac-small");

    await page.getByLabel(/ac small/i).check();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Pick a date & time" })).toBeVisible();
    await page.getByLabel("Or choose another date").fill(dateISO);
    await page.getByRole("button", { name: new RegExp(`^${time}`) }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Your details" })).toBeVisible();
    await page.getByLabel(/full name/i).fill("Nimal Perera");
    await page.getByLabel(/phone number/i).fill("0771234567");
    await page.getByLabel(/^email/i).fill("nimal@example.com");
    await page.getByLabel(/number of people/i).fill("2");
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Review your booking" })).toBeVisible();
    await page.getByRole("button", { name: "Continue to demo checkout" }).click();

    await expect(page.getByRole("heading", { name: "Demo checkout" })).toBeVisible();
    await expect(page.getByText("Demo — no real booking or payment is made in this preview.")).toBeVisible();
    await page.getByRole("button", { name: "Preview checkout" }).click();

    await expect(page.getByRole("heading", { name: "Booking confirmed" })).toBeVisible();
    await expect(page.getByText(/APX-/)).toBeVisible();
  });
});
