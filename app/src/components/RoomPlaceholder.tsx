import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * No real room photography has been supplied yet (see docs/PROGRESS.md) —
 * this is a deliberately abstract, clearly-labelled placeholder, never
 * presented as a photo of the actual venue (CLAUDE.md rule 9).
 */
export function RoomPlaceholder({ label, caption, className }: { label: string; caption: string; className?: string }) {
  return (
    <div
      className={cn(
        "group relative flex aspect-[4/3] flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-border-subtle bg-gradient-to-br from-elevated via-card to-background px-4 text-center transition-colors duration-150 hover:border-gold/40",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(115deg, transparent 40%, rgba(201,24,37,0.12) 50%, transparent 60%)",
        }}
      />
      {/* A thin corner frame, echoing a film-strip sprocket edge — a small,
          restrained nod to the subject matter rather than plain empty
          space, never presented as an actual photo. */}
      <div aria-hidden="true" className="absolute inset-3 rounded-md border border-border-subtle/60" />
      <ImageIcon aria-hidden="true" className="relative size-6 text-muted-foreground transition-colors duration-150 group-hover:text-gold" />
      <p className="relative text-sm font-medium text-foreground">{label}</p>
      <p className="relative text-xs text-muted-foreground">{caption}</p>
    </div>
  );
}
