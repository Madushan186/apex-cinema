import { useEffect } from "react";
import { useI18n } from "@/i18n/LocaleProvider";

/** Sets `document.title` to "`pageTitle` — Apex Cinema", re-running on locale change. */
export function useDocumentTitle(pageTitle: string) {
  const { t } = useI18n();
  useEffect(() => {
    document.title = `${pageTitle} — ${t("meta.siteName")}`;
  }, [pageTitle, t]);
}
