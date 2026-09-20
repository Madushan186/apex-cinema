import { Clock, MapPin } from "lucide-react";
import { ContactActions } from "@/components/ContactActions";
import { SectionHeading } from "@/components/SectionHeading";
import { Notice } from "@/components/ui/notice";
import { CONTACT_CONFIG } from "@/data";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useI18n } from "@/i18n/LocaleProvider";

export function Contact() {
  const { t } = useI18n();
  useDocumentTitle(t("nav.contact"));

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <SectionHeading title={t("contact.title")} subtitle={t("contact.subtitle")} />

      <div className="mt-8 flex flex-col gap-6">
        <div className="flex items-start gap-3">
          <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold" />
          <div>
            <p className="font-medium text-foreground">{t("contact.hoursTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("contact.hoursBody")}</p>
          </div>
        </div>

        <div className="flex items-start gap-3">
          <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-gold" />
          <div>
            <p className="font-medium text-foreground">{t("contact.addressTitle")}</p>
            {CONTACT_CONFIG.address ? (
              <p className="text-sm text-muted-foreground">{CONTACT_CONFIG.address}</p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("contact.addressUnavailable")}</p>
            )}
          </div>
        </div>

        <div>
          <ContactActions />
        </div>

        <Notice variant="info">{t("common.demoNotice")}</Notice>
      </div>
    </div>
  );
}
