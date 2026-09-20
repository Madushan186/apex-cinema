import { FirebaseError } from "firebase/app";
import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Notice } from "@/components/ui/notice";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { DATA_MODE } from "@/lib/dataMode";
import { useI18n } from "@/i18n/LocaleProvider";

const INVALID_CREDENTIAL_CODES = new Set([
  "auth/invalid-credential",
  "auth/user-not-found",
  "auth/wrong-password",
  "auth/invalid-email",
]);

export function StaffLogin() {
  const { t } = useI18n();
  const auth = useStaffAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (DATA_MODE !== "emulator") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Notice variant="warning">
          <p className="font-medium">{t("staff.requiresEmulatorTitle")}</p>
          <p className="mt-1">{t("staff.requiresEmulatorBody")}</p>
        </Notice>
      </main>
    );
  }

  if (auth.status === "signed-in" && auth.role) {
    return <Navigate to="/staff" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await auth.signInStaff(email, password);
    } catch (err) {
      if (err instanceof FirebaseError && INVALID_CREDENTIAL_CODES.has(err.code)) {
        setError(t("staff.invalidCredentials"));
      } else if (err instanceof FirebaseError && err.code === "auth/too-many-requests") {
        setError(t("staff.tooManyAttempts"));
      } else {
        setError(t("staff.genericLoginError"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 py-16">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("staff.loginTitle")}</h1>
      <p className="text-muted-foreground mt-1 text-sm">{t("staff.loginSubtitle")}</p>

      <form className="mt-8 flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
        {error ? <Notice variant="error">{error}</Notice> : null}

        <Field label={t("staff.emailLabel")} required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>

        <Field label={t("staff.passwordLabel")} required>
          {(fieldProps) => (
            <Input
              {...fieldProps}
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>

        <Button type="submit" disabled={submitting}>
          {submitting ? t("staff.signingIn") : t("staff.signInButton")}
        </Button>
      </form>
    </main>
  );
}
