import { AlertTriangle, CheckCircle2, Clock, Download, Printer, TimerOff, XCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { BookingPreviewResult, DemoOutcome, PackageDefinition } from "@/data/types";
import { useI18n } from "@/i18n/LocaleProvider";
import { formatDateLabel } from "@/lib/colomboTime";
import { downloadDemoConfirmation } from "@/lib/demoConfirmation";

const OUTCOME_ICON: Record<DemoOutcome, typeof CheckCircle2> = {
  "awaiting-payment": Clock,
  verifying: Clock,
  failed: XCircle,
  "hold-expired": TimerOff,
  confirmed: CheckCircle2,
  "needs-review": AlertTriangle,
};

const OUTCOME_TONE: Record<DemoOutcome, "info" | "success" | "warning" | "error"> = {
  "awaiting-payment": "info",
  verifying: "info",
  failed: "error",
  "hold-expired": "warning",
  confirmed: "success",
  "needs-review": "warning",
};

type EmailPreviewState = "pending" | "sent" | "failed";

const EMAIL_LABEL_KEY = {
  pending: "emailStates.labelPending",
  sent: "emailStates.labelSent",
  failed: "emailStates.labelFailed",
} as const satisfies Record<EmailPreviewState, string>;

export function ResultScreen({
  outcome,
  preview,
  pkg,
  peopleCount,
  onRetry,
  onRestart,
  onBackHome,
}: {
  outcome: DemoOutcome;
  preview: BookingPreviewResult;
  pkg: PackageDefinition;
  peopleCount: number;
  onRetry: () => void;
  onRestart: () => void;
  onBackHome: () => void;
}) {
  const { t, locale } = useI18n();
  const [emailPreview, setEmailPreview] = useState<EmailPreviewState>("pending");
  const Icon = OUTCOME_ICON[outcome];

  const dateLabel = formatDateLabel(preview.startISO.slice(0, 10), locale, "long");

  const timeLabel = `${preview.startISO.slice(11, 16)} – ${preview.endISO.slice(11, 16)} (${t("common.sriLankaTime")})`;

  return (
    <div className="flex flex-col gap-6">
      <Notice variant="demo">{t("booking.demoBanner")}</Notice>

      <div className="flex flex-col items-center gap-3 rounded-lg border border-border-subtle bg-card p-8 text-center">
        <Icon
          aria-hidden="true"
          className={`size-10 ${
            OUTCOME_TONE[outcome] === "success"
              ? "text-status-positive"
              : OUTCOME_TONE[outcome] === "error"
                ? "text-status-negative"
                : OUTCOME_TONE[outcome] === "warning"
                  ? "text-status-warning"
                  : "text-muted-foreground"
          }`}
        />
        <h2 className="text-xl font-semibold text-foreground">{t(`booking.result.${outcome}.title`)}</h2>
        <p className="max-w-md text-sm text-muted-foreground">{t(`booking.result.${outcome}.body`)}</p>
      </div>

      {outcome === "confirmed" ? (
        <>
          <dl className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-card">
            <Row label={t("booking.result.confirmed.referenceLabel")} value={preview.referenceCode} mono />
            <Row label={t("booking.review.packageLabel")} value={t(`packages.tiers.${pkg.id}.name`)} />
            <Row label={t("booking.review.dateLabel")} value={dateLabel} />
            <Row label={t("booking.review.timeLabel")} value={timeLabel} />
            <Row label={t("booking.review.peopleLabel")} value={`${peopleCount} ${t("common.people")}`} />
            <Row
              label={t("booking.result.confirmed.amountLabel")}
              value={t("packages.priceLabel", { price: preview.totalLKR.toLocaleString("en-LK") })}
              note={t("booking.result.confirmed.amountSimulatedNote")}
            />
          </dl>

          <Notice variant="info">{t("booking.result.confirmed.emailNote")}</Notice>

          <div className="rounded-lg border border-border-subtle bg-card p-4">
            <p className="mb-2 text-sm font-medium text-foreground">{t("emailStates.title")}</p>
            <div className="mb-3 flex gap-2">
              {(["pending", "sent", "failed"] as const).map((state) => (
                <button
                  key={state}
                  type="button"
                  onClick={() => setEmailPreview(state)}
                  aria-pressed={emailPreview === state}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    emailPreview === state ? "border-gold bg-gold/10 text-gold" : "border-border-subtle text-muted-foreground"
                  }`}
                >
                  {t(EMAIL_LABEL_KEY[state])}
                </button>
              ))}
            </div>
            <Notice variant={emailPreview === "sent" ? "success" : emailPreview === "failed" ? "error" : "info"}>
              {t(`emailStates.${emailPreview}`)}
            </Notice>
            <p className="mt-2 text-xs text-muted-foreground">{t("emailStates.note")}</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() =>
                downloadDemoConfirmation({
                  t,
                  preview,
                  packageName: t(`packages.tiers.${pkg.id}.name`),
                  dateLabel,
                  timeLabel,
                  peopleCount,
                })
              }
            >
              <Download aria-hidden="true" />
              {t("booking.result.confirmed.download")}
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              {t("booking.result.confirmed.print")}
            </Button>
          </div>
        </>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {outcome === "failed" || outcome === "hold-expired" ? (
          <Button onClick={outcome === "failed" ? onRetry : onRestart}>
            {outcome === "failed" ? t("common.retry") : t("booking.result.startOver")}
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onBackHome}>
          {t("booking.result.backHome")}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, note, mono }: { label: string; value: string; note?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground">
        <span className={mono ? "font-mono" : ""}>{value}</span>
        {note ? <span className="block text-xs font-normal text-muted-foreground">{note}</span> : null}
      </dd>
    </div>
  );
}
