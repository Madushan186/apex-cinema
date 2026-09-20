import { useEffect, useState } from "react";

/** Ticks once a second; returns remaining ms (clamped to 0) from `startedAt` + `durationMs`. */
export function useCountdown(startedAt: number | null, durationMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (startedAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  if (startedAt === null) return durationMs;
  return Math.max(0, startedAt + durationMs - now);
}

/** Ticks once a second; returns remaining ms (clamped to 0) until a server-given absolute deadline. */
export function useCountdownUntil(targetMillis: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMillis === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetMillis]);

  if (targetMillis === null) return 0;
  return Math.max(0, targetMillis - now);
}

export function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
