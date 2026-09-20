import { Link } from "react-router";
import { FeatureList } from "@/components/FeatureList";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { BookablePackageId, PackageDefinition } from "@/data/types";
import { useI18n } from "@/i18n/LocaleProvider";

/**
 * Renders one of the three bookable packages (never Party — see the
 * dedicated section in routes/Packages.tsx). No room number is shown here;
 * `pkg.roomLabel` stays in the data model for a future staff view — see
 * docs/PROGRESS.md.
 */
export function PackageCard({
  pkg,
  compact = false,
}: {
  pkg: PackageDefinition & { id: BookablePackageId };
  compact?: boolean;
}) {
  const { t } = useI18n();

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <CardTitle className="text-lg">{t(`packages.tiers.${pkg.id}.name`)}</CardTitle>
        <p className="text-sm text-muted-foreground">{t(`packages.tiers.${pkg.id}.tagline`)}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div>
          <p className="text-2xl font-semibold text-foreground">
            {t("packages.priceLabel", { price: pkg.priceLKR.toLocaleString("en-LK") })}
          </p>
          <p className="text-xs text-muted-foreground">{t("common.perSession")}</p>
        </div>
        {!compact ? <FeatureList featureIds={pkg.featureIds} /> : null}
        <p className="text-sm text-muted-foreground">{t("packages.capacityLabel", { count: pkg.maxPeople })}</p>
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link to={`/book?package=${pkg.id}`}>{t("packages.bookThis")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
