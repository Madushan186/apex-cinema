import { Mail, MessageCircle, Phone } from "lucide-react";
import { CONTACT_CONFIG } from "@/data";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useI18n } from "@/i18n/LocaleProvider";

/**
 * Renders real WhatsApp/Call/Email actions only when configured (never a
 * dead "#" link or an invented number — see data/fixtures/contact.ts and
 * CLAUDE.md rule 9). Shows an honest "not available yet" notice otherwise.
 */
export function ContactActions({ variant = "unavailableTitle" }: { variant?: "unavailableTitle" | "contactUnavailableTitle" }) {
  const { t } = useI18n();
  const { whatsappNumber, callNumber, email } = CONTACT_CONFIG;
  const hasAny = whatsappNumber || callNumber || email;

  if (!hasAny) {
    return (
      <Notice variant="warning">
        <p className="font-medium">{t(variant === "contactUnavailableTitle" ? "party.contactUnavailableTitle" : "contact.unavailableTitle")}</p>
        <p>{t(variant === "contactUnavailableTitle" ? "party.contactUnavailableBody" : "contact.unavailableBody")}</p>
      </Notice>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      {whatsappNumber ? (
        <Button asChild>
          <a href={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">
            <MessageCircle aria-hidden="true" />
            {t("contact.whatsappCta")}
          </a>
        </Button>
      ) : null}
      {callNumber ? (
        <Button asChild variant="secondary">
          <a href={`tel:${callNumber}`}>
            <Phone aria-hidden="true" />
            {t("contact.callCta")}
          </a>
        </Button>
      ) : null}
      {email ? (
        <Button asChild variant="secondary">
          <a href={`mailto:${email}`}>
            <Mail aria-hidden="true" />
            {t("contact.emailCta")}
          </a>
        </Button>
      ) : null}
    </div>
  );
}
