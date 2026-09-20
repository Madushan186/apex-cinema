import { useState } from "react";
import { Link } from "react-router";
import { DateNav } from "@/components/staff/DateNav";
import { RequireRole } from "@/components/staff/RequireRole";
import { StaffTopBar } from "@/components/staff/StaffTopBar";
import { Card, CardContent } from "@/components/ui/card";
import { Notice } from "@/components/ui/notice";
import { getOwnerOverview } from "@/data/firebase/staffApi";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePromise } from "@/hooks/usePromise";
import { useI18n } from "@/i18n/LocaleProvider";
import { getColomboTodayISO } from "@/lib/colomboTime";

function CountCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 text-3xl font-semibold tracking-tight text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}

function OverviewBody() {
  const { t } = useI18n();
  const [dateISO, setDateISO] = useState(() => getColomboTodayISO());
  const { data: counts, error } = usePromise(() => getOwnerOverview(dateISO), [dateISO]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/staff" className="text-sm font-medium text-gold hover:underline">
        {t("staff.backToSchedule")}
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t("staff.overviewTitle")}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{t("staff.overviewSubtitle", { date: dateISO })}</p>
        </div>
        <DateNav dateISO={dateISO} onChange={setDateISO} />
      </div>

      <div className="mt-8">
        {error ? (
          <Notice variant="error">{t("staff.overviewError")}</Notice>
        ) : !counts ? (
          <Notice variant="info">{t("staff.overviewLoading")}</Notice>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <CountCard label={t("staff.overviewTotal")} value={counts.total} />
            <CountCard label={t("staff.overviewActiveHolds")} value={counts.activeHolds} />
            <CountCard label={t("staff.overviewExpiredHolds")} value={counts.expiredHolds} />
            <CountCard label={t("staff.overviewConfirmed")} value={counts.confirmed} />
          </div>
        )}
      </div>
    </div>
  );
}

export function OwnerOverview() {
  const { t } = useI18n();
  useDocumentTitle(t("staff.overviewTitle"));

  return (
    <RequireRole allowedRoles={["owner"]}>
      {(auth) => (
        <>
          <div className="mx-auto max-w-3xl px-4 pt-6">
            <StaffTopBar
              email={auth.user?.email ?? null}
              role={auth.role ?? "owner"}
              onSignOut={() => void auth.signOutStaff()}
            />
          </div>
          <OverviewBody />
        </>
      )}
    </RequireRole>
  );
}
