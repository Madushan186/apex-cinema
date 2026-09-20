import { useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | undefined;
}

/** Runs `factory()` whenever `deps` change, tracking loading/data/error and ignoring stale responses. */
export function usePromise<T>(factory: () => Promise<T>, deps: React.DependencyList): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: undefined, loading: true, error: undefined });
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    // Synchronizing with an external system (the adapter's promise) is exactly
    // what this effect is for; the loading reset has to happen here so it
    // fires once per dependency change, not on every render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ data: undefined, loading: true, error: undefined });
    factory()
      .then((data) => {
        if (requestId.current === id) setState({ data, loading: false, error: undefined });
      })
      .catch((error: unknown) => {
        if (requestId.current === id) {
          setState({ data: undefined, loading: false, error: error instanceof Error ? error : new Error(String(error)) });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `factory` is intentionally excluded; callers pass a fresh closure each render and list their real deps explicitly.
  }, deps);

  return state;
}
