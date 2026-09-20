import type * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      data-slot="input"
      className={cn(
        "flex h-10 w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/70",
        "outline-none transition-colors focus-visible:border-gold focus-visible:ring-2 focus-visible:ring-ring/50",
        "aria-invalid:border-status-negative aria-invalid:ring-status-negative/30",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
