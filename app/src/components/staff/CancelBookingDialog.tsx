import { useId, useRef, useState } from "react";
import { formatTimeOfDay, roomNumber } from "@/components/staff/scheduleFormat";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import type { CancelManualBookingErrorReason, ScheduleBooking } from "@/data/firebase/staffApi";
import { CancelManualBookingError, cancelManualBooking } from "@/data/firebase/staffApi";
import { useI18n } from "@/i18n/LocaleProvider";
import type { TranslateFn } from "@/lib/manualBookingValidation";
import { formatDateLabel } from "@/lib/colomboTime";

const MAX_REASON_LENGTH = 500;

function mapCancelErrorMessage(reason: CancelManualBookingErrorReason, t: TranslateFn): string {
  switch (reason) {
    case "not-found":
      return t("staff.cancelBooking.errorNotFound");
    case "ineligible":
      return t("staff.cancelBooking.errorIneligible");
    case "invalid-request":
      return t("staff.cancelBooking.errorInvalid");
    default:
      return t("staff.cancelBooking.errorUnknown");
  }
}

/**
 * Confirmation dialog for cancelling a manual booking — shown from an
 * eligible row on the staff schedule (docs/PROGRESS.md "manual-booking
 * cancellation" phase). The server re-checks every eligibility rule this
 * dialog's launch point already cosmetically checked (docs/SECURITY.md
 * §3) — a rejection here is shown as a normal error state, not a bug.
 */
export function CancelBookingDialog({
  booking,
  scheduleDateISO,
  onClose,
  onCancelled,
}: {
  booking: ScheduleBooking;
  scheduleDateISO: string;
  onClose: () => void;
  onCancelled: () => void;
}) {
  const { t, locale } = useI18n();
  const titleId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const trimmedReason = reason.trim();
  const reasonError = touched && !trimmedReason ? t("staff.cancelBooking.reasonRequired") : undefined;

  function requestClose() {
    if (submitting) return; // Never close out from under an in-flight request.
    onClose();
  }

  async function handleConfirm() {
    setTouched(true);
    if (!trimmedReason) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await cancelManualBooking({ bookingId: booking.bookingId, reason: trimmedReason });
      onCancelled();
    } catch (error) {
      const reasonCode = error instanceof CancelManualBookingError ? error.reason : "unknown";
      setErrorMessage(mapCancelErrorMessage(reasonCode, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }} titleId={titleId} initialFocusRef={textareaRef}>
      <div className="flex flex-col gap-5 p-6">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {t("staff.cancelBooking.dialogTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("staff.cancelBooking.dialogBody")}</p>
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
            <dt className="text-muted-foreground">{t("booking.review.timeLabel")}</dt>
            <dd className="font-medium text-foreground">
              {formatTimeOfDay(booking.startMinute)}–{formatTimeOfDay(booking.endMinute)}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("staff.manualBooking.customerLabel")}</dt>
            <dd className="font-medium text-foreground">
              {booking.customerName} · {booking.customerPhone}
            </dd>
          </div>
        </dl>

        <Field label={t("staff.cancelBooking.reasonLabel")} required error={reasonError}>
          {(fieldProps) => (
            <Textarea
              {...fieldProps}
              ref={textareaRef}
              value={reason}
              maxLength={MAX_REASON_LENGTH}
              placeholder={t("staff.cancelBooking.reasonPlaceholder")}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
              onBlur={() => setTouched(true)}
            />
          )}
        </Field>

        {errorMessage ? <Notice variant="error">{errorMessage}</Notice> : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={submitting}>
            {t("staff.cancelBooking.keepButton")}
          </Button>
          <Button type="button" variant="destructive" onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? t("staff.cancelBooking.cancelling") : t("staff.cancelBooking.confirmButton")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
