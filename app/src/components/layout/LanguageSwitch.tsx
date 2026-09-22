import { useI18n } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

/**
 * Visible "EN | සිංහල" switch. Only ever changes locale state — never
 * navigates, never resets the current route or any in-progress form state
 * (see docs/DESIGN.md "Localisation approach").
 */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("nav.languageSwitchLabel")}
      className={cn("inline-flex items-center gap-1 rounded-full border border-border-subtle p-0.5 text-sm", className)}
    >
      <button
        type="button"
        aria-pressed={locale === "en"}
        onClick={() => setLocale("en")}
        className={cn(
          "rounded-full px-2.5 py-1 font-medium transition-colors duration-150",
          locale === "en" ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        EN
      </button>
      <span aria-hidden="true" className="text-border">
        |
      </span>
      <button
        type="button"
        aria-pressed={locale === "si"}
        onClick={() => setLocale("si")}
        lang="si"
        className={cn(
          "rounded-full px-2.5 py-1 font-medium transition-colors duration-150",
          locale === "si" ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        සිංහල
      </button>
    </div>
  );
}
