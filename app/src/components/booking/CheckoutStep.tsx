import { Clock } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { DemoOutcome } from "@/data/types";
import { formatMinutesSeconds, useCountdown } from "@/hooks/useCountdown";
import { useI18n } from "@/i18n/LocaleProvider";
import { DEMO_HOLD_DURATION_MINUTES } from "@/lib/bookingConfig";

const OUTCOME_OPTIONS: DemoOutcome[] = [
  "confirmed",
  "awaiting-payment",
  "verifying",
  "failed",
  "hold-expired",
  "needs-review",
];

export function CheckoutStep({
  holdStartedAt,
  outcome,
  onChangeOutcome,
  onBack,
  onPreview,
  onHoldExpired,
}: {
  holdStartedAt: number;
  outcome: DemoOutcome;
  onChangeOutcome: (outcome: DemoOutcome) => void;
  onBack: () => void;
  onPreview: () => void;
  onHoldExpired: () => void;
}) {
  const { t } = useI18n();
  const remainingMs = useCountdown(holdStartedAt, DEMO_HOLD_DURATION_MINUTES * 60 * 1000);
  const expired = remainingMs <= 0;

  useEffect(() => {
    if (expired) onHoldExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once when the countdown crosses zero, not on every parent re-render.
  }, [expired]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{t("booking.checkout.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("booking.checkout.subtitle")}</p>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-4 py-3 text-sm">
        <Clock aria-hidden="true" className="size-4 text-gold" />
        <span className="text-foreground">{t("booking.checkout.holdLabel")}</span>
        <span className="ml-auto font-mono font-semibold text-gold" aria-live="polite">
          {formatMinutesSeconds(remainingMs)}
        </span>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t("booking.checkout.simulateLabel")}</span>
        <select
          value={outcome}
          onChange={(e) => onChangeOutcome(e.target.value as DemoOutcome)}
          className="h-10 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {OUTCOME_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`booking.checkout.outcomes.${value}`)}
            </option>
          ))}
        </select>
      </label>

      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button size="lg" onClick={onPreview}>
          {t("booking.checkout.previewButton")}
        </Button>
      </div>
    </div>
  );
}
