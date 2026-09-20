/**
 * Frontend route guard — a UX convenience only. The real enforcement is
 * server-side (functions/src/lib/auth.ts's `requireRole`, checked against
 * the caller's verified ID token custom claim on every callable). This
 * component just avoids flashing protected UI at someone who will get a
 * permission-denied error the moment they call a callable.
 */
import type { ReactNode } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { DATA_MODE } from "@/lib/dataMode";
import type { StaffAuthState, StaffRole } from "@/hooks/useStaffAuth";
import { useStaffAuth } from "@/hooks/useStaffAuth";
import { useI18n } from "@/i18n/LocaleProvider";

export function RequireRole({
  allowedRoles,
  children,
}: {
  allowedRoles: readonly StaffRole[];
  children: (auth: StaffAuthState & { signOutStaff: () => Promise<void> }) => ReactNode;
}) {
  const { t } = useI18n();
  const auth = useStaffAuth();

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

  if (auth.status === "loading") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Notice variant="info">{t("staff.checkingSession")}</Notice>
      </main>
    );
  }

  if (auth.status === "signed-out") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Notice variant="info">{t("staff.sessionExpiredBody")}</Notice>
        <Button asChild className="mt-4">
          <Link to="/staff/login">{t("staff.signInAgain")}</Link>
        </Button>
      </main>
    );
  }

  if (auth.status === "session-expired") {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Notice variant="warning">
          <p className="font-medium">{t("staff.sessionExpiredTitle")}</p>
          <p className="mt-1">{t("staff.sessionExpiredBody")}</p>
        </Notice>
        <Button asChild className="mt-4">
          <Link to="/staff/login">{t("staff.signInAgain")}</Link>
        </Button>
      </main>
    );
  }

  if (!auth.role || !allowedRoles.includes(auth.role)) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <Notice variant="error">
          <p className="font-medium">{t("staff.accessDeniedTitle")}</p>
          <p className="mt-1">{t("staff.accessDeniedBody")}</p>
        </Notice>
        <Button asChild variant="outline" className="mt-4">
          <Link to="/staff/login">{t("staff.backToLogin")}</Link>
        </Button>
      </main>
    );
  }

  return <>{children(auth)}</>;
}
