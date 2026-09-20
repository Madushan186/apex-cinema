/**
 * Pure validation logic — deliberately framework-free so it's trivially unit
 * tested. IMPORTANT: this is client-side usability only, not a security
 * boundary (see docs/PROGRESS.md phase brief) — the real backend re-validates
 * everything server-side once it exists (docs/ARCHITECTURE.md §2).
 */
import type { TranslationPath } from "@/i18n/paths";
import type { TranslationDictionary } from "@/i18n/translations";

export interface DetailsInput {
  name: string;
  phone: string;
  email: string;
  peopleCount: number | null;
}

export interface DetailsErrors {
  name?: string;
  phone?: string;
  email?: string;
  peopleCount?: string;
}

// Sri Lankan mobile/landline numbers: optional +94/0 prefix, then 9 digits,
// with optional spaces/dashes — deliberately permissive (usability aid only).
const SL_PHONE_PATTERN = /^(?:\+94|0)\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export type TranslateFn = (
  key: TranslationPath<TranslationDictionary>,
  vars?: Record<string, string | number>,
) => string;

export function validateDetails(input: DetailsInput, maxPeople: number, t: TranslateFn): DetailsErrors {
  const errors: DetailsErrors = {};

  if (!input.name.trim()) {
    errors.name = t("booking.details.validation.nameRequired");
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    errors.phone = t("booking.details.validation.phoneRequired");
  } else if (!SL_PHONE_PATTERN.test(phone)) {
    errors.phone = t("booking.details.validation.phoneInvalid");
  }

  if (!input.email.trim()) {
    errors.email = t("booking.details.validation.emailRequired");
  } else if (!EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = t("booking.details.validation.emailInvalid");
  }

  if (input.peopleCount === null) {
    errors.peopleCount = t("booking.details.validation.peopleRequired");
  } else if (input.peopleCount < 1) {
    errors.peopleCount = t("booking.details.validation.peopleMin");
  } else if (input.peopleCount > maxPeople) {
    errors.peopleCount = t("booking.details.validation.peopleMax", { max: maxPeople });
  }

  return errors;
}

export function hasErrors(errors: DetailsErrors): boolean {
  return Object.values(errors).some(Boolean);
}
