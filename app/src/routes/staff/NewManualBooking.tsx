import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ManualBookingForm } from "@/components/staff/ManualBookingForm";
import { ManualBookingReview } from "@/components/staff/ManualBookingReview";
import { RequireRole } from "@/components/staff/RequireRole";
import { StaffTopBar } from "@/components/staff/StaffTopBar";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { packagesAdapter } from "@/data";
import type { ManualBookingResult } from "@/data/firebase/staffApi";
import { createManualBooking, ManualBookingError } from "@/data/firebase/staffApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePromise } from "@/hooks/usePromise";
import { useI18n } from "@/i18n/LocaleProvider";
import { getColomboTodayISO } from "@/lib/colomboTime";
import type { ManualBookingFormErrors, ManualBookingFormInput, TranslateFn } from "@/lib/manualBookingValidation";
import { hasErrors, validateManualBookingForm } from "@/lib/manualBookingValidation";

type Phase = "form" | "review" | "success";

const EMPTY_FORM: ManualBookingFormInput = {
  packageId: null,
  dateISO: getColomboTodayISO(),
  time: null,
  peopleCount: null,
  name: "",
  phone: "",
  email: "",
  source: "staff_walkin",
  staffNote: "",
};

function mapErrorMessage(error: unknown, t: TranslateFn): string {
  if (error instanceof ManualBookingError) {
    switch (error.reason) {
      case "unavailable":
        return t("staff.manualBooking.errorUnavailable");
      case "invalid-request":
        return t("staff.manualBooking.errorInvalid");
      case "idempotency-conflict":
        return t("staff.manualBooking.errorConflict");
      default:
        return t("staff.manualBooking.errorUnknown");
    }
  }
  return t("staff.manualBooking.errorUnknown");
}

function NewManualBookingBody() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [packagesRetryKey, setPackagesRetryKey] = useState(0);
  const {
    data: packages,
    loading: packagesLoading,
    error: packagesError,
  } = usePromise(() => packagesAdapter.listPackages(), [packagesRetryKey]);

  const [phase, setPhase] = useState<Phase>("form");
  const [form, setForm] = useState<ManualBookingFormInput>(EMPTY_FORM);
  const [errors, setErrors] = useState<ManualBookingFormErrors>({});
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<ManualBookingResult | null>(null);
  // docs/DECISIONS.md D17 — never preselected; staff must explicitly check
  // this before a booking can be created.
  const [advanceReceived, setAdvanceReceived] = useState(false);
  const [advanceTouched, setAdvanceTouched] = useState(false);

  const selectedPackage = (packages ?? []).find((pkg) => pkg.id === form.packageId) ?? null;
  const packagesUnavailable = packagesLoading || Boolean(packagesError) || (packages ?? []).length === 0;

  function handleReview() {
    if (packagesUnavailable) return;
    const maxPeople = selectedPackage?.maxPeople ?? 1;
    const nextErrors = validateManualBookingForm(form, maxPeople, t);
    setErrors(nextErrors);
    if (hasErrors(nextErrors)) return;
    setIdempotencyKey(crypto.randomUUID());
    setErrorMessage(null);
    setPhase("review");
  }

  async function handleConfirm() {
    if (!form.packageId || !form.dateISO || !form.time || form.peopleCount === null || !idempotencyKey) return;
    setAdvanceTouched(true);
    if (!advanceReceived) return; // docs/DECISIONS.md D17 — cannot proceed without explicit confirmation.
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await createManualBooking({
        packageId: form.packageId,
        dateISO: form.dateISO,
        time: form.time,
        peopleCount: form.peopleCount,
        name: form.name.trim(),
        phone: form.phone.replace(/[\s-]/g, ""),
        email: form.email.trim(),
        source: form.source,
        staffNote: form.staffNote.trim(),
        idempotencyKey,
        advanceReceivedConfirmation: true,
      });
      setResult(response);
      setPhase("success");
    } catch (error) {
      // Form data is untouched — still in `form` state — so the error can
      // be shown on the review step without losing anything the staff
      // member entered (docs/PROGRESS.md "preserve entered details").
      setErrorMessage(mapErrorMessage(error, t));
    } finally {
      setSubmitting(false);
    }
  }

  function handleCreateAnother() {
    setForm(EMPTY_FORM);
    setErrors({});
    setIdempotencyKey(null);
    setErrorMessage(null);
    setResult(null);
    setAdvanceReceived(false);
    setAdvanceTouched(false);
    setPhase("form");
  }

  if (phase === "success" && result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <Notice variant="success">
          <p className="font-semibold">{t("staff.manualBooking.successTitle")}</p>
        </Notice>
        <dl className="mt-4 flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-card">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{t("staff.manualBooking.successReferenceLabel")}</dt>
            <dd className="text-sm font-medium text-foreground">{result.referenceCode}</dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{t("staff.manualBooking.successRoomLabel")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {t("staff.roomLabel", { number: result.roomId.replace("room-", "") })}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{t("staff.manualBooking.successAdvanceLabel")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {t("packages.priceLabel", { price: (result.amountPaidMinor / 100).toLocaleString("en-LK") })}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{t("staff.manualBooking.successBalanceLabel")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {t("packages.priceLabel", { price: (result.balanceDueMinor / 100).toLocaleString("en-LK") })}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <dt className="text-sm text-muted-foreground">{t("staff.manualBooking.successStatusLabel")}</dt>
            <dd className="text-sm font-medium text-foreground">
              {t(
                result.paymentStatus === "paid"
                  ? "staff.paidBadge"
                  : result.paymentStatus === "partially_paid"
                    ? "staff.partiallyPaidBadge"
                    : "staff.unpaidBadge",
              )}
            </dd>
          </div>
        </dl>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={() => navigate(`/staff?date=${form.dateISO}`)}>{t("staff.backToSchedule")}</Button>
          <Button variant="outline" onClick={handleCreateAnother}>
            {t("staff.manualBooking.createAnother")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <Link to="/staff" className="text-sm font-medium text-gold hover:underline">
        {t("staff.backToSchedule")}
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
        {t("staff.manualBooking.pageTitle")}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("staff.manualBooking.pageSubtitle")}</p>

      <div className="mt-8">
        {phase === "form" ? (
          <ManualBookingForm
            packages={packages ?? []}
            packagesLoading={packagesLoading}
            packagesError={packagesError}
            onRetryPackages={() => setPackagesRetryKey((key) => key + 1)}
            value={form}
            errors={errors}
            onChange={setForm}
            onSubmit={handleReview}
          />
        ) : selectedPackage ? (
          <ManualBookingReview
            pkg={selectedPackage}
            value={form}
            submitting={submitting}
            errorMessage={errorMessage}
            advanceReceived={advanceReceived}
            advanceTouched={advanceTouched}
            onAdvanceReceivedChange={(checked) => {
              setAdvanceReceived(checked);
              if (checked) setAdvanceTouched(false);
            }}
            onBack={() => setPhase("form")}
            onConfirm={() => void handleConfirm()}
          />
        ) : null}
      </div>
    </div>
  );
}

export function NewManualBooking() {
  const { t } = useI18n();
  useDocumentTitle(t("staff.manualBooking.pageTitle"));

  return (
    <RequireRole allowedRoles={["staff", "owner"]}>
      {(auth) => (
        <>
          <div className="mx-auto max-w-2xl px-4 pt-6">
            <StaffTopBar
              email={auth.user?.email ?? null}
              role={auth.role ?? "staff"}
              onSignOut={() => void auth.signOutStaff()}
            />
          </div>
          <NewManualBookingBody />
        </>
      )}
    </RequireRole>
  );
}
