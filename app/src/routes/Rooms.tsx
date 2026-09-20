import { RoomPlaceholder } from "@/components/RoomPlaceholder";
import { SectionHeading } from "@/components/SectionHeading";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useI18n } from "@/i18n/LocaleProvider";
import type { PackageId } from "@/data/types";

const ROOM_IDS: PackageId[] = ["non-ac", "ac-small", "ac-large", "party"];

export function Rooms() {
  const { t } = useI18n();
  useDocumentTitle(t("nav.rooms"));

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <SectionHeading title={t("rooms.title")} subtitle={t("rooms.subtitle")} />
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {ROOM_IDS.map((id) => (
          <RoomPlaceholder key={id} label={t(`rooms.labels.${id}`)} caption={t("rooms.placeholderCaption")} />
        ))}
      </div>
    </div>
  );
}
