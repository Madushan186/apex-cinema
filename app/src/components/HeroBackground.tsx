/**
 * Abstract CSS-only cinematic composition — not a photo of the venue (none
 * exists yet, see docs/PROGRESS.md). Pure gradients + one clipped shape
 * echoing the logo's X; no images, no WebGL, no autoplay video, and no
 * animation that would need a prefers-reduced-motion override beyond the
 * global one in index.css.
 */
export function HeroBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute -top-24 right-[-10%] size-[36rem] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-primary) 0%, transparent 70%)" }}
      />
      <div
        className="absolute bottom-[-15%] left-[-10%] size-[30rem] rounded-full opacity-[0.15] blur-3xl"
        style={{ background: "radial-gradient(circle, var(--color-gold) 0%, transparent 70%)" }}
      />
      <div
        className="absolute inset-y-0 right-0 w-1/2 opacity-[0.08]"
        style={{
          background: "var(--color-primary)",
          clipPath: "polygon(60% 0%, 100% 0%, 40% 100%, 0% 100%)",
        }}
      />
      <div
        className="absolute inset-y-0 right-[8%] w-px opacity-30"
        style={{ background: "linear-gradient(to bottom, transparent, var(--color-gold), transparent)" }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
    </div>
  );
}
