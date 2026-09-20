import { AlertCircle, Check, Clock, Minus } from "lucide-react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Notice } from "@/components/ui/notice";
import { availabilityAdapter } from "@/data";
import type { BookablePackageId, PackageDefinition, SlotStatus, SlotTime } from "@/data/types";
import { SLOT_TIMES } from "@/data/types";
import type { ManualBookingSource } from "@/data/firebase/staffApi";
import { usePromise } from "@/hooks/usePromise";
import { useI18n } from "@/i18n/LocaleProvider";
import { addDaysToColomboToday, formatDateLabel, getColomboTodayISO } from "@/lib/colomboTime";
import type { ManualBookingFormErrors, ManualBookingFormInput } from "@/lib/manualBookingValidation";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<SlotStatus, string> = {
  available: "border-status-positive/50 hover:border-status-positive",
  limited: "border-status-warning/50 hover:border-status-warning",
  full: "border-border-subtle opacity-50 cursor-not-allowed",
  past: "border-border-subtle opacity-40 cursor-not-allowed",
};

export function ManualBookingForm({
  packages,
  packagesLoading,
  packagesError,
  onRetryPackages,
  value,
  errors,
  onChange,
  onSubmit,
}: {
  /** Fetched once by the parent route and shared with the review step — see docs/PROGRESS.md "one packages fetch, not two" (a duplicate fetch here previously raced the parent's, occasionally leaving the review step with the wrong maxPeople on a fast/scripted submit). */
  packages: readonly PackageDefinition[];
  packagesLoading: boolean;
  packagesError: Error | undefined;
  onRetryPackages: () => void;
  value: ManualBookingFormInput;
  errors: ManualBookingFormErrors;
  onChange: (next: ManualBookingFormInput) => void;
  onSubmit: () => void;
}) {
  const { t, locale } = useI18n();
  const today = getColomboTodayISO();
  const tomorrow = addDaysToColomboToday(1);
  const maxDate = addDaysToColomboToday(30);

  const bookable = packages.filter(
    (pkg): pkg is PackageDefinition & { id: BookablePackageId } => pkg.isBookableOnline,
  );
  const selectedPackage = bookable.find((pkg) => pkg.id === value.packageId) ?? null;
  const packagesUnavailable = packagesLoading || Boolean(packagesError) || bookable.length === 0;

  const { data: availability, loading: availabilityLoading } = usePromise(
    () =>
      value.packageId && value.dateISO
        ? availabilityAdapter.getAvailability({ packageId: value.packageId, dateISO: value.dateISO })
        : Promise.resolve(null),
    [value.packageId, value.dateISO],
  );

  function update(patch: Partial<ManualBookingFormInput>) {
    onChange({ ...value, ...patch });
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit} noValidate>
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("staff.manualBooking.packageLabel")}</p>
        {packagesLoading ? (
          <Notice variant="info">{t("staff.manualBooking.packagesLoading")}</Notice>
        ) : packagesError ? (
          <Notice variant="error">
            <div className="flex flex-col items-start gap-2">
              <p>{t("staff.manualBooking.packagesErrorBody")}</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetryPackages}>
                {t("common.retry")}
              </Button>
            </div>
          </Notice>
        ) : bookable.length === 0 ? (
          <Notice variant="warning">
            <div className="flex flex-col items-start gap-2">
              <p>{t("staff.manualBooking.packagesEmptyBody")}</p>
              <Button type="button" variant="outline" size="sm" onClick={onRetryPackages}>
                {t("common.retry")}
              </Button>
            </div>
          </Notice>
        ) : (
          <fieldset className="grid gap-3 sm:grid-cols-3">
            <legend className="sr-only">{t("staff.manualBooking.packageLabel")}</legend>
            {bookable.map((pkg) => {
              const checked = value.packageId === pkg.id;
              return (
                <label
                  key={pkg.id}
                  className={cn(
                    "relative flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors",
                    checked ? "border-primary bg-primary/5" : "border-border bg-card hover:border-border-subtle",
                  )}
                >
                  <input
                    type="radio"
                    name="manual-booking-package"
                    value={pkg.id}
                    checked={checked}
                    onChange={() => update({ packageId: pkg.id, time: null })}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">{t(`packages.tiers.${pkg.id}.name`)}</span>
                    {checked ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
                  </div>
                  <p className="text-sm font-medium text-foreground">
                    {t("packages.priceLabel", { price: pkg.priceLKR.toLocaleString("en-LK") })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("packages.capacityLabel", { count: pkg.maxPeople })}
                  </p>
                </label>
              );
            })}
          </fieldset>
        )}
        {errors.packageId ? <p className="mt-1.5 text-xs text-status-negative">{errors.packageId}</p> : null}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("staff.manualBooking.dateLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {[today, tomorrow].map((d, index) => (
            <button
              key={d}
              type="button"
              onClick={() => update({ dateISO: d, time: null })}
              aria-pressed={value.dateISO === d}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                value.dateISO === d
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border-subtle text-muted-foreground hover:text-foreground",
              )}
            >
              {index === 0 ? t("staff.manualBooking.quickPickToday") : t("staff.manualBooking.quickPickTomorrow")}
            </button>
          ))}
        </div>
        <label className="mt-3 flex flex-col gap-1.5 sm:w-64">
          <span className="text-xs text-muted-foreground">{t("staff.manualBooking.orChooseDate")}</span>
          <input
            type="date"
            value={value.dateISO}
            min={today}
            max={maxDate}
            onChange={(event) => {
              if (event.target.value) update({ dateISO: event.target.value, time: null });
            }}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
        {value.dateISO ? (
          <p className="mt-1.5 text-xs text-muted-foreground">{formatDateLabel(value.dateISO, locale, "long")}</p>
        ) : null}
        {errors.dateISO ? <p className="mt-1.5 text-xs text-status-negative">{errors.dateISO}</p> : null}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("staff.manualBooking.timeLabel")}</p>
        {!value.packageId || !value.dateISO ? (
          <p className="text-muted-foreground text-sm">{t("staff.manualBooking.choosePackageAndDateFirst")}</p>
        ) : availabilityLoading || !availability ? (
          <Notice variant="info">{t("staff.manualBooking.loadingAvailability")}</Notice>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SLOT_TIMES.map((time) => {
              const slot = availability.slots.find((s) => s.time === time);
              const status: SlotStatus = slot?.status ?? "full";
              const disabled = status === "full" || status === "past";
              const selected = value.time === time;
              return (
                <button
                  key={time}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => update({ time: time as SlotTime })}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors",
                    STATUS_STYLE[status],
                    selected && !disabled && "border-primary bg-primary/10",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Clock aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    {time}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {status === "available" ? <Check aria-hidden="true" className="size-3 text-status-positive" /> : null}
                    {status === "limited" ? <AlertCircle aria-hidden="true" className="size-3 text-status-warning" /> : null}
                    {status === "full" || status === "past" ? <Minus aria-hidden="true" className="size-3 text-muted-foreground" /> : null}
                    {t(
                      `booking.datetime.slot${status === "available" ? "Available" : status === "limited" ? "Limited" : status === "full" ? "Full" : "Past"}`,
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        {errors.time ? <p className="mt-1.5 text-xs text-status-negative">{errors.time}</p> : null}
      </div>

      <Field label={t("staff.manualBooking.peopleLabel")} required error={errors.peopleCount}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            type="number"
            inputMode="numeric"
            min={1}
            max={selectedPackage?.maxPeople ?? undefined}
            value={value.peopleCount ?? ""}
            onChange={(event) => update({ peopleCount: event.target.value ? Number(event.target.value) : null })}
          />
        )}
      </Field>

      <Field label={t("staff.manualBooking.nameLabel")} required error={errors.name}>
        {(fieldProps) => (
          <Input {...fieldProps} value={value.name} autoComplete="name" onChange={(event) => update({ name: event.target.value })} />
        )}
      </Field>

      <Field label={t("staff.manualBooking.phoneLabel")} required error={errors.phone}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            type="tel"
            value={value.phone}
            autoComplete="tel"
            onChange={(event) => update({ phone: event.target.value })}
          />
        )}
      </Field>

      <Field label={t("staff.manualBooking.emailLabel")} error={errors.email}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            type="email"
            value={value.email}
            autoComplete="email"
            onChange={(event) => update({ email: event.target.value })}
          />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <Label>{t("staff.manualBooking.sourceLabel")}</Label>
        <div className="flex gap-4">
          {(["staff_walkin", "staff_phone"] as ManualBookingSource[]).map((source) => (
            <label key={source} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="manual-booking-source"
                checked={value.source === source}
                onChange={() => update({ source })}
              />
              {source === "staff_walkin" ? t("staff.manualBooking.sourceWalkIn") : t("staff.manualBooking.sourcePhone")}
            </label>
          ))}
        </div>
      </div>

      <Field label={t("staff.manualBooking.noteLabel")}>
        {(fieldProps) => (
          <Input
            {...fieldProps}
            value={value.staffNote}
            placeholder={t("staff.manualBooking.notePlaceholder")}
            onChange={(event) => update({ staffNote: event.target.value })}
          />
        )}
      </Field>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={packagesUnavailable}>
          {t("staff.manualBooking.reviewButton")}
        </Button>
      </div>
    </form>
  );
}
