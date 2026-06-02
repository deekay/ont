import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  loading: boolean;
  refreshing: boolean;
  reload: () => void;
  refresh: () => void;
}

/**
 * Minimal data-fetching hook: runs `fn` on mount and whenever `deps` change,
 * exposes loading/refreshing/error, and offers manual reload + pull-to-refresh.
 * Deliberately dependency-free to stay robust on bleeding-edge RN.
 */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<Error | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (mode: "load" | "refresh") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    setError(undefined);
    try {
      const result = await fnRef.current();
      if (mounted.current) setData(result);
    } catch (err) {
      if (mounted.current) setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      if (mounted.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    run("load");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const reload = useCallback(() => run("load"), [run]);
  const refresh = useCallback(() => run("refresh"), [run]);

  return { data, error, loading, refreshing, reload, refresh };
}
