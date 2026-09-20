import { useCallback, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { CheckoutStep } from "@/components/booking/CheckoutStep";
import { DateTimeStep } from "@/components/booking/DateTimeStep";
import { DetailsStep } from "@/components/booking/DetailsStep";
import { EmulatorCheckoutStep } from "@/components/booking/EmulatorCheckoutStep";
import { PackageStep } from "@/components/booking/PackageStep";
import { ResultScreen } from "@/components/booking/ResultScreen";
import { ReviewStep } from "@/components/booking/ReviewStep";
import { StepIndicator } from "@/components/booking/StepIndicator";
import { Notice } from "@/components/ui/notice";
import { DATA_MODE, bookingPreviewAdapter, packagesAdapter } from "@/data";
import type { BookablePackageId, BookingPreviewResult, DemoOutcome, SlotTime } from "@/data/types";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePromise } from "@/hooks/usePromise";
import { useI18n } from "@/i18n/LocaleProvider";
import type { DetailsInput } from "@/lib/bookingValidation";
import { getColomboTodayISO } from "@/lib/colomboTime";

const EMPTY_DETAILS: DetailsInput = { name: "", phone: "", email: "", peopleCount: null };

export function Book() {
  const { t } = useI18n();
  useDocumentTitle(t("booking.wizardTitle"));
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const simulateError = searchParams.get("fixtureError") === "1";
  const preselected = searchParams.get("package");

  const { data: packages, loading: packagesLoading } = usePromise(() => packagesAdapter.listPackages(), []);

  const [step, setStep] = useState(0);
  const [packageId, setPackageId] = useState<BookablePackageId | null>(
    preselected === "non-ac" || preselected === "ac-small" || preselected === "ac-large" ? preselected : null,
  );
  const [dateISO, setDateISO] = useState(getColomboTodayISO());
  const [time, setTime] = useState<SlotTime | null>(null);
  const [details, setDetails] = useState<DetailsInput>(EMPTY_DETAILS);
  const [holdStartedAt, setHoldStartedAt] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<DemoOutcome>("confirmed");
  const [preview, setPreview] = useState<BookingPreviewResult | null>(null);
  const [creatingPreview, setCreatingPreview] = useState(false);

  const pkg = packages?.find((p) => p.id === packageId);

  const triggerOutcome = useCallback(
    async (nextOutcome: DemoOutcome) => {
      if (!packageId || !time || details.peopleCount === null) return;
      setCreatingPreview(true);
      const result = await bookingPreviewAdapter.createPreview({
        packageId,
        dateISO,
        time,
        peopleCount: details.peopleCount,
        name: details.name,
        phone: details.phone,
        email: details.email,
      });
      setPreview(result);
      setOutcome(nextOutcome);
      setCreatingPreview(false);
    },
    [packageId, time, details, dateISO],
  );

  if (packagesLoading || !packages) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Notice variant="info">{t("common.loading")}</Notice>
      </div>
    );
  }

  if (preview) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        {pkg ? (
          <ResultScreen
            outcome={outcome}
            preview={preview}
            pkg={pkg}
            peopleCount={details.peopleCount ?? 0}
            onRetry={() => {
              setPreview(null);
              setStep(4);
            }}
            onRestart={() => {
              setPreview(null);
              setOutcome("confirmed");
              setStep(0);
              setPackageId(null);
              setTime(null);
              setDetails(EMPTY_DETAILS);
              setHoldStartedAt(null);
            }}
            onBackHome={() => navigate("/")}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="text-2xl font-semibold text-foreground">{t("booking.wizardTitle")}</h1>
        <Notice variant="demo">{t("booking.demoBanner")}</Notice>
        <StepIndicator current={step} />
      </div>

      {step === 0 ? (
        <PackageStep
          packages={packages}
          selectedId={packageId}
          onSelect={setPackageId}
          onContinue={() => setStep(1)}
        />
      ) : null}

      {step === 1 && packageId ? (
        <DateTimeStep
          packageId={packageId}
          dateISO={dateISO}
          time={time}
          onChangeDate={(next) => {
            setDateISO(next);
            setTime(null);
          }}
          onChangeTime={setTime}
          onBack={() => setStep(0)}
          onContinue={() => setStep(2)}
          simulateError={simulateError}
        />
      ) : null}

      {step === 2 && pkg ? (
        <DetailsStep
          value={details}
          maxPeople={pkg.maxPeople}
          onChange={setDetails}
          onBack={() => setStep(1)}
          onContinue={() => setStep(3)}
        />
      ) : null}

      {step === 3 && pkg && time ? (
        <ReviewStep
          pkg={pkg}
          dateISO={dateISO}
          time={time}
          details={details}
          onBack={() => setStep(2)}
          onEditDetails={() => setStep(2)}
          onProceed={() => {
            setHoldStartedAt((current) => current ?? Date.now());
            setStep(4);
          }}
        />
      ) : null}

      {step === 4 && DATA_MODE === "emulator" && pkg && time ? (
        <EmulatorCheckoutStep
          pkg={pkg}
          dateISO={dateISO}
          time={time}
          details={details}
          onBack={() => setStep(3)}
          onRestart={() => {
            setStep(0);
            setPackageId(null);
            setTime(null);
            setDetails(EMPTY_DETAILS);
            setHoldStartedAt(null);
          }}
          onBackHome={() => navigate("/")}
        />
      ) : null}

      {step === 4 && DATA_MODE === "fixture" && holdStartedAt !== null ? (
        <CheckoutStep
          holdStartedAt={holdStartedAt}
          outcome={outcome}
          onChangeOutcome={setOutcome}
          onBack={() => setStep(3)}
          onPreview={() => {
            void triggerOutcome(outcome);
          }}
          onHoldExpired={() => {
            void triggerOutcome("hold-expired");
          }}
        />
      ) : null}

      {creatingPreview ? (
        <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">
          {t("common.loading")}
        </p>
      ) : null}

      <p className="mt-8 text-center text-xs text-muted-foreground">
        <Link to="/" className="underline">
          {t("booking.result.backHome")}
        </Link>
      </p>
    </div>
  );
}
