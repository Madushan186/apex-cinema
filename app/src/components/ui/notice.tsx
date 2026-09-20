import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

const ICONS = {
  info: Info,
  demo: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
} as const;

const STYLES = {
  info: "border-border bg-elevated text-foreground",
  demo: "border-gold/40 bg-gold/10 text-gold",
  success: "border-status-positive/40 bg-status-positive/10 text-status-positive",
  warning: "border-status-warning/40 bg-status-warning/10 text-status-warning",
  error: "border-status-negative/40 bg-status-negative/10 text-status-negative",
} as const;

type NoticeVariant = keyof typeof ICONS;

/**
 * Always pairs an icon with text — status must never be colour-only (see
 * docs/DESIGN.md). Use `variant="demo"` for the recurring "Demo — no real
 * booking or payment" banner.
 */
export function Notice({
  variant = "info",
  children,
  className,
  ...props
}: { variant?: NoticeVariant } & React.ComponentProps<"div">) {
  const Icon = ICONS[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-sm leading-snug",
        STYLES[variant],
        className,
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
