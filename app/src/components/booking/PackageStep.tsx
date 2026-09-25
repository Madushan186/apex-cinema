import { Check } from "lucide-react";
import { FeatureList } from "@/components/FeatureList";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import type { BookablePackageId, PackageDefinition } from "@/data/types";
import { useI18n } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

export function PackageStep({
  packages,
  selectedId,
  onSelect,
  onContinue,
}: {
  packages: readonly PackageDefinition[];
  selectedId: BookablePackageId | null;
  onSelect: (id: BookablePackageId) => void;
  onContinue: () => void;
}) {
  const { t } = useI18n();
  const bookable = packages.filter((pkg): pkg is PackageDefinition & { id: BookablePackageId } => pkg.isBookableOnline);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{t("booking.packageStep.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("booking.packageStep.subtitle")}</p>
      </div>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="sr-only">{t("booking.packageStep.title")}</legend>
        {bookable.map((pkg) => {
          const checked = selectedId === pkg.id;
          return (
            <label
              key={pkg.id}
              className={cn(
                "relative flex cursor-pointer flex-col gap-2 rounded-lg border p-4 transition-colors duration-150",
                checked ? "border-primary bg-primary/5" : "border-border bg-card hover:border-border-subtle",
              )}
            >
              <input
                type="radio"
                name="package"
                value={pkg.id}
                checked={checked}
                onChange={() => onSelect(pkg.id)}
                className="sr-only"
              />
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground">{t(`packages.tiers.${pkg.id}.name`)}</span>
                {checked ? <Check aria-hidden="true" className="size-4 text-primary" /> : null}
              </div>
              <p className="text-lg font-semibold text-foreground tabular-nums">
                {t("packages.priceLabel", { price: pkg.priceLKR.toLocaleString("en-LK") })}
              </p>
              <p className="text-xs text-muted-foreground">{t("common.perSession")}</p>
              <FeatureList featureIds={pkg.featureIds} className="mt-1" />
              <p className="mt-1 text-xs text-muted-foreground">
                {t("packages.capacityLabel", { count: pkg.maxPeople })}
              </p>
            </label>
          );
        })}
      </fieldset>

      <Notice variant="info">{t("common.perRoomNote")}</Notice>

      <div className="flex justify-end">
        <Button size="lg" disabled={!selectedId} onClick={onContinue}>
          {t("common.continue")}
        </Button>
      </div>
    </div>
  );
}
