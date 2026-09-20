import { ChevronDown } from "lucide-react";
import { useI18n } from "@/i18n/LocaleProvider";

const ALL_FAQ_KEYS = ["slots", "room", "people", "extension", "party", "cancellation"] as const;
type FaqKey = (typeof ALL_FAQ_KEYS)[number];

/** Native <details>/<summary> — accessible disclosure with zero JS or extra dependency. */
export function FaqAccordion({ itemKeys = ALL_FAQ_KEYS }: { itemKeys?: readonly FaqKey[] }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col divide-y divide-border-subtle rounded-lg border border-border-subtle bg-card">
      {itemKeys.map((key) => (
        <details key={key} className="group p-4 open:pb-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-medium text-foreground marker:content-none">
            {t(`faq.items.${key}.q`)}
            <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <p className="mt-2 text-sm text-muted-foreground">{t(`faq.items.${key}.a`)}</p>
        </details>
      ))}
    </div>
  );
}
