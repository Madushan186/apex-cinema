import type { BookingPreviewResult } from "@/data/types";
import type { TranslateFn } from "@/lib/bookingValidation";

/**
 * Generates a plain-text "confirmation" clearly watermarked as a demo (per
 * the booking phase brief) and triggers a browser download of it. This is a
 * real customer-facing download (not an Artifact preview), so a plain
 * anchor-click download works normally here.
 */
export function downloadDemoConfirmation({
  t,
  preview,
  packageName,
  dateLabel,
  timeLabel,
  peopleCount,
}: {
  t: TranslateFn;
  preview: BookingPreviewResult;
  packageName: string;
  dateLabel: string;
  timeLabel: string;
  peopleCount: number;
}): void {
  const lines = [
    t("demoDownload.heading"),
    `*** ${t("demoDownload.watermark")} ***`,
    "",
    `${t("booking.result.confirmed.referenceLabel")}: ${preview.referenceCode}`,
    `${t("booking.review.packageLabel")}: ${packageName}`,
    `${t("booking.review.dateLabel")}: ${dateLabel}`,
    `${t("booking.review.timeLabel")}: ${timeLabel}`,
    `${t("booking.review.peopleLabel")}: ${peopleCount}`,
    `${t("booking.result.confirmed.amountLabel")}: LKR ${preview.totalLKR.toLocaleString("en-LK")} (${t("booking.result.confirmed.amountSimulatedNote")})`,
    "",
    `*** ${t("demoDownload.watermark")} ***`,
  ];

  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `apex-cinema-DEMO-${preview.referenceCode}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
