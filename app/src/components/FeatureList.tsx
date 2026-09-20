import { Clapperboard, Fan, Gamepad2, type LucideIcon, Mic2, PartyPopper, Projector, Snowflake, Speaker } from "lucide-react";
import type { FeatureId } from "@/data/types";
import { useI18n } from "@/i18n/LocaleProvider";
import { cn } from "@/lib/utils";

const FEATURE_ICONS: Record<FeatureId, LucideIcon> = {
  ps4: Gamepad2,
  "streaming-4k": Clapperboard,
  "projector-4k": Projector,
  ac: Snowflake,
  "non-ac": Fan,
  "balloon-decor": PartyPopper,
  karaoke: Mic2,
  "jbl-party-box": Speaker,
};

export function FeatureList({ featureIds, className }: { featureIds: readonly FeatureId[]; className?: string }) {
  const { t } = useI18n();
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {featureIds.map((id) => {
        const Icon = FEATURE_ICONS[id];
        return (
          <li key={id} className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icon aria-hidden="true" className="size-4 shrink-0 text-gold" />
            <span>{t(`common.features.${id}`)}</span>
          </li>
        );
      })}
    </ul>
  );
}
