import { Users } from "lucide-react";
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
 *
 * Price → capacity → features always appear in this same order and at the
 * same position in every card (a fixed-height header/price block, capacity
 * directly under it) so three cards side by side scan as a real
 * comparison, not three unrelated paragraphs — the explicit goal for this
 * component (docs/PROGRESS.md UI-polish phase).
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
    <Card className="flex h-full flex-col transition-shadow duration-200 hover:shadow-[var(--shadow-elevated)]">
      <CardHeader>
        <CardTitle className="text-lg">{t(`packages.tiers.${pkg.id}.name`)}</CardTitle>
        <p className="text-sm text-muted-foreground">{t(`packages.tiers.${pkg.id}.tagline`)}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <p className="text-2xl font-semibold text-foreground tabular-nums">
              {t("packages.priceLabel", { price: pkg.priceLKR.toLocaleString("en-LK") })}
            </p>
            <p className="text-xs text-muted-foreground">{t("common.perSession")}</p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-border-subtle bg-elevated px-2.5 py-1 text-xs font-medium text-foreground">
            <Users aria-hidden="true" className="size-3.5 text-gold" />
            {t("packages.capacityLabel", { count: pkg.maxPeople })}
          </span>
        </div>
        {!compact ? <FeatureList featureIds={pkg.featureIds} /> : null}
      </CardContent>
      <CardFooter>
        <Button asChild className="w-full">
          <Link to={`/book?package=${pkg.id}`}>{t("packages.bookThis")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
