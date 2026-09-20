import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import type { StaffRole } from "@/hooks/useStaffAuth";
import { useI18n } from "@/i18n/LocaleProvider";

export function StaffTopBar({
  email,
  role,
  onSignOut,
  navLink,
}: {
  email: string | null;
  role: StaffRole;
  onSignOut: () => void;
  navLink?: { to: string; label: string };
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle pb-4">
      <p className="text-sm text-muted-foreground">
        {email ? `${t("staff.signedInAs", { email })} — ` : null}
        <span className="font-medium text-foreground">
          {t(role === "owner" ? "staff.roleOwner" : "staff.roleStaff")}
        </span>
      </p>
      <div className="flex items-center gap-4">
        {navLink ? (
          <Link to={navLink.to} className="text-sm font-medium text-gold hover:underline">
            {navLink.label}
          </Link>
        ) : null}
        <Button variant="outline" size="sm" onClick={onSignOut}>
          {t("staff.signOutButton")}
        </Button>
      </div>
    </div>
  );
}
