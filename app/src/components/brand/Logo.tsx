import { cn } from "@/lib/utils";

/**
 * The supplied brand asset is `public/brand/Logo (1).png` (not a filename we
 * chose — see docs/PROGRESS.md). It is referenced exactly as supplied and
 * never redrawn, recoloured, or filtered here. The file has generous
 * transparent padding baked in around the wordmark (for its glow effect);
 * we account for that with a sizing wrapper rather than cropping the image.
 */
const LOGO_SRC = "/brand/Logo%20(1).png";
const LOGO_INTRINSIC_WIDTH = 1536;
const LOGO_INTRINSIC_HEIGHT = 1024;

const SIZES = {
  header: "h-14 sm:h-16",
  footer: "h-16 sm:h-20",
  hero: "h-20 sm:h-28 md:h-32",
} as const;

export function Logo({
  size = "header",
  className,
  priority = false,
}: {
  size?: keyof typeof SIZES;
  className?: string;
  priority?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center", SIZES[size], className)}>
      <img
        src={LOGO_SRC}
        width={LOGO_INTRINSIC_WIDTH}
        height={LOGO_INTRINSIC_HEIGHT}
        alt="Apex Cinema"
        className="h-full w-auto object-contain"
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
      />
    </span>
  );
}
