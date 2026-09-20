import { AlertCircle } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/** Wires up label/input/help/error with matching ids so screen readers announce validation state. */
export function Field({
  label,
  help,
  error,
  required,
  className,
  children,
}: {
  label: string;
  help?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (fieldProps: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
}) {
  const id = useId();
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </Label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": Boolean(error) })}
      {help && !error ? (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="flex items-center gap-1 text-xs text-status-negative">
          <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </div>
  );
}
