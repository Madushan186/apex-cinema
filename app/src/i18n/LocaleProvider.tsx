import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en, si } from "./translations";
import type { TranslationDictionary } from "./translations";
import { getByPath, interpolate } from "./paths";
import type { TranslationPath } from "./paths";

export type Locale = "en" | "si";
// eslint-disable-next-line react-refresh/only-export-components -- small shared constant, not worth a separate file.
export const LOCALES: readonly Locale[] = ["en", "si"];
const STORAGE_KEY = "apex-cinema:locale";

const DICTIONARIES: Record<Locale, TranslationDictionary> = { en, si };

// Loaded on demand (only when Sinhala is actually shown) so English visitors
// never pay for this download — see docs/DESIGN.md "Localisation approach".
const SINHALA_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+Sinhala:wght@400;500;600;700&display=swap";
const SINHALA_FONT_LINK_ID = "sinhala-font-stylesheet";

function ensureSinhalaFontLoaded() {
  if (document.getElementById(SINHALA_FONT_LINK_ID)) return;
  const link = document.createElement("link");
  link.id = SINHALA_FONT_LINK_ID;
  link.rel = "stylesheet";
  link.href = SINHALA_FONT_HREF;
  document.head.appendChild(link);
}

function readStoredLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "si") return stored;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to default.
  }
  return "en";
}

type TranslateFn = (key: TranslationPath<TranslationDictionary>, vars?: Record<string, string | number>) => string;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());

  useEffect(() => {
    // `:lang(si)` in index.css keys off this attribute for font-family/line-height —
    // no separate class needed.
    document.documentElement.lang = locale;
    if (locale === "si") ensureSinhalaFontLoaded();
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Non-fatal — the explicit selection just won't survive a reload this time.
    }
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => interpolate(getByPath(DICTIONARIES[locale], key), vars),
    [locale],
  );

  const value = useMemo<LocaleContextValue>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- the context hook belongs next to its provider.
export function useI18n(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used within LocaleProvider");
  return ctx;
}
