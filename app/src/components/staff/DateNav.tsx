import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addDaysToDateISO } from "@/components/staff/scheduleFormat";
import { formatDateLabel, getColomboTodayISO, isColomboToday } from "@/lib/colomboTime";
import { useI18n } from "@/i18n/LocaleProvider";

export function DateNav({ dateISO, onChange }: { dateISO: string; onChange: (next: string) => void }) {
  const { t, locale } = useI18n();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        aria-label={t("staff.previousDay")}
        onClick={() => onChange(addDaysToDateISO(dateISO, -1))}
      >
        <ChevronLeft aria-hidden="true" className="size-4" />
      </Button>
      <div className="min-w-[13rem] text-center text-sm font-medium text-foreground">
        {formatDateLabel(dateISO, locale, "long")}
      </div>
      <Button
        variant="outline"
        size="icon"
        aria-label={t("staff.nextDay")}
        onClick={() => onChange(addDaysToDateISO(dateISO, 1))}
      >
        <ChevronRight aria-hidden="true" className="size-4" />
      </Button>
      {!isColomboToday(dateISO) ? (
        <Button variant="ghost" size="sm" onClick={() => onChange(getColomboTodayISO())}>
          {t("staff.jumpToToday")}
        </Button>
      ) : null}
    </div>
  );
}
