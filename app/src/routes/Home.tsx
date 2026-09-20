import { CalendarCheck, ClipboardList, PartyPopper, Ticket } from "lucide-react";
import { Link } from "react-router";
import { FaqAccordion } from "@/components/FaqAccordion";
import { HeroBackground } from "@/components/HeroBackground";
import { PackageCard } from "@/components/PackageCard";
import { RoomPlaceholder } from "@/components/RoomPlaceholder";
import { SectionHeading } from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { packagesAdapter } from "@/data";
import type { BookablePackageId, PackageDefinition, PackageId } from "@/data/types";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePromise } from "@/hooks/usePromise";
import { useI18n } from "@/i18n/LocaleProvider";

const GALLERY_IDS: PackageId[] = ["non-ac", "ac-small", "ac-large", "party"];

export function Home() {
  const { t } = useI18n();
  useDocumentTitle(t("nav.home"));
  const { data: packages, loading, error } = usePromise(() => packagesAdapter.listPackages(), []);
  const bookablePackages = packages?.filter(
    (pkg): pkg is PackageDefinition & { id: BookablePackageId } => pkg.isBookableOnline,
  );

  return (
    <>
      <section className="relative border-b border-border-subtle">
        <HeroBackground />
        <div className="relative mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-20 sm:px-6 sm:py-28">
          <span className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">{t("home.heroEyebrow")}</span>
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl md:text-6xl">
            {t("home.heroTitle")}
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">{t("home.heroSubtitle")}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/book">{t("home.heroCtaPrimary")}</Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to="/packages">{t("home.heroCtaSecondary")}</Link>
            </Button>
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Ticket aria-hidden="true" className="size-4 text-gold" />
              <span>{t("home.factsSession")}</span>
            </div>
            <div className="flex items-center gap-2">
              <CalendarCheck aria-hidden="true" className="size-4 text-gold" />
              <span>{t("home.factsHours")}</span>
            </div>
            <div className="flex items-center gap-2">
              <ClipboardList aria-hidden="true" className="size-4 text-gold" />
              <span>{t("home.factsFrom")}</span>
            </div>
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionHeading title={t("home.packagesTitle")} subtitle={t("home.packagesSubtitle")} />
        <div className="mt-8">
          {loading ? <Notice variant="info">{t("common.loading")}</Notice> : null}
          {error ? (
            <Notice variant="error">
              <p>{t("booking.datetime.errorBody")}</p>
            </Notice>
          ) : null}
          {bookablePackages ? (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {bookablePackages.map((pkg) => (
                <PackageCard key={pkg.id} pkg={pkg} compact />
              ))}
            </div>
          ) : null}
        </div>
        <div className="mt-6">
          <Button asChild variant="ghost">
            <Link to="/packages">{t("home.packagesCta")}</Link>
          </Button>
        </div>
      </section>

      <section className="border-t border-border-subtle bg-section py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <SectionHeading title={t("home.galleryTitle")} subtitle={t("home.gallerySubtitle")} />
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {GALLERY_IDS.map((id) => (
              <RoomPlaceholder
                key={id}
                label={t(`rooms.labels.${id}`)}
                caption={t("rooms.placeholderCaption")}
              />
            ))}
          </div>
          <div className="mt-6">
            <Button asChild variant="ghost">
              <Link to="/rooms">{t("home.galleryCta")}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <SectionHeading title={t("home.howTitle")} subtitle={t("home.howSubtitle")} align="center" />
        <ol className="mt-10 grid gap-6 sm:grid-cols-3">
          {[
            { title: t("home.howStep1Title"), body: t("home.howStep1Body") },
            { title: t("home.howStep2Title"), body: t("home.howStep2Body") },
            { title: t("home.howStep3Title"), body: t("home.howStep3Body") },
          ].map((step, index) => (
            <li key={step.title} className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-card p-6">
              <span className="text-sm font-semibold text-gold">{String(index + 1).padStart(2, "0")}</span>
              <p className="font-medium text-foreground">{step.title}</p>
              <p className="text-sm text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="border-t border-border-subtle bg-section py-16">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-4 px-4 sm:px-6">
          <PartyPopper aria-hidden="true" className="size-8 text-primary" />
          <SectionHeading title={t("home.partyTitle")} subtitle={t("home.partyBody")} />
          <Button asChild variant="secondary">
            <Link to="/party">{t("home.partyCta")}</Link>
          </Button>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <SectionHeading title={t("home.faqTitle")} align="center" />
        <div className="mt-8">
          <FaqAccordion itemKeys={["slots", "room", "party"]} />
        </div>
        <div className="mt-6 flex justify-center">
          <Button asChild variant="ghost">
            <Link to="/faq">{t("home.faqCta")}</Link>
          </Button>
        </div>
      </section>
    </>
  );
}
