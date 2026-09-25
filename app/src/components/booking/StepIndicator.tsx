import { useI18n } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

// eslint-disable-next-line react-refresh/only-export-components -- small shared constant, not worth a separate file.
export const STEP_KEYS = ["packageStep", "datetime", "details", "review", "checkout"] as const;
export type StepKey = (typeof STEP_KEYS)[number];

export function StepIndicator({ current }: { current: number }) {
  const { t } = useI18n();
  const currentStepLabel = t(`booking.steps.${STEP_KEYS[current] ?? "packageStep"}`);
  return (
    <div>
      <p className="mb-2 flex items-baseline gap-3 text-sm">
        <span className="text-muted-foreground">
          {t("booking.stepOf", { current: current + 1, total: STEP_KEYS.length })}
        </span>
        <span className="font-medium text-foreground">{currentStepLabel}</span>
      </p>
      <ol className="flex gap-1.5" aria-hidden="true">
        {STEP_KEYS.map((key, index) => (
          <li
            key={key}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors duration-200",
              index <= current ? "bg-primary" : "bg-elevated",
            )}
          />
        ))}
      </ol>
      <p className="sr-only" aria-live="polite">
        {currentStepLabel}
      </p>
    </div>
  );
}
