import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { PackageDefinition, SlotTime } from "@/data/types";
import type { DetailsInput } from "@/lib/bookingValidation";
import { useI18n } from "@/i18n/LocaleProvider";
import { formatDateLabel, slotTimeToMinutes } from "@/lib/colomboTime";

function formatEndTime(start: SlotTime, sessionMinutes: number): string {
  const endMinutes = slotTimeToMinutes(start) + sessionMinutes;
  const hh = String(Math.floor(endMinutes / 60) % 24).padStart(2, "0");
  const mm = String(endMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function ReviewStep({
  pkg,
  dateISO,
  time,
  details,
  onBack,
  onEditDetails,
  onProceed,
}: {
  pkg: PackageDefinition;
  dateISO: string;
  time: SlotTime;
  details: DetailsInput;
  onBack: () => void;
  onEditDetails: () => void;
  onProceed: () => void;
}) {
  const { t, locale } = useI18n();
  const sessionMinutes = pkg.sessionMinutes ?? 180;
  const endTime = formatEndTime(time, sessionMinutes);

  const rows: [string, string][] = [
    [t("booking.review.packageLabel"), t(`packages.tiers.${pkg.id}.name`)],
    [t("booking.review.dateLabel"), formatDateLabel(dateISO, locale)],
    [t("booking.review.timeLabel"), `${time} – ${endTime} (${t("common.sriLankaTime")})`],
    [t("booking.review.peopleLabel"), `${details.peopleCount} ${t("common.people")}`],
  ];

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold text-foreground">{t("booking.review.title")}</h2>

      <dl className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-card">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="text-sm font-medium text-foreground">{value}</dd>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <dt className="font-semibold text-foreground">{t("booking.review.totalLabel")}</dt>
          <dd className="text-lg font-semibold text-foreground">
            {t("packages.priceLabel", { price: pkg.priceLKR.toLocaleString("en-LK") })}
          </dd>
        </div>
      </dl>

      <Notice variant="info">{t("booking.review.paymentNote")}</Notice>
      <Notice variant="demo">{t("booking.review.extensionNote")}</Notice>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onBack}>
            {t("common.back")}
          </Button>
          <Button variant="ghost" onClick={onEditDetails}>
            {t("booking.review.editDetails")}
          </Button>
        </div>
        <Button size="lg" onClick={onProceed}>
          {t("booking.review.proceedToCheckout")}
        </Button>
      </div>
    </div>
  );
}
