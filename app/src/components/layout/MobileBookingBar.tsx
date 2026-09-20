import { NavLink } from "react-router";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/LocaleProvider";

/**
 * Discreet, only on marketing pages (never on /book, where it would sit on
 * top of the wizard's own primary action and the mobile keyboard) — see
 * Root.tsx. The inline style (not a Tailwind arbitrary class — Lightning
 * CSS mis-parses nested calc()/env() in an arbitrary value) keeps it clear
 * of iOS home-indicator gestures.
 */
export function MobileBookingBar() {
  const { t } = useI18n();
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border-subtle bg-background/95 p-3 lg:hidden"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
    >
      <Button asChild size="lg" className="w-full">
        <NavLink to="/book">{t("home.mobileBookCta")}</NavLink>
      </Button>
    </div>
  );
}
