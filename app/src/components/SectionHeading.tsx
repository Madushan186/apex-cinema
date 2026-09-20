import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", align === "center" && "items-center text-center", className)}>
      {eyebrow ? (
        <span className="text-xs font-semibold tracking-[0.2em] text-gold uppercase">{eyebrow}</span>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
      {subtitle ? <p className="max-w-2xl text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}
