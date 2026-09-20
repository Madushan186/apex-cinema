/**
 * Pure validation logic for the staff manual-booking form — client-side
 * usability only, not a security boundary (see docs/ARCHITECTURE.md §2).
 * The real validation is functions/src/lib/validation.ts's
 * validateManualBookingRequest, re-checked server-side on every submit.
 */
import type { BookablePackageId, SlotTime } from "@apex-cinema/booking-core";
import type { ManualBookingSource } from "@/data/firebase/staffApi";
import type { TranslationPath } from "@/i18n/paths";
import type { TranslationDictionary } from "@/i18n/translations";
import { getColomboMinuteOfDay, getColomboTodayISO, slotTimeToMinutes } from "@/lib/colomboTime";

export interface ManualBookingFormInput {
  packageId: BookablePackageId | null;
  dateISO: string;
  time: SlotTime | null;
  peopleCount: number | null;
  name: string;
  phone: string;
  email: string;
  source: ManualBookingSource;
  staffNote: string;
}

export interface ManualBookingFormErrors {
  packageId?: string;
  dateISO?: string;
  time?: string;
  peopleCount?: string;
  name?: string;
  phone?: string;
  email?: string;
}

const SL_PHONE_PATTERN = /^(?:\+94|0)\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(input: string): string {
  return input.replace(/[\s-]/g, "");
}

export type TranslateFn = (
  key: TranslationPath<TranslationDictionary>,
  vars?: Record<string, string | number>,
) => string;

export function validateManualBookingForm(
  input: ManualBookingFormInput,
  maxPeople: number,
  t: TranslateFn,
): ManualBookingFormErrors {
  const errors: ManualBookingFormErrors = {};

  if (!input.packageId) {
    errors.packageId = t("staff.manualBooking.validation.packageRequired");
  }

  if (!input.dateISO) {
    errors.dateISO = t("staff.manualBooking.validation.dateRequired");
  } else if (input.dateISO < getColomboTodayISO()) {
    errors.dateISO = t("staff.manualBooking.validation.dateInPast");
  }

  if (!input.time) {
    errors.time = t("staff.manualBooking.validation.timeRequired");
  } else if (input.dateISO === getColomboTodayISO() && slotTimeToMinutes(input.time) <= getColomboMinuteOfDay()) {
    errors.time = t("staff.manualBooking.validation.timePassed");
  }

  if (input.peopleCount === null) {
    errors.peopleCount = t("staff.manualBooking.validation.peopleRequired");
  } else if (input.peopleCount < 1) {
    errors.peopleCount = t("staff.manualBooking.validation.peopleMin");
  } else if (input.peopleCount > maxPeople) {
    errors.peopleCount = t("staff.manualBooking.validation.peopleMax", { max: maxPeople });
  }

  if (!input.name.trim()) {
    errors.name = t("staff.manualBooking.validation.nameRequired");
  }

  const phone = normalizePhone(input.phone);
  if (!phone) {
    errors.phone = t("staff.manualBooking.validation.phoneRequired");
  } else if (!SL_PHONE_PATTERN.test(phone)) {
    errors.phone = t("staff.manualBooking.validation.phoneInvalid");
  }

  if (input.email.trim() && !EMAIL_PATTERN.test(input.email.trim())) {
    errors.email = t("staff.manualBooking.validation.emailInvalid");
  }

  return errors;
}

export function hasErrors(errors: ManualBookingFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}
