import { PartyPopper } from "lucide-react";
import { Link } from "react-router";
import { FeatureList } from "@/components/FeatureList";
import { PackageCard } from "@/components/PackageCard";
import { SectionHeading } from "@/components/SectionHeading";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { packagesAdapter } from "@/data";
import type { BookablePackageId, PackageDefinition } from "@/data/types";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePromise } from "@/hooks/usePromise";
import { useI18n } from "@/i18n/LocaleProvider";

export function Packages() {
  const { t } = useI18n();
  useDocumentTitle(t("nav.packages"));
  const { data: packages, loading, error } = usePromise(() => packagesAdapter.listPackages(), []);

  const standardPackages = packages?.filter(
    (pkg): pkg is PackageDefinition & { id: BookablePackageId } => pkg.isBookableOnline,
  );
  const party = packages?.find((pkg) => pkg.id === "party");

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading eyebrow={t("common.perRoomNote")} title={t("packages.title")} subtitle={t("packages.subtitle")} />

      {loading ? (
        <div className="mt-8">
          <Notice variant="info">{t("common.loading")}</Notice>
        </div>
      ) : null}
      {error ? (
        <div className="mt-8">
          <Notice variant="error">{t("booking.datetime.errorBody")}</Notice>
        </div>
      ) : null}

      {standardPackages ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {standardPackages.map((pkg) => (
            <PackageCard key={pkg.id} pkg={pkg} />
          ))}
        </div>
      ) : null}

      <p className="mt-6 text-sm text-muted-foreground">{t("packages.extensionNote")}</p>

      {party ? (
        <section className="mt-10 rounded-xl border border-primary/30 bg-elevated p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
            <div className="flex flex-col gap-3">
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary uppercase">
                <PartyPopper aria-hidden="true" className="size-3.5" />
                {t("nav.party")}
              </span>
              <h3 className="text-xl font-semibold text-foreground">{t("packages.tiers.party.name")}</h3>
              <p className="max-w-md text-sm text-muted-foreground">{t("packages.tiers.party.tagline")}</p>
              <FeatureList featureIds={party.featureIds} className="max-w-md" />
            </div>

            <div className="flex flex-col gap-3 lg:w-72 lg:shrink-0">
              <div>
                <p className="text-2xl font-semibold text-foreground">
                  {t("packages.priceLabel", { price: party.priceLKR.toLocaleString("en-LK") })}
                </p>
                <p className="text-xs text-muted-foreground">{t("common.perSessionNoDuration")}</p>
              </div>
              <p className="text-sm text-muted-foreground">{t("packages.capacityLabel", { count: party.maxPeople })}</p>
              <div className="flex flex-col gap-1 text-xs text-muted-foreground">
                <p>{t("packages.tiers.party.contactOnly")}</p>
                <p>{t("packages.tiers.party.noticeRule")}</p>
                <p>{t("packages.tiers.party.durationUnknown")}</p>
              </div>
              <Button asChild variant="secondary">
                <Link to="/party">{t("packages.contactForParty")}</Link>
              </Button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
