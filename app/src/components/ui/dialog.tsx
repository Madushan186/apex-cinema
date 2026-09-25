import { useEffect, useRef } from "react";
import type { ReactNode, RefObject } from "react";
import { cn } from "@/lib/utils";

/**
 * Thin wrapper around the native <dialog> element — chosen over a custom
 * focus-trap implementation or an added dependency (no @radix-ui/react-
 * dialog in this repo) because `showModal()` gives real browser-native
 * focus trapping, Escape-to-close, and focus restoration on close for
 * free, in every evergreen browser, with zero extra JS.
 */
export function Dialog({
  open,
  onOpenChange,
  titleId,
  children,
  className,
  initialFocusRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Must match the id of the element inside `children` that labels this dialog (e.g. its heading). */
  titleId: string;
  children: ReactNode;
  className?: string;
  /**
   * Focused right after `showModal()`, in the same effect — doing this
   * here (not in a child component's own effect) guarantees the ordering:
   * React fires child effects before parent effects, so a focus attempt
   * from inside `children` could run before this dialog is even modal yet,
   * silently failing. Optional — native `showModal()` already focuses the
   * dialog itself by default when this isn't given.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      initialFocusRef?.current?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, initialFocusRef]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={() => onOpenChange(false)}
      // The native <dialog> fires "cancel" on Escape — mapped to the same
      // close handler so Escape and every other close path stay in sync.
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        // A click directly on the <dialog> element itself (not on any of
        // its content, which stops propagation via the flex wrapper's own
        // click) means the backdrop was clicked — close on that, a common
        // and expected dialog interaction.
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      className={cn(
        "m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-border bg-card p-0 text-foreground shadow-[var(--shadow-elevated)] backdrop:bg-black/70",
        className,
      )}
    >
      {open ? children : null}
    </dialog>
  );
}
