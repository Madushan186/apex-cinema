import { SectionHeading } from "@/components/SectionHeading";
import { Notice } from "@/components/ui/notice";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useI18n } from "@/i18n/LocaleProvider";

const SECTIONS = ["hours", "sessions", "extension", "cancellation", "payment"] as const;

export function Policies() {
  const { t } = useI18n();
  useDocumentTitle(t("nav.policies"));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <SectionHeading title={t("policies.title")} />
      <div className="mt-6">
        <Notice variant="warning">{t("policies.draftNotice")}</Notice>
      </div>
      <dl className="mt-8 flex flex-col divide-y divide-border-subtle">
        {SECTIONS.map((key) => (
          <div key={key} className="py-5 first:pt-0">
            <dt className="font-semibold text-foreground">{t(`policies.${key}Title`)}</dt>
            <dd className="mt-1 text-sm text-muted-foreground">{t(`policies.${key}Body`)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
