import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium w-fit whitespace-nowrap",
  {
    variants: {
      variant: {
        default: "border-border-subtle bg-elevated text-foreground",
        gold: "border-gold/40 bg-gold/10 text-gold",
        outline: "border-border text-foreground",
        positive: "border-status-positive/40 bg-status-positive/10 text-status-positive",
        warning: "border-status-warning/40 bg-status-warning/10 text-status-warning",
        negative: "border-status-negative/40 bg-status-negative/10 text-status-negative",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

// eslint-disable-next-line react-refresh/only-export-components -- standard shadcn/ui pattern: badgeVariants is a cva config, not a component.
export { Badge, badgeVariants };
