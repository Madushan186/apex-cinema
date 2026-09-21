import { ADVANCE_AMOUNT_LKR } from "@apex-cinema/booking-core";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { PackageDefinition, SlotTime } from "@/data/types";
import { useI18n } from "@/i18n/LocaleProvider";
import { formatDateLabel, slotTimeToMinutes } from "@/lib/colomboTime";
import type { ManualBookingFormInput } from "@/lib/manualBookingValidation";

function formatEndTime(start: SlotTime, sessionMinutes: number): string {
  const endMinutes = slotTimeToMinutes(start) + sessionMinutes;
  const hh = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
  const mm = String(endMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function ManualBookingReview({
  pkg,
  value,
  submitting,
  errorMessage,
  advanceReceived,
  advanceTouched,
  onAdvanceReceivedChange,
  onBack,
  onConfirm,
}: {
  pkg: PackageDefinition;
  value: ManualBookingFormInput;
  submitting: boolean;
  errorMessage: string | null;
  /** Docs/DECISIONS.md D17 — must be explicitly checked by staff; never preselected. */
  advanceReceived: boolean;
  /** True once the staff member has tried to confirm at least once — gates showing the "must confirm" validation message. */
  advanceTouched: boolean;
  onAdvanceReceivedChange: (checked: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { t, locale } = useI18n();
  const time = value.time as SlotTime;
  const sessionMinutes = pkg.sessionMinutes ?? 180;
  const endTime = formatEndTime(time, sessionMinutes);
  const balanceAfterAdvanceLKR = pkg.priceLKR - ADVANCE_AMOUNT_LKR;

  const rows: [string, string][] = [
    [t("booking.review.packageLabel"), t(`packages.tiers.${pkg.id}.name`)],
    [t("booking.review.dateLabel"), formatDateLabel(value.dateISO, locale)],
    [t("booking.review.timeLabel"), `${time} – ${endTime} (${t("common.sriLankaTime")})`],
    [t("booking.review.peopleLabel"), `${value.peopleCount} ${t("common.people")}`],
    [t("staff.manualBooking.customerLabel"), `${value.name} · ${value.phone}${value.email ? ` · ${value.email}` : ""}`],
    [
      t("staff.manualBooking.sourceReviewLabel"),
      value.source === "staff_walkin" ? t("staff.manualBooking.sourceWalkIn") : t("staff.manualBooking.sourcePhone"),
    ],
  ];
  if (value.staffNote.trim()) {
    rows.push([t("staff.manualBooking.noteReviewLabel"), value.staffNote.trim()]);
  }

  const advanceError = advanceTouched && !advanceReceived ? t("staff.manualBooking.advanceCheckboxError") : null;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">{t("staff.manualBooking.reviewTitle")}</h2>

      <dl className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-card">
        {rows.map(([label, val]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium text-foreground">{val}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="font-semibold text-foreground">{t("booking.review.totalLabel")}</dt>
          <dd className="text-lg font-semibold text-foreground">
            {t("packages.priceLabel", { price: pkg.priceLKR.toLocaleString("en-LK") })}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-muted-foreground">{t("staff.manualBooking.advanceAmountLabel")}</dt>
          <dd className="text-sm font-medium text-foreground">
            {t("packages.priceLabel", { price: ADVANCE_AMOUNT_LKR.toLocaleString("en-LK") })}
          </dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="text-sm text-muted-foreground">{t("staff.manualBooking.balanceAfterAdvanceLabel")}</dt>
          <dd className="text-sm font-medium text-foreground">
            {t("packages.priceLabel", { price: balanceAfterAdvanceLKR.toLocaleString("en-LK") })}
          </dd>
        </div>
      </dl>

      <Notice variant="warning">{t("staff.manualBooking.advanceRequiredNotice")}</Notice>

      <label className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-card p-3.5 text-sm">
        <input
          type="checkbox"
          checked={advanceReceived}
          disabled={submitting}
          onChange={(event) => onAdvanceReceivedChange(event.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-gold"
        />
        <span className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{t("staff.manualBooking.advanceCheckboxLabel")}</span>
          <span className="text-xs text-muted-foreground">{t("staff.manualBooking.advanceCheckboxHint")}</span>
        </span>
      </label>
      {advanceError ? <p className="text-xs text-status-negative">{advanceError}</p> : null}

      {errorMessage ? <Notice variant="error">{errorMessage}</Notice> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} disabled={submitting}>
          {t("staff.manualBooking.editButton")}
        </Button>
        <Button size="lg" onClick={onConfirm} disabled={submitting}>
          {submitting ? t("staff.manualBooking.creatingBooking") : t("staff.manualBooking.confirmButton")}
        </Button>
      </div>
    </div>
  );
}
