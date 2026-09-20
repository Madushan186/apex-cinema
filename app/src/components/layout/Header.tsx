import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router";
import { Logo } from "@/components/brand/Logo";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";
import { LanguageSwitch } from "./LanguageSwitch";

function useNavItems() {
  const { t } = useI18n();
  return [
    { to: "/", label: t("nav.home") },
    { to: "/packages", label: t("nav.packages") },
    { to: "/rooms", label: t("nav.rooms") },
    { to: "/party", label: t("nav.party") },
    { to: "/faq", label: t("nav.faq") },
    { to: "/contact", label: t("nav.contact") },
  ];
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
  );

export function Header() {
  const { t } = useI18n();
  const navItems = useNavItems();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-border-subtle bg-background">
      <a
        href="#main-content"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-2 focus-visible:left-2 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-elevated focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm"
      >
        {t("nav.skipToContent")}
      </a>
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <NavLink to="/" className="shrink-0" aria-label={t("meta.siteName")}>
          <Logo size="header" priority />
        </NavLink>

        <nav aria-label={t("meta.siteName")} className="hidden items-center lg:flex">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"} className={navLinkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitch />
          <Button asChild size="sm">
            <NavLink to="/book">{t("nav.bookRoom")}</NavLink>
          </Button>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitch />
          <button
            type="button"
            aria-label={t("nav.openMenu")}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-elevated"
          >
            <Menu aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-background lg:hidden" role="dialog" aria-modal="true">
          <div className="flex h-20 items-center justify-between border-b border-border-subtle px-4 sm:px-6">
            <Logo size="header" />
            <button
              ref={closeButtonRef}
              type="button"
              aria-label={t("nav.closeMenu")}
              onClick={() => setMenuOpen(false)}
              className="inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-elevated"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>
          <nav aria-label={t("meta.siteName")} className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={closeMenu}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-3 text-base font-medium",
                    isActive ? "bg-elevated text-foreground" : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
            <NavLink
              to="/policies"
              onClick={closeMenu}
              className={({ isActive }) =>
                cn(
                  "rounded-md px-3 py-3 text-base font-medium",
                  isActive ? "bg-elevated text-foreground" : "text-muted-foreground hover:bg-elevated hover:text-foreground",
                )
              }
            >
              {t("nav.policies")}
            </NavLink>
          </nav>
          <div className="border-t border-border-subtle p-4">
            <Button asChild size="lg" className="w-full">
              <NavLink to="/book" onClick={closeMenu}>
                {t("nav.bookRoom")}
              </NavLink>
            </Button>
          </div>
        </div>
      ) : null}
    </header>
  );
}
