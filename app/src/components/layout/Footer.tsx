import { NavLink } from "react-router";
import { Logo } from "@/components/brand/Logo";
import { useI18n } from "@/i18n/LocaleProvider";

export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border-subtle bg-section">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[auto_1fr_1fr] md:gap-12">
        <div className="flex flex-col gap-3">
          <Logo size="footer" />
          <p className="text-xs tracking-[0.2em] text-gold">{t("footer.tagline")}</p>
        </div>

        <nav aria-label={t("nav.packages")} className="flex flex-col gap-2 text-sm">
          <NavLink to="/packages" className="text-muted-foreground hover:text-foreground">
            {t("nav.packages")}
          </NavLink>
          <NavLink to="/rooms" className="text-muted-foreground hover:text-foreground">
            {t("nav.rooms")}
          </NavLink>
          <NavLink to="/party" className="text-muted-foreground hover:text-foreground">
            {t("nav.party")}
          </NavLink>
        </nav>

        <nav aria-label={t("nav.contact")} className="flex flex-col gap-2 text-sm">
          <NavLink to="/faq" className="text-muted-foreground hover:text-foreground">
            {t("nav.faq")}
          </NavLink>
          <NavLink to="/policies" className="text-muted-foreground hover:text-foreground">
            {t("nav.policies")}
          </NavLink>
          <NavLink to="/contact" className="text-muted-foreground hover:text-foreground">
            {t("nav.contact")}
          </NavLink>
        </nav>
      </div>
      <div className="border-t border-border-subtle px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 text-xs text-muted-foreground">
          <p>{t("footer.demoSite")}</p>
          <p>
            © {year} {t("meta.siteName")}. {t("footer.rights")}
          </p>
        </div>
      </div>
    </footer>
  );
}
