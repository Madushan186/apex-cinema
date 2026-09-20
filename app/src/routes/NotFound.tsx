import { Link } from "react-router";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useI18n } from "@/i18n/LocaleProvider";

export function NotFound() {
  const { t } = useI18n();
  useDocumentTitle(t("notFound.title"));

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{t("notFound.title")}</h1>
      <p className="text-muted-foreground">{t("notFound.body")}</p>
      <Link to="/" className="text-primary underline">
        {t("notFound.backHome")}
      </Link>
    </main>
  );
}
