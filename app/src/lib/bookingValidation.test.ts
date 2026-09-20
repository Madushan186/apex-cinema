import { describe, expect, it } from "vitest";
import { hasErrors, validateDetails } from "./bookingValidation";

const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key;

describe("validateDetails", () => {
  it("passes for valid input", () => {
    const errors = validateDetails(
      { name: "Nimal Perera", phone: "0771234567", email: "nimal@example.com", peopleCount: 2 },
      3,
      t,
    );
    expect(hasErrors(errors)).toBe(false);
  });

  it("accepts a +94 prefixed phone number", () => {
    const errors = validateDetails(
      { name: "Nimal", phone: "+94771234567", email: "nimal@example.com", peopleCount: 1 },
      3,
      t,
    );
    expect(errors.phone).toBeUndefined();
  });

  it("flags a missing name", () => {
    const errors = validateDetails({ name: "  ", phone: "0771234567", email: "a@b.com", peopleCount: 1 }, 3, t);
    expect(errors.name).toBe("booking.details.validation.nameRequired");
  });

  it("flags an invalid phone number", () => {
    const errors = validateDetails({ name: "Nimal", phone: "12345", email: "a@b.com", peopleCount: 1 }, 3, t);
    expect(errors.phone).toBe("booking.details.validation.phoneInvalid");
  });

  it("flags an invalid email", () => {
    const errors = validateDetails({ name: "Nimal", phone: "0771234567", email: "not-an-email", peopleCount: 1 }, 3, t);
    expect(errors.email).toBe("booking.details.validation.emailInvalid");
  });

  it("flags people count over the package maximum", () => {
    const errors = validateDetails({ name: "Nimal", phone: "0771234567", email: "a@b.com", peopleCount: 5 }, 3, t);
    expect(errors.peopleCount).toContain("peopleMax");
  });

  it("flags a null people count as required", () => {
    const errors = validateDetails({ name: "Nimal", phone: "0771234567", email: "a@b.com", peopleCount: null }, 3, t);
    expect(errors.peopleCount).toBe("booking.details.validation.peopleRequired");
  });
});
