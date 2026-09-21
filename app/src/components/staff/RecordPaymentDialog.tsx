import { useId, useRef, useState } from "react";
import { roomNumber } from "@/components/staff/scheduleFormat";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import type { RecordManualBookingPaymentErrorReason, ScheduleBooking } from "@/data/firebase/staffApi";
import { RecordManualBookingPaymentError, recordManualBookingPayment } from "@/data/firebase/staffApi";
import { useI18n } from "@/i18n/LocaleProvider";
import type { TranslateFn } from "@/lib/manualBookingValidation";

function mapRecordPaymentErrorMessage(reason: RecordManualBookingPaymentErrorReason, t: TranslateFn): string {
  switch (reason) {
    case "not-found":
      return t("staff.recordPayment.errorNotFound");
    case "ineligible":
      return t("staff.recordPayment.errorIneligible");
    case "invalid-request":
      return t("staff.recordPayment.errorInvalid");
    case "idempotency-conflict":
      return t("staff.recordPayment.errorConflict");
    default:
      return t("staff.recordPayment.errorUnknown");
  }
}

function formatLKR(minor: number): string {
  return (minor / 100).toLocaleString("en-LK");
}

/**
 * Confirmation dialog for recording a cash payment already received against
 * a manual booking — docs/DECISIONS.md D17. Shown from an eligible row on
 * the staff schedule. This does NOT collect payment; it records payment
 * already collected in person, same principle as the advance recorded at
 * booking creation. The server re-checks every eligibility rule and the
 * overpayment bound this dialog's launch point already cosmetically
 * checked (docs/SECURITY.md §3) — a rejection here is shown as a normal
 * error state, not a bug.
 */
export function RecordPaymentDialog({
  booking,
  onClose,
  onRecorded,
}: {
  booking: ScheduleBooking;
  onClose: () => void;
  /** Payment recorded successfully — the caller should close this dialog and refresh the schedule. */
  onRecorded: () => void;
}) {
  const { t } = useI18n();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  const totalMinor = (booking.totalAmountMinor ?? 0) + booking.extensionChargesMinor;
  const paidMinor = booking.amountPaidMinor;
  const balanceMinor = booking.balanceDueMinor ?? Math.max(totalMinor - paidMinor, 0);

  const [amountLKR, setAmountLKR] = useState(() => (balanceMinor / 100).toString());
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedAmount = Number(amountLKR);
  const amountMinor = Number.isFinite(parsedAmount) ? Math.round(parsedAmount * 100) : Number.NaN;

  let validationError: string | null = null;
  if (touched) {
    if (!amountLKR.trim() || Number.isNaN(amountMinor)) {
      validationError = t("staff.recordPayment.validationRequired");
    } else if (amountMinor <= 0) {
      validationError = t("staff.recordPayment.validationPositive");
    } else if (amountMinor > balanceMinor) {
      validationError = t("staff.recordPayment.validationExceedsBalance");
    }
  }

  function requestClose() {
    if (submitting) return; // Never close out from under an in-flight request.
    onClose();
  }

  async function handleConfirm() {
    setTouched(true);
    if (!amountLKR.trim() || Number.isNaN(amountMinor) || amountMinor <= 0 || amountMinor > balanceMinor) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await recordManualBookingPayment({
        bookingId: booking.bookingId,
        amountMinor,
        idempotencyKey: crypto.randomUUID(),
      });
      onRecorded();
    } catch (error) {
      const reasonCode = error instanceof RecordManualBookingPaymentError ? error.reason : "unknown";
      setErrorMessage(mapRecordPaymentErrorMessage(reasonCode, t));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) requestClose(); }} titleId={titleId} initialFocusRef={inputRef}>
      <div className="flex flex-col gap-5 p-6">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-foreground">
            {t("staff.recordPayment.dialogTitle")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("staff.recordPayment.dialogBody")}</p>
        </div>

        <dl className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-elevated text-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("staff.cancelBooking.detailsLabel")}</dt>
            <dd className="text-right font-medium text-foreground">
              {t(`packages.tiers.${booking.packageId}.name`)} · {t("staff.roomLabel", { number: roomNumber(booking.roomId) })}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("staff.recordPayment.totalLabel")}</dt>
            <dd className="font-medium text-foreground">{t("packages.priceLabel", { price: formatLKR(totalMinor) })}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="text-muted-foreground">{t("staff.recordPayment.paidLabel")}</dt>
            <dd className="font-medium text-foreground">{t("packages.priceLabel", { price: formatLKR(paidMinor) })}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-2.5">
            <dt className="font-semibold text-foreground">{t("staff.recordPayment.balanceLabel")}</dt>
            <dd className="text-lg font-semibold text-foreground">{t("packages.priceLabel", { price: formatLKR(balanceMinor) })}</dd>
          </div>
        </dl>

        <Field
          label={t("staff.recordPayment.amountLabel")}
          required
          help={t("staff.recordPayment.amountHint")}
          error={validationError ?? undefined}
        >
          {(fieldProps) => (
            <Input
              {...fieldProps}
              ref={inputRef}
              type="number"
              inputMode="decimal"
              min={0}
              max={balanceMinor / 100}
              step="1"
              value={amountLKR}
              disabled={submitting}
              onChange={(event) => setAmountLKR(event.target.value)}
              onBlur={() => setTouched(true)}
            />
          )}
        </Field>

        {errorMessage ? <Notice variant="error">{errorMessage}</Notice> : null}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button type="button" variant="ghost" onClick={requestClose} disabled={submitting}>
            {t("staff.recordPayment.cancelButton")}
          </Button>
          <Button type="button" onClick={() => void handleConfirm()} disabled={submitting}>
            {submitting ? t("staff.recordPayment.recording") : t("staff.recordPayment.confirmButton")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
