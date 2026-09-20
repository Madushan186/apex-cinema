import { FaqAccordion } from "@/components/FaqAccordion";
import { SectionHeading } from "@/components/SectionHeading";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useI18n } from "@/i18n/LocaleProvider";

export function Faq() {
  const { t } = useI18n();
  useDocumentTitle(t("nav.faq"));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <SectionHeading title={t("faq.title")} subtitle={t("faq.subtitle")} />
      <div className="mt-8">
        <FaqAccordion />
      </div>
    </div>
  );
}
