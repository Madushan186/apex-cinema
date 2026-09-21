import { EXTENSION_FEE_LKR } from "@apex-cinema/booking-core";
import { useId, useState } from "react";
import { formatTimeOfDay, roomNumber } from "@/components/staff/scheduleFormat";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/notice";
import type { ExtendManualBookingErrorReason, ScheduleBooking } from "@/data/firebase/staffApi";
import { ExtendManualBookingError, extendManualBooking } from "@/data/firebase/staffApi";
import { useI18n } from "@/i18n/LocaleProvider";
import type { TranslateFn } from "@/lib/manualBookingValidation";
import { formatDateLabel } from "@/lib/colomboTime";

function mapExtendErrorMessage(reason: ExtendManualBookingErrorReason, t: TranslateFn): string {
  switch (reason) {
    case "not-found":
      return t("staff.extendBooking.errorNotFound");
    case "ineligible":
      return t("staff.extendBooking.errorIneligible");
    case "invalid-request":
      return t("staff.extendBooking.errorInvalid");
    case "stale-state":
      return t("staff.extendBooking.errorStale");
    case "idempotency-conflict":
      return t("staff.extendBooking.errorStale");
    default:
      return t("staff.extendBooking.errorUnknown");
  }
}

/**
 * Confirmation dialog for approving a +1 hour extension — shown from an
 * eligible row on the staff schedule (docs/PROGRESS.md "manual-booking
 * extensions" phase). The server re-checks every eligibility rule this
 * dialog's launch point already cosmetically checked (docs/SECURITY.md
 * §3), including that the booking hasn't changed since this dialog opened
 * (`expectedCurrentEndMinute`) — a rejection here is shown as a normal
 * error state, not a bug.
 */
export function ExtendBookingDialog({
  booking,
  scheduleDateISO,
  onClose,
  onExtended,
  onStaleConflict,
}: {
  booking: ScheduleBooking;
  scheduleDateISO: string;
  onClose: () => void;
  /** Extension succeeded — the caller should close this dialog and refresh the schedule. */
  onExtended: () => void;
  /**
   * The server reported the booking has changed since this dialog opened
   * (docs/PROGRESS.md "refresh booking data after... a stale-state
   * conflict"). The schedule behind this dialog is refreshed immediately
   * (silently — the dialog itself stays open, still showing the error
   * message below, so the reason for the refresh is visible) rather than
   * waiting for the dialog to close.
   */
  onStaleConflict: () => void;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();

  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentEnd = booking.endMinute;
  const newEnd = currentEnd + 60;
  const originalPriceLKR = (booking.totalAmountMinor ?? 0) / 100;
  const priorExtensionChargesLKR = booking.extensionChargesMinor / 100;
  const newTotalLKR = originalPriceLKR + priorExtensionChargesLKR + EXTENSION_FEE_LKR;

  function requestClose() {
    if (submitting) return; // Never close out from under an in-flight request.
    onClose();
  }

  async function handleConfirm() {
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await extendManualBooking({
        bookingId: booking.bookingId,
        expectedCurrentEndMinute: currentEnd,
        idempotencyKey: crypto.randomUUID(),
      });
      onExtended();
    } catch (error) {
      const reasonCode = error instanceof ExtendManualBookingError ? error.reason : "unknown";
      setErrorMessage(mapExtendErrorMessage(reasonCode, t));
      if (reasonCode === "stale-state" || reasonCode === "idempotency-conflict") {
        onStaleConflict();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }} titleId={titleId}>
      <div className="flex flex-col gap-5 p-6">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {t("staff.extendBooking.dialogTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("staff.extendBooking.dialogBody")}</p>
        </div>

        <dl className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-elevated text-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("staff.cancelBooking.detailsLabel")}</dt>
            <dd className="text-right font-medium text-foreground">
              {t(`packages.tiers.${booking.packageId}.name`)} · {t("staff.roomLabel", { number: roomNumber(booking.roomId) })}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("booking.review.dateLabel")}</dt>
            <dd className="font-medium text-foreground">{formatDateLabel(scheduleDateISO, locale)}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("staff.extendBooking.currentEndLabel")}</dt>
            <dd className="font-medium text-foreground">
              {formatTimeOfDay(booking.startMinute)}–{formatTimeOfDay(currentEnd)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("staff.extendBooking.newEndLabel")}</dt>
            <dd className="font-semibold text-foreground">
              {formatTimeOfDay(booking.startMinute)}–{formatTimeOfDay(newEnd)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("staff.extendBooking.chargeLabel")}</dt>
            <dd className="font-medium text-foreground">
              {t("packages.priceLabel", { price: EXTENSION_FEE_LKR.toLocaleString("en-LK") })}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="font-semibold text-foreground">{t("staff.extendBooking.newTotalLabel")}</dt>
            <dd className="text-lg font-semibold text-foreground">
              {t("packages.priceLabel", { price: newTotalLKR.toLocaleString("en-LK") })}
            </dd>
          </div>
        </dl>

        <Notice variant="warning">{t("staff.extendBooking.unpaidNotice")}</Notice>

        {errorMessage ? <Notice variant="error">{errorMessage}</Notice> : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={submitting}>
            {t("staff.extendBooking.cancelButton")}
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? t("staff.extendBooking.extending") : t("staff.extendBooking.confirmButton")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
