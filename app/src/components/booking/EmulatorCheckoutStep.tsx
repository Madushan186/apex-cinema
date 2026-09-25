import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { holdsAdapter } from "@/data";
import { HoldError } from "@/data/types";
import type { HoldErrorReason, HoldResult, PackageDefinition, SlotTime } from "@/data/types";
import { formatMinutesSeconds, useCountdownUntil } from "@/hooks/useCountdown";
import { useI18n } from "@/i18n/LocaleProvider";
import type { DetailsInput } from "@/lib/bookingValidation";

const ERROR_TITLE_KEY = {
  unavailable: "booking.emulator.errors.unavailable.title",
  "invalid-request": "booking.emulator.errors.invalidRequest.title",
  "idempotency-conflict": "booking.emulator.errors.idempotencyConflict.title",
  "rate-limited": "booking.emulator.errors.rateLimited.title",
  unknown: "booking.emulator.errors.unknown.title",
} as const satisfies Record<HoldErrorReason, string>;

const ERROR_BODY_KEY = {
  unavailable: "booking.emulator.errors.unavailable.body",
  "invalid-request": "booking.emulator.errors.invalidRequest.body",
  "idempotency-conflict": "booking.emulator.errors.idempotencyConflict.body",
  "rate-limited": "booking.emulator.errors.rateLimited.body",
  unknown: "booking.emulator.errors.unknown.body",
} as const satisfies Record<HoldErrorReason, string>;

/**
 * The REAL booking engine checkout step (Cloud Functions + Firestore
 * emulator) — deliberately kept visually and textually separate from the
 * fixture "demo checkout" (CheckoutStep.tsx): no "simulate outcome"
 * dropdown, no instant fake confirmation. A successful result here is a
 * real, temporary hold — never a confirmed paid booking (see
 * docs/PROGRESS.md, payment is not implemented in this phase).
 */
export function EmulatorCheckoutStep({
  pkg,
  dateISO,
  time,
  details,
  onBack,
  onRestart,
  onBackHome,
}: {
  pkg: PackageDefinition;
  dateISO: string;
  time: SlotTime;
  details: DetailsInput;
  onBack: () => void;
  onRestart: () => void;
  onBackHome: () => void;
}) {
  const { t } = useI18n();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [hold, setHold] = useState<HoldResult | null>(null);
  const [errorReason, setErrorReason] = useState<HoldErrorReason>("unknown");

  const remainingMs = useCountdownUntil(hold?.expiresAtMillis ?? null);
  const holdExpired = status === "success" && remainingMs <= 0;

  async function handleCreateHold() {
    if (!holdsAdapter || details.peopleCount === null) return;
    setStatus("loading");
    try {
      const result = await holdsAdapter.createHold({
        packageId: pkg.id as "non-ac" | "ac-small" | "ac-large",
        dateISO,
        time,
        peopleCount: details.peopleCount,
        name: details.name,
        phone: details.phone,
        email: details.email,
        idempotencyKey,
      });
      setHold(result);
      setStatus("success");
    } catch (error) {
      setErrorReason(error instanceof HoldError ? error.reason : "unknown");
      setStatus("error");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-xl font-semibold text-foreground">{t("booking.emulator.title")}</h2>
          <Badge variant="outline">EMULATOR</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{t("booking.emulator.subtitle")}</p>
      </div>

      {status === "idle" || status === "loading" ? (
        <>
          <Notice variant="info">{t("booking.emulator.holdLabel")}</Notice>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={onBack} disabled={status === "loading"}>
              {t("common.back")}
            </Button>
            <Button size="lg" onClick={() => void handleCreateHold()} disabled={status === "loading"}>
              {status === "loading" ? t("booking.emulator.loading") : t("booking.emulator.createButton")}
            </Button>
          </div>
        </>
      ) : null}

      {status === "success" && hold ? (
        <>
          <h3 className="text-lg font-semibold text-foreground">{t("booking.emulator.success.title")}</h3>
          {holdExpired ? (
            <Notice variant="warning">{t("booking.emulator.expiredNotice")}</Notice>
          ) : (
            <Notice variant="success">{t("booking.emulator.success.body")}</Notice>
          )}

          <dl className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-card">
            <Row label={t("booking.emulator.success.referenceLabel")} value={hold.referenceCode} mono />
            <Row
              label={t("booking.emulator.success.amountLabel")}
              value={`LKR ${(hold.totalAmountMinor / 100).toLocaleString("en-LK")}`}
              note={t("booking.emulator.success.amountNote")}
            />
            {!holdExpired ? (
              <Row label={t("booking.emulator.success.expiresLabel")} value={formatMinutesSeconds(remainingMs)} mono />
            ) : null}
          </dl>

          <div className="flex flex-wrap gap-3">
            <Button onClick={onRestart}>{t("booking.result.startOver")}</Button>
            <Button variant="ghost" onClick={onBackHome}>
              {t("booking.result.backHome")}
            </Button>
          </div>
        </>
      ) : null}

      {status === "error" ? (
        <>
          <Notice variant="error">
            <p className="font-medium">{t(ERROR_TITLE_KEY[errorReason])}</p>
            <p>{t(ERROR_BODY_KEY[errorReason])}</p>
          </Notice>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setStatus("idle")}>{t("common.retry")}</Button>
            <Button variant="ghost" onClick={onBack}>
              {t("common.back")}
            </Button>
            <Button variant="ghost" onClick={onRestart}>
              {t("booking.result.startOver")}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Row({ label, value, note, mono }: { label: string; value: string; note?: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium text-foreground tabular-nums">
        <span className={mono ? "font-mono" : ""}>{value}</span>
        {note ? <span className="block text-xs font-normal text-muted-foreground">{note}</span> : null}
      </dd>
    </div>
  );
}
