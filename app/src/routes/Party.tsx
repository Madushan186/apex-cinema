import { PartyPopper } from "lucide-react";
import { ContactActions } from "@/components/ContactActions";
import { FeatureList } from "@/components/FeatureList";
import { RoomPlaceholder } from "@/components/RoomPlaceholder";
import { SectionHeading } from "@/components/SectionHeading";
import { Notice } from "@/components/ui/notice";
import { PACKAGE_FIXTURES } from "@/data/fixtures/packages";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useI18n } from "@/i18n/LocaleProvider";

const PARTY_PACKAGE = PACKAGE_FIXTURES.find((pkg) => pkg.id === "party");

export function Party() {
  const { t } = useI18n();
  useDocumentTitle(t("nav.party"));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
      <div className="flex flex-col items-start gap-3">
        <span className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
          <PartyPopper aria-hidden="true" className="size-3.5" />
          {t("nav.party")}
        </span>
        <SectionHeading title={t("party.title")} subtitle={t("party.subtitle")} />
      </div>

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        <RoomPlaceholder label={t("rooms.labels.party")} caption={t("rooms.placeholderCaption")} className="md:aspect-auto md:h-full" />

        <div className="flex flex-col gap-6">
          <div>
            <p className="text-2xl font-semibold text-foreground tabular-nums">{t("party.priceLabel")}</p>
            <p className="text-xs text-muted-foreground">{t("party.priceNote")}</p>
          </div>

          {PARTY_PACKAGE ? (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-foreground">{t("party.detailsTitle")}</h3>
              <FeatureList featureIds={PARTY_PACKAGE.featureIds} />
            </div>
          ) : null}

          <Notice variant="warning">
            <p className="font-medium">{t("party.noticeTitle")}</p>
            <p>{t("party.noticeBody")}</p>
          </Notice>

          <Notice variant="info">
            <p className="font-medium">{t("party.durationTitle")}</p>
            <p>{t("party.durationBody")}</p>
          </Notice>
        </div>
      </div>

      <div className="mt-10 border-t border-border-subtle pt-8">
        <h2 className="text-lg font-semibold text-foreground">{t("party.contactTitle")}</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("party.contactBody")}</p>
        <ContactActions variant="contactUnavailableTitle" />
      </div>
    </div>
  );
}
