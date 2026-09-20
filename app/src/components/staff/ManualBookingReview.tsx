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
  onBack,
  onConfirm,
}: {
  pkg: PackageDefinition;
  value: ManualBookingFormInput;
  submitting: boolean;
  errorMessage: string | null;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { t, locale } = useI18n();
  const time = value.time as SlotTime;
  const sessionMinutes = pkg.sessionMinutes ?? 180;
  const endTime = formatEndTime(time, sessionMinutes);

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
      </dl>

      <Notice variant="warning">{t("staff.manualBooking.unpaidNotice")}</Notice>

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
