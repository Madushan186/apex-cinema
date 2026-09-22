import { AlertCircle, Check, Clock, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { availabilityAdapter } from "@/data";
import type { BookablePackageId, SlotStatus, SlotTime } from "@/data/types";
import { usePromise } from "@/hooks/usePromise";
import { useI18n } from "@/i18n/LocaleProvider";
import { addDaysToColomboToday, BOOKING_WINDOW_DAYS, formatDateLabel, getColomboTodayISO } from "@/lib/colomboTime";
import { cn } from "@/lib/utils";

const STATUS_STYLE: Record<SlotStatus, string> = {
  available: "border-status-positive/50 hover:border-status-positive",
  limited: "border-status-warning/50 hover:border-status-warning",
  full: "border-border-subtle opacity-50 cursor-not-allowed",
  past: "border-border-subtle opacity-40 cursor-not-allowed",
};

export function DateTimeStep({
  packageId,
  dateISO,
  time,
  onChangeDate,
  onChangeTime,
  onBack,
  onContinue,
  simulateError,
}: {
  packageId: BookablePackageId;
  dateISO: string;
  time: SlotTime | null;
  onChangeDate: (dateISO: string) => void;
  onChangeTime: (time: SlotTime) => void;
  onBack: () => void;
  onContinue: () => void;
  simulateError: boolean;
}) {
  const { t, locale } = useI18n();
  const today = getColomboTodayISO();
  const maxDate = addDaysToColomboToday(BOOKING_WINDOW_DAYS);
  const quickDates = [0, 1, 2, 3, 4].map((n) => addDaysToColomboToday(n));

  const { data, loading, error } = usePromise(
    () => availabilityAdapter.getAvailability({ packageId, dateISO, simulateError }),
    [packageId, dateISO, simulateError],
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{t("booking.datetime.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("booking.datetime.timezoneNote")}</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("booking.datetime.dateLabel")}</p>
        <div className="flex flex-wrap gap-2">
          {quickDates.map((d, index) => (
            <button
              key={d}
              type="button"
              onClick={() => onChangeDate(d)}
              aria-pressed={dateISO === d}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-150",
                dateISO === d ? "border-primary bg-primary/10 text-foreground" : "border-border-subtle text-muted-foreground hover:text-foreground",
              )}
            >
              {index === 0 ? t("booking.datetime.quickPickToday") : index === 1 ? t("booking.datetime.quickPickTomorrow") : formatDateLabel(d, locale, "short")}
            </button>
          ))}
        </div>
        <label className="mt-3 flex flex-col gap-1.5 sm:w-64">
          <span className="text-xs text-muted-foreground">{t("booking.datetime.orChooseDate")}</span>
          <input
            type="date"
            value={dateISO}
            min={today}
            max={maxDate}
            onChange={(event) => {
              if (event.target.value) onChangeDate(event.target.value);
            }}
            className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-foreground">{t("booking.datetime.timeLabel")}</p>

        {loading ? <Notice variant="info">{t("booking.datetime.loadingAvailability")}</Notice> : null}

        {error ? (
          <Notice variant="error">
            <p className="font-medium">{t("booking.datetime.errorTitle")}</p>
            <p>{t("booking.datetime.errorBody")}</p>
          </Notice>
        ) : null}

        {data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data.slots.map((slot) => {
              const disabled = slot.status === "full" || slot.status === "past";
              const selected = time === slot.time;
              return (
                <button
                  key={slot.time}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => onChangeTime(slot.time)}
                  className={cn(
                    "flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-colors duration-150",
                    STATUS_STYLE[slot.status],
                    selected && !disabled && "border-primary bg-primary/10",
                  )}
                >
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Clock aria-hidden="true" className="size-3.5 text-muted-foreground" />
                    {slot.time}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {slot.status === "available" ? <Check aria-hidden="true" className="size-3 text-status-positive" /> : null}
                    {slot.status === "limited" ? <AlertCircle aria-hidden="true" className="size-3 text-status-warning" /> : null}
                    {(slot.status === "full" || slot.status === "past") ? (
                      <Minus aria-hidden="true" className="size-3 text-muted-foreground" />
                    ) : null}
                    {t(`booking.datetime.slot${slot.status === "available" ? "Available" : slot.status === "limited" ? "Limited" : slot.status === "full" ? "Full" : "Past"}`)}
                  </span>
                  {slot.status !== "past" ? (
                    <span className="text-[11px] text-muted-foreground">
                      {t("booking.datetime.roomsFree", { free: slot.roomsFree, total: slot.roomsTotal })}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button size="lg" disabled={!time || loading || Boolean(error)} onClick={onContinue}>
          {t("common.continue")}
        </Button>
      </div>
    </div>
  );
}
